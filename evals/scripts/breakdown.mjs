// Where one run's tokens, calls and injected bytes go, read from its trace (and the ledger kept beside it).
// Usage: node evals/scripts/breakdown.mjs <trace.jsonl | dir>... [--json]
//        node evals/scripts/breakdown.mjs --latest <tracesRoot> [--json]   (latest dir holding each case, plugin and bare)
// Main-session calls only count as calls; subagent calls (parent_tool_use_id set) are reported apart, as in context.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextTokens, events, mean } from './trace.mjs';

// $/Mtok of claude-sonnet-5-5, fitted to total_cost_usd of 113 bare and 152 plugin traces without a subagent: max error 7e-16.
// Cache writes are priced at 4 here; a subagent's 5-minute writes are cheaper (2.5), so costs split below are approximate for subagents.
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 4 };
// Cost of work a bare model would do with its own tools, even though the plugin wraps it: not route plumbing.
const WORK_VERBS = new Set(['check']);
const MARKER = /\[ambicode\] [\w-]+ · task [\w-]+ · (?:step ([\w-]+)|(complete))/;

const bytes = (text) => Buffer.byteLength(text ?? '');
const textOf = (content) => (typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? (typeof part.content === 'string' ? part.content : '')).join('\n'));

export const priceOf = (usage) => ((usage.input_tokens ?? 0) * PRICE.input + (usage.output_tokens ?? 0) * PRICE.output + (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6;

/** `route next`, `review record`, `format`...: the CLI verb of a Bash command that runs ambicode.mjs, or null for any other command. */
export function verbOf(command) {
  const match = /ambicode\.mjs"?\s+((?:[a-z][\w-]*)(?:\s+[a-z][\w-]*)?)/.exec(command ?? '');
  if (!match) return null;
  const words = match[1].split(/\s+/);
  const sub = ['route', 'review', 'note', 'context', 'config'];
  return sub.includes(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

/** Bytes the ledger says were delivered, by step: what hooks injected (channel hook) and what CLI replies carried (channel cli). */
export function ledgerOf(ledgerText) {
  const delivered = [];
  let skill = null;
  for (const entry of events(ledgerText ?? '')) {
    if (entry.kind === 'route' && !skill) skill = entry.skill ?? null;
    if (entry.kind === 'step' && entry.status === 'delivered') delivered.push({ step: entry.step, channel: entry.channel, bytes: entry.bytes ?? 0 });
  }
  const sum = (channel) => delivered.filter((d) => d.channel === channel).reduce((total, d) => total + d.bytes, 0);
  return { skill, delivered, hookBytes: sum('hook'), cliBytes: sum('cli') };
}

/**
 * One run's accounting. `ledgerText` (optional) names the first, hook-delivered step and its bytes;
 * `skillBytes` (optional) is the size of the SKILL.md the slash command loaded, which the trace does not show.
 */
export function breakdownOf(traceText, { ledgerText = null, skillBytes = null } = {}) {
  const ledger = ledgerOf(ledgerText);
  const main = new Map();
  const sub = new Map();
  const steps = {};
  const verbs = {};
  const stepMessages = [];
  const stopBlocks = [];
  const hooks = [];
  const toolUses = new Map();
  let current = ledger.delivered.find((d) => d.channel === 'hook')?.step ?? 'start';
  let result = null;
  let subTotalTokens = 0;
  let plumbing = 0;
  let work = 0;
  let delegate = 0;
  let toolCalls = 0;
  let lastAt = null;
  const timing = { modelSeconds: 0, toolSeconds: 0, byStep: {}, byTool: {} };
  const toolNames = new Map(); // tool_use id -> label for the time its result took

  for (const event of events(traceText)) {
    if (event.type === 'result') result = event;
    // Gaps between timestamped main-session events: assistant events are model time, user events are what ran before them (a tool, the hook).
    const at = event.timestamp && !event.parent_tool_use_id && (event.type === 'assistant' || event.type === 'user') ? Date.parse(event.timestamp) : null;
    if (at !== null) {
      if (lastAt !== null) {
        const seconds = (at - lastAt) / 1000;
        if (event.type === 'assistant') {
          timing.modelSeconds += seconds;
          timing.byStep[current] = (timing.byStep[current] ?? 0) + seconds;
        } else {
          const first = Array.isArray(event.message?.content) ? event.message.content.find((part) => part.type === 'tool_result') : null;
          const label = first ? (toolNames.get(first.tool_use_id) ?? 'tool') : 'hook';
          timing.toolSeconds += seconds;
          timing.byTool[label] = (timing.byTool[label] ?? 0) + seconds;
        }
      }
      lastAt = at;
    }
    if (event.type === 'system' && event.subtype === 'hook_response') hooks.push({ event: event.hook_event, bytes: bytes(event.output ?? event.stdout) });
    if (event.type === 'system' && event.subtype === 'task_notification') subTotalTokens += event.usage?.total_tokens ?? 0;
    if (event.type === 'assistant' && event.message?.usage) {
      const id = event.message.id;
      const into = event.parent_tool_use_id ? sub : main;
      if (!event.parent_tool_use_id && !main.has(id)) steps[current] = (steps[current] ?? 0) + 1;
      into.set(id, event.message.usage); // one API call streams as several events; the last carries the full usage
      if (event.parent_tool_use_id) continue;
      for (const part of event.message.content ?? []) {
        if (part.type !== 'tool_use' || toolUses.has(part.id)) continue;
        toolUses.set(part.id, part.name);
        toolCalls++;
        const verb = part.name === 'Bash' ? verbOf(part.input?.command) : null;
        toolNames.set(part.id, verb === null ? part.name : `ambicode ${verb}`);
        if (verb !== null && !WORK_VERBS.has(verb.split(' ')[0])) {
          plumbing++;
          verbs[verb] = (verbs[verb] ?? 0) + 1;
        } else if (['Agent', 'Task', 'Skill', 'ToolSearch'].includes(part.name)) delegate++;
        else work++;
      }
    }
    if (event.type === 'user' && !event.parent_tool_use_id) {
      const parts = Array.isArray(event.message?.content) ? event.message.content : [];
      for (const part of parts) {
        const text = part.type === 'tool_result' ? textOf(part.content) : part.type === 'text' ? part.text : '';
        if (part.type === 'text' && /^Stop hook feedback:/.test(text)) {
          stopBlocks.push(bytes(text));
          current = 'stop-feedback';
        }
        const marker = part.type === 'tool_result' ? MARKER.exec(text) : null;
        if (marker) {
          const from = text.lastIndexOf('\n', marker.index) + 1;
          current = marker[1] ?? 'complete';
          stepMessages.push({ step: current, bytes: bytes(text.slice(from)) });
        }
      }
    }
  }

  const sum = (map, pick) => [...map.values()].reduce((total, usage) => total + pick(usage), 0);
  const usage = result?.usage ?? null;
  const cost = result?.total_cost_usd ?? null;
  const mainCost = usage ? priceOf(usage) : [...main.values()].reduce((total, u) => total + priceOf(u), 0);
  return {
    modelCalls: main.size,
    toolCalls,
    inputTokens: sum(main, contextTokens),
    // The streamed snapshots under-report output; the result line's usage is the main session's final count.
    outputTokens: usage?.output_tokens ?? sum(main, (u) => u.output_tokens ?? 0),
    seconds: result?.duration_ms == null ? null : result.duration_ms / 1000,
    costUsd: cost,
    mainCostUsd: mainCost,
    // total_cost_usd minus the main session's own usage priced the same way: what the subagents were charged.
    subagentCostUsd: cost == null ? null : Math.max(0, cost - mainCost),
    steps,
    timing,
    plumbingCalls: plumbing,
    workCalls: work,
    delegateCalls: delegate,
    verbs,
    injected: {
      sessionStartBytes: hooks.filter((h) => h.event === 'SessionStart').reduce((total, h) => total + h.bytes, 0),
      otherHookBytes: hooks.filter((h) => h.event !== 'SessionStart').reduce((total, h) => total + h.bytes, 0),
      skillBytes,
      stepMessages,
      stepMessageBytes: stepMessages.reduce((total, m) => total + m.bytes, 0),
      stopBlocks,
      ledgerHookBytes: ledger.hookBytes,
      ledgerCliBytes: ledger.cliBytes,
    },
    subagent: {
      calls: sub.size,
      inputTokens: sum(sub, contextTokens),
      outputTokens: sum(sub, (u) => u.output_tokens ?? 0),
      reportedTotalTokens: subTotalTokens,
      spawned: result?.subagent_stats?.spawned ?? 0,
    },
    skill: ledger.skill,
  };
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(child);
    else yield child;
  }
}

/** The kept ledgers of a trace (`<trace>.ambicode/**\/ledger.jsonl`: tasks/ and reviews/), concatenated; null when none was kept. */
export function ledgerTextOf(tracePath) {
  const dir = tracePath.replace(/\.jsonl$/, '.ambicode');
  if (!existsSync(dir)) return null;
  const files = [...walk(dir)].filter((file) => path.basename(file) === 'ledger.jsonl');
  return files.length === 0 ? null : files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

/** Per case, the traces of the latest run directory that holds it: `{case: [tracePath x runs]}`. */
export function latestByCase(armDir) {
  const found = new Map();
  for (const run of readdirSync(armDir).sort()) {
    const dir = path.join(armDir, run);
    if (!statSync(dir).isDirectory()) continue;
    const byCase = new Map();
    for (const file of readdirSync(dir)) {
      const match = /^(.+)-(\d+)\.jsonl$/.exec(file);
      if (match) byCase.set(match[1], [...(byCase.get(match[1]) ?? []), path.join(dir, file)]);
    }
    for (const [name, files] of byCase) found.set(name, files); // later directories overwrite earlier ones
  }
  return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
}


/** Mean of every numeric field, and of every key of `steps`, `verbs`, over runs. */
export function meanOf(runs) {
  const keys = (pick) => [...new Set(runs.flatMap((run) => Object.keys(pick(run))))];
  const avg = (pick) => mean(runs.map((run) => pick(run) ?? 0));
  const table = (pick) => Object.fromEntries(keys(pick).map((key) => [key, avg((run) => pick(run)[key])]));
  const out = { runs: runs.length };
  for (const field of ['modelCalls', 'toolCalls', 'inputTokens', 'outputTokens', 'seconds', 'costUsd', 'mainCostUsd', 'subagentCostUsd', 'plumbingCalls', 'workCalls', 'delegateCalls']) out[field] = avg((run) => run[field]);
  out.steps = table((run) => run.steps);
  out.timing = { modelSeconds: avg((run) => run.timing.modelSeconds), toolSeconds: avg((run) => run.timing.toolSeconds), byStep: table((run) => run.timing.byStep), byTool: table((run) => run.timing.byTool) };
  out.verbs = table((run) => run.verbs);
  out.injected = {
    sessionStartBytes: avg((run) => run.injected.sessionStartBytes),
    skillBytes: avg((run) => run.injected.skillBytes),
    stepMessageBytes: avg((run) => run.injected.stepMessageBytes),
    ledgerHookBytes: avg((run) => run.injected.ledgerHookBytes),
    ledgerCliBytes: avg((run) => run.injected.ledgerCliBytes),
    stopBlocks: avg((run) => run.injected.stopBlocks.length),
    stopBlockBytes: avg((run) => run.injected.stopBlocks.reduce((total, b) => total + b, 0)),
  };
  out.subagent = { calls: avg((run) => run.subagent.calls), inputTokens: avg((run) => run.subagent.inputTokens), outputTokens: avg((run) => run.subagent.outputTokens), reportedTotalTokens: avg((run) => run.subagent.reportedTotalTokens), spawned: avg((run) => run.subagent.spawned) };
  return out;
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Breakdown of one trace file, with its kept ledger and the SKILL.md of the skill the ledger names. */
export function breakdownOfFile(file, repo = REPO) {
  const ledgerText = ledgerTextOf(file);
  const skill = ledgerOf(ledgerText).skill;
  const skillFile = skill ? path.join(repo, 'skills', skill, 'SKILL.md') : null;
  return breakdownOf(readFileSync(file, 'utf8'), { ledgerText, skillBytes: skillFile && existsSync(skillFile) ? statSync(skillFile).size : null });
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((arg) => arg !== '--json');
  if (args[0] === '--latest') {
    const out = {};
    for (const arm of ['plugin', 'bare']) {
      const armDir = path.join(args[1], arm);
      if (!existsSync(armDir)) continue;
      for (const [name, files] of Object.entries(latestByCase(armDir))) (out[name] ??= {})[arm] = { traces: files, mean: meanOf(files.map((file) => breakdownOfFile(file))) };
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const files = args.flatMap((arg) => (statSync(arg).isDirectory() ? [...walk(arg)].filter((file) => file.endsWith('.jsonl') && path.basename(file) !== 'ledger.jsonl' && !file.includes('.ambicode')) : [arg]));
  for (const file of files) {
    const row = breakdownOfFile(file);
    if (json) console.log(JSON.stringify({ file, ...row }));
    else console.log(`${path.basename(file)}  calls ${row.modelCalls}  tools ${row.toolCalls} (plumbing ${row.plumbingCalls}, work ${row.workCalls}, delegate ${row.delegateCalls})  in ${row.inputTokens}  out ${row.outputTokens}  ${row.seconds?.toFixed(1)}s  $${row.costUsd?.toFixed(4)} (subagents $${row.subagentCostUsd?.toFixed(4)})  steps ${JSON.stringify(row.steps)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

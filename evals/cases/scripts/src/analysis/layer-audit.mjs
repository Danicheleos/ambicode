// Per case, what the route's layers handed each run and what the model did with it, read from a result and its harvest.
// Offline and free; prints case numbers and counts only. Exits 1 when a layer meant to be the same in every run of a
// case (the delivered step, the map's top candidates) differs between them.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARKS, CURATED_CASES } from '../shared/bench-paths.mjs';
import { namedFiles } from './bench-score.mjs';
import { ledgersOf } from './ledger-metrics.mjs';
import { mapPaths } from './map-recall.mjs';
import { SESSION_DIRECTORY } from './trace-analysis.mjs';

// Per token; the gate's own cost is the harness's `costUsd`, this only splits it.
export const PRICES = { input: 2e-6, cacheWrite: 4e-6, cacheRead: 2e-7, output: 1e-5 };
const TOP = 8;
const GREP = new Set(['grep', 'rg', 'egrep']);
const CAT = new Set(['cat', 'sed', 'head', 'tail', 'nl', 'awk']);
const LIST = new Set(['ls', 'find', 'tree', 'wc']);

export const readJsonl = (file) =>
  readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
export const textOf = (content) =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (typeof block === 'string' ? block : block?.text ?? '')).join('\n') : JSON.stringify(content ?? '');
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);
// The task slug is minted per run; the rest of a step is the layer under test.
const withoutSlug = (text) => text.replace(/task [^\s·]+/g, 'task <slug>').replace(/\.ambicode\/task\/[^/\s]+/g, '.ambicode/task/<slug>');

export function callClass(name, input) {
  if (name !== 'Bash') return name;
  const words = String(input?.command ?? '').split(/&&|\|\||;|\||\n/).map((segment) => segment.trim().split(/\s+/));
  if (words.some(([word]) => GREP.has(word))) return 'grep';
  if (words.some(([word]) => CAT.has(word))) return 'cat';
  if (words.some(([word, sub]) => LIST.has(word) || (word === 'git' && sub === 'ls-files'))) return 'ls';
  return 'bash';
}

/** Tool turns, result bytes by call class, run usage and self-hits, from the run's trace. */
export function traceFacts(events) {
  const turns = new Map();
  const results = new Map();
  let usage = null;
  for (const event of events) {
    if (event.type === 'assistant') {
      const id = event.message?.id ?? event.uuid;
      const tools = (event.message?.content ?? []).filter((block) => block.type === 'tool_use');
      turns.set(id, [...(turns.get(id) ?? []), ...tools]);
    } else if (event.type === 'user' && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) if (block.type === 'tool_result') results.set(block.tool_use_id, textOf(block.content));
    } else if (event.type === 'result') usage = event.usage ?? null;
  }
  const bytes = {};
  let selfHit = false;
  for (const tools of turns.values())
    for (const tool of tools) {
      const text = results.get(tool.id) ?? '';
      const kind = callClass(tool.name, tool.input);
      bytes[kind] = (bytes[kind] ?? 0) + Buffer.byteLength(text);
      if (/\.ambicode\/task\//.test(text)) selfHit = true;
    }
  const tokens = usage === null ? null : { input: usage.input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, output: usage.output_tokens ?? 0 };
  return { toolTurns: [...turns.values()].filter((tools) => tools.length > 0).length, bytes, tokens, selfHit };
}

/** The hook context the session delivered: the route's step, any PostToolUse notices, and hook run times. */
export function sessionFacts(events) {
  const contexts = events.filter((event) => event.attachment?.type === 'hook_additional_context').map((event) => ({ event: event.attachment.hookEvent, text: textOf(event.attachment.content) }));
  const step = contexts.find((context) => context.event === 'UserPromptSubmit' && context.text.includes('[ambicode]'))?.text ?? null;
  const durations = {};
  for (const event of events)
    if (event.attachment?.type === 'hook_success' && typeof event.attachment.durationMs === 'number') (durations[event.attachment.hookEvent] ??= []).push(event.attachment.durationMs);
  return { step, notices: contexts.filter((context) => context.event === 'PostToolUse').length, durations };
}

export function sessionEvents(id, tracesDirs) {
  for (const dir of tracesDirs) {
    const directory = path.join(dir, SESSION_DIRECTORY, id);
    if (!existsSync(directory)) continue;
    const file = readdirSync(directory).find((name) => name.endsWith('.jsonl'));
    if (file !== undefined) return readJsonl(path.join(directory, file));
  }
  return null;
}

const mean = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const median = (values) => (values.length === 0 ? null : [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]);

/** One row per run of every arm, and the layers that differ within a case. */
export function auditRuns({ results, tracesDirs, cases = CURATED_CASES }) {
  const rows = [];
  results.cases.forEach((entry, index) => {
    const truthFile = path.join(cases, entry.name, 'truth.json');
    if (!existsSync(truthFile)) return;
    const { truth, root = '' } = JSON.parse(readFileSync(truthFile, 'utf8'));
    const full = (file) => (truth.includes(file) ? file : path.posix.join(root, file));
    for (const [arm, runs] of Object.entries(entry.arms ?? {}))
      runs.forEach((run, i) => {
        const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '')?.[1] ?? null;
        const row = { case: String(index + 1).padStart(2, '0'), name: entry.name, arm, i, id, costUsd: run.costUsd ?? null };
        const answer = run.graders?.find((grader) => grader.name === 'names-a-true-file')?.evidence ?? null;
        if (answer !== null) {
          const { named, sectioned } = namedFiles(answer, truth, root);
          Object.assign(row, { named, sectioned, answerBytes: Buffer.byteLength(answer) });
        }
        const traceFile = id === null ? undefined : tracesDirs.map((dir) => path.join(dir, `${id}.jsonl`)).find(existsSync);
        if (traceFile !== undefined) Object.assign(row, traceFacts(readJsonl(traceFile)));
        const session = id === null ? null : sessionEvents(id, tracesDirs);
        if (session !== null) {
          const facts = sessionFacts(session);
          Object.assign(row, { notices: facts.notices, durations: facts.durations });
          if (facts.step !== null) {
            const listed = mapPaths(facts.step);
            Object.assign(row, { stepBytes: Buffer.byteLength(facts.step), stepHash: hash(withoutSlug(facts.step)), leads: listed.leads.map(full), feature: listed.feature.map(full) });
          }
        }
        const ledgers = ledgersOf(run, tracesDirs);
        if (ledgers !== null) {
          const entries = ledgers.flatMap((ledger) => ledger.entries);
          const map = entries.findLast((item) => item.kind === 'map');
          if (map?.candidatePaths !== undefined) row.candidates = map.candidatePaths.slice(0, TOP);
          row.limits = entries.filter((item) => item.kind === 'limit').map((item) => item.which);
        }
        rows.push(row);
      });
  });
  const problems = [];
  for (const key of [...new Set(rows.map((row) => `${row.case}\t${row.arm}`))]) {
    const group = rows.filter((row) => `${row.case}\t${row.arm}` === key);
    const [number, arm] = key.split('\t');
    const steps = new Set(group.filter((row) => row.stepHash !== undefined).map((row) => row.stepHash));
    if (steps.size > 1) problems.push(`${number} ${arm}: ${steps.size} different steps`);
    const candidates = new Set(group.filter((row) => row.candidates !== undefined).map((row) => row.candidates.join('\n')));
    if (candidates.size > 1) problems.push(`${number} ${arm}: ${candidates.size} different map candidate lists`);
  }
  return { rows, problems };
}

/** Per case and arm: means of what the model got from the map and what it spent. */
export function summarize(rows, truthOf) {
  const out = [];
  for (const key of [...new Set(rows.map((row) => `${row.case}\t${row.arm}`))]) {
    const group = rows.filter((row) => `${row.case}\t${row.arm}` === key);
    const truth = truthOf(group[0].name);
    const map = new Set([...(group[0].leads ?? []), ...(group[0].feature ?? [])]);
    const scored = group.filter((row) => row.named !== undefined);
    const per = (pick) => mean(scored.map(pick));
    const kb = {};
    for (const row of group) for (const [kind, value] of Object.entries(row.bytes ?? {})) kb[kind] = (kb[kind] ?? 0) + value / 1024 / group.length;
    const priced = group.filter((row) => row.tokens);
    const usd = (field) => mean(priced.map((row) => row.tokens[field] * PRICES[field]));
    out.push({
      case: group[0].case, arm: group[0].arm, runs: group.length,
      stepBytes: [...new Set(group.filter((row) => row.stepBytes !== undefined).map((row) => row.stepBytes))],
      leads: group[0].leads?.length ?? null, leadsTrue: (group[0].leads ?? []).filter((file) => truth.includes(file)).length,
      feature: group[0].feature?.length ?? null, featureTrue: (group[0].feature ?? []).filter((file) => truth.includes(file)).length,
      recall: per((row) => row.named.filter((file) => truth.includes(file)).length / truth.length),
      precision: per((row) => (row.named.length === 0 ? 0 : row.named.filter((file) => truth.includes(file)).length / row.named.length)),
      named: per((row) => row.named.length),
      fromMap: per((row) => row.named.filter((file) => map.has(file)).length),
      trueOutsideMap: per((row) => row.named.filter((file) => truth.includes(file) && !map.has(file)).length),
      mapTrueMissed: per((row) => [...map].filter((file) => truth.includes(file) && !row.named.includes(file)).length),
      toolTurns: mean(group.filter((row) => row.toolTurns !== undefined).map((row) => row.toolTurns)),
      maxToolTurns: Math.max(...group.map((row) => row.toolTurns ?? 0)),
      kb, usd: { cacheWrite: usd('cacheWrite'), cacheRead: usd('cacheRead'), output: usd('output'), input: usd('input') },
      costUsd: mean(group.filter((row) => row.costUsd !== null).map((row) => row.costUsd)),
      notices: group.reduce((a, row) => a + (row.notices ?? 0), 0), limits: group.flatMap((row) => row.limits ?? []),
      selfHitRuns: group.filter((row) => row.selfHit).length, sectioned: scored.filter((row) => row.sectioned).length,
      postToolUseMs: median(group.flatMap((row) => row.durations?.PostToolUse ?? [])),
    });
  }
  return out;
}

const fixed = (value, digits = 2) => (value === null || value === undefined ? '-' : value.toFixed(digits));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file] = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--'));
  const option = (name) => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
  if (file === undefined) {
    console.error('usage: layer-audit.mjs <result.json> [--traces <dir>] [--json <file>]');
    process.exit(2);
  }
  const results = JSON.parse(readFileSync(file, 'utf8'));
  const tracesDirs = [option('--traces') ?? path.join(BENCHMARKS, 'traces'), path.join(path.dirname(path.resolve(file)), 'traces')];
  const { rows, problems } = auditRuns({ results, tracesDirs });
  const truthOf = (name) => JSON.parse(readFileSync(path.join(CURATED_CASES, name, 'truth.json'), 'utf8')).truth;
  const summary = summarize(rows, truthOf);
  for (const s of summary) {
    const kb = Object.entries(s.kb).sort((a, b) => b[1] - a[1]).map(([kind, value]) => `${kind} ${value.toFixed(1)}`).join(' ');
    console.log(
      `${s.case} ${s.arm} ×${s.runs} step ${s.stepBytes.join('/') || '-'}B map ${s.leadsTrue}/${s.leads ?? '-'}+${s.featureTrue}/${s.feature ?? '-'}` +
        ` | R ${fixed(s.recall)} P ${fixed(s.precision)} named ${fixed(s.named, 1)} fromMap ${fixed(s.fromMap, 1)} outside ${fixed(s.trueOutsideMap, 1)} missed ${fixed(s.mapTrueMissed, 1)}` +
        ` | turns ${fixed(s.toolTurns, 1)} (max ${s.maxToolTurns}) KB ${kb}` +
        ` | $ ${fixed(s.costUsd, 3)} cw ${fixed(s.usd.cacheWrite, 3)} cr ${fixed(s.usd.cacheRead, 3)} out ${fixed(s.usd.output, 3)}` +
        ` | notices ${s.notices} limits ${s.limits.join(',') || '-'} self ${s.selfHitRuns} sectioned ${s.sectioned}/${s.runs}${s.postToolUseMs === null ? '' : ` postToolUse ${s.postToolUseMs}ms`}`,
    );
  }
  for (const arm of [...new Set(summary.map((s) => s.arm))]) {
    const of = summary.filter((s) => s.arm === arm);
    const avg = (pick) => mean(of.map(pick).filter((value) => value !== null));
    const total = (pick) => of.reduce((a, s) => a + pick(s), 0);
    console.log(
      `all ${arm}: R ${fixed(avg((s) => s.recall), 3)} P ${fixed(avg((s) => s.precision), 3)} $ ${fixed(avg((s) => s.costUsd), 3)} turns ${fixed(avg((s) => s.toolTurns), 1)}` +
        ` map true ${total((s) => s.leadsTrue + s.featureTrue)} notices ${total((s) => s.notices)} self-hit runs ${total((s) => s.selfHitRuns)}`,
    );
  }
  for (const line of problems) console.log(`layer differs ${line}`);
  const out = option('--json');
  if (out !== null) writeFileSync(out, `${JSON.stringify({ rows, summary, problems }, null, 1)}\n`);
  if (problems.length > 0) process.exitCode = 1;
}

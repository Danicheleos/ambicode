// The standard report of one eval result: every run's chain (route entries, model calls, tool calls, files, context,
// time, price), compared with the bare model and the previous iterations, then findings and proposals.
// Offline and free. Commands: <result.json | iteration dir> [--baseline <result.json>] [--previous <n>] [--out <dir>] [--full]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_LOCK_FILE, CASES_DIRECTORY, CASES_ROOT, NAKED_PLUGIN, OUTPUTS, REPORTS, ROOT, TASK_EVAL_DIR } from '../shared/bench-paths.mjs';
import { infrastructureError } from '../harness/run-validity.mjs';
import { ACCEPTANCE, driftOf, repetitionMeans } from '../validation/eval-gate.mjs';
import { resolveBaseline } from './baseline-lock.mjs';
import { createAnalysis, namedFiles, PATH_TOKEN, resolvePath, scoreWithAnalysis, withBaseline } from './bench-score.mjs';
import { callClass, PRICES, readJsonl, readSegments, readsFiles, sessionEvents, sessionFacts, stopWrote, textOf } from './layer-audit.mjs';
import { ledgersIn, ledgersOf } from './ledger-metrics.mjs';
import { mapPaths } from './map-recall.mjs';

const PREVIOUS = 2;
const TRIM = 400;
const THRESHOLDS = ACCEPTANCE.report;

const mean = (values) => {
  const xs = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};
const elapsedMs = (from, to) => (from && to ? Date.parse(to) - Date.parse(from) : null);
const idOf = (run) => /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '')?.[1] ?? null;
const contextOf = (usage) => (usage ? (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) : null);
const priceOf = (usage) =>
  usage
    ? {
        input: (usage.input_tokens ?? 0) * PRICES.input,
        cacheWrite: (usage.cache_creation_input_tokens ?? 0) * PRICES.cacheWrite,
        cacheRead: (usage.cache_read_input_tokens ?? 0) * PRICES.cacheRead,
        output: (usage.output_tokens ?? 0) * PRICES.output,
      }
    : null;
const sumPrice = (price) => (price ? price.input + price.cacheWrite + price.cacheRead + price.output : null);

/** A Bash call to the plugin's CLI is its own class, so route commands are not counted as the model's search. */
export function toolClass(name, input) {
  const helper = name === 'Bash' ? /ambicode\.mjs\\?"?\s+(\w+)/.exec(String(input?.command ?? ''))?.[1] : null;
  return helper ? `ambicode ${helper}` : callClass(name, input);
}

/** Model calls in order, each with its usage, text and tool calls; a streamed message is one call. */
export function callChain(events, startedAt = null) {
  const calls = [];
  const byMessage = new Map();
  const byTool = new Map();
  let result = null;
  for (const event of events) {
    if (event.type === 'assistant') {
      const id = event.message?.id ?? event.uuid;
      let call = byMessage.get(id);
      if (!call) {
        call = { at: event.timestamp ?? null, usage: null, text: [], thinkingChars: 0, tools: [] };
        byMessage.set(id, call);
        calls.push(call);
      }
      const usage = event.message?.usage;
      if (usage) call.usage = { ...usage, output_tokens: Math.max(usage.output_tokens ?? 0, call.usage?.output_tokens ?? 0) };
      for (const block of event.message?.content ?? []) {
        if (block.type === 'text') call.text.push(block.text);
        else if (block.type === 'thinking') call.thinkingChars += (block.thinking ?? '').length;
        else if (block.type === 'tool_use') {
          const tool = { name: block.name, input: block.input ?? {}, class: toolClass(block.name, block.input), result: null, resultBytes: null, error: false, ms: null };
          call.tools.push(tool);
          byTool.set(block.id, { tool, at: event.timestamp ?? null });
        }
      }
    } else if (event.type === 'user' && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        const hit = block.type === 'tool_result' ? byTool.get(block.tool_use_id) : undefined;
        if (!hit) continue;
        const text = textOf(block.content);
        Object.assign(hit.tool, { result: text, resultBytes: Buffer.byteLength(text), error: Boolean(block.is_error), ms: elapsedMs(hit.at, event.timestamp) });
      }
    } else if (event.type === 'result') result = event;
  }
  for (const call of calls) Object.assign(call, { offsetMs: startedAt ? elapsedMs(startedAt, call.at) : null, context: contextOf(call.usage), usd: sumPrice(priceOf(call.usage)) });
  return { calls, result };
}

/** Paths a tool call reads or names, relative to the repository, as the answer scorer resolves them. */
export function toolFiles(tool, truth, root) {
  const text = tool.name === 'Read' ? ` ${tool.input.file_path ?? ''}` : tool.name === 'Bash' ? String(tool.input.command ?? '') : [tool.input.path, tool.input.pattern, tool.input.glob].filter(Boolean).join(' ');
  return filesIn(text, truth, root);
}

/** Paths in any text, resolved as the scorer resolves the answer's; a root truth file counts as a whole operand only. */
function filesIn(text, truth, root) {
  const named = [...new Set([...` ${text}`.matchAll(PATH_TOKEN)].map((m) => resolvePath(m[1], truth, root)))];
  // The path pattern needs a slash: a root truth file is matched as a whole operand, never as a nested file's tail.
  const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rooted = truth.filter((t) => !t.includes('/') && !named.includes(t) && new RegExp(`(?:^|[\\s'"\`=(])(?:\\./)?${escape(t)}(?=$|[\\s'"\`;|)&,:])`).test(text));
  return [...named, ...rooted];
}

/**
 * Where each truth file got to in one run, for the answer lever's decision: `future` (created by the change, absent at
 * base), `unknown` (no trace), `unseen`, `discovered` (named in a tool's input or output, or a map lead), `served`
 * (a successful Read, a read segment's operand, or a reader receipt), each with the answer's decision: proposed,
 * excluded or neither. A cat of several files counts each operand served; the output is not split per file.
 */
export function fileStates({ truth, created = [], root = '', calls = null, receipts = [], leads = [], named = [], excluded = [] }) {
  const future = new Set(created);
  const discovered = new Set(leads.filter((f) => truth.includes(f)));
  const served = new Set();
  for (const name of receipts) served.add(resolvePath(name.replace(/:\d+(?:-\d+)?$/, ''), truth, root));
  for (const tool of (calls ?? []).flatMap((c) => c.tools)) {
    for (const f of filesIn(`${toolFiles(tool, truth, root).join(' ')} ${tool.result ?? ''}`, truth, root)) discovered.add(f);
    if (tool.error || !tool.resultBytes || !isRead(tool)) continue;
    for (const operand of readOperands(tool)) for (const f of filesIn(operand, truth, root)) served.add(f);
  }
  return truth.map((file) => {
    const exposure = future.has(file) ? 'future' : served.has(file) ? 'served' : discovered.has(file) ? 'discovered' : calls === null && !receipts.length ? 'unknown' : 'unseen';
    const decision = named.includes(file) ? 'proposed' : excluded.includes(file) ? 'excluded' : 'none';
    return { file, exposure, decision };
  });
}

/** Missing existing truth by how far it got: the answer lever can reach `served` files only. */
export function missingByExposure(states) {
  const missing = states.filter((s) => s.exposure !== 'future' && s.decision !== 'proposed');
  const count = (exposure, decision = null) => missing.filter((s) => s.exposure === exposure && (decision === null || s.decision === decision)).length;
  return {
    existing: states.filter((s) => s.exposure !== 'future').length, missing: missing.length,
    future: states.filter((s) => s.exposure === 'future').length, futureMissing: states.filter((s) => s.exposure === 'future' && s.decision !== 'proposed').length,
    unknown: count('unknown'), unseen: count('unseen'), discovered: count('discovered'), served: count('served'),
    servedExcluded: count('served', 'excluded'), discoveredExcluded: count('discovered', 'excluded'),
  };
}

const isRead = (tool) => readsFiles(tool.name, tool.input);
const SEARCH_CLASSES = new Set(['grep', 'ls', 'Grep', 'Glob']);

const OPERAND = /^[\w@.+~/-]*[\w-]\.[A-Za-z0-9]+$/;
const normalOperand = (p) => p.replace(/^(?:.*\/)?repo\//, '').replace(/^\.\//, '');

/**
 * The files a read call names as operands: Read's path, or the file arguments of the read segments of a Bash command
 * (not a grep's targets beside them). Inferred from the command text, so a glob or a `cd` is not resolved.
 */
export function readOperands(tool) {
  if (tool.name === 'Read') return typeof tool.input?.file_path === 'string' ? [normalOperand(tool.input.file_path)] : [];
  return readSegments(tool.name, tool.input).flatMap((segment) =>
    segment.split(/\s+/).slice(1).map((word) => word.replace(/^['"]|['"]$/g, '').replace(/:\d+(?:-\d+)?$/, '')).filter((word) => !word.startsWith('-') && OPERAND.test(word)).map(normalOperand),
  );
}

// zsh aborts an unquoted `--include=*.ts` before grep runs; the chain continues, so the result is not an error.
const ZSH_GLOB = /no matches found: --(?:include|exclude)=/;
const REFUSED_OPERAND = /^== .+: (?:not found|ambiguous: .*) ==\s*$/gm;
const SOURCE_READERS = new Set(['cat', 'head', 'tail']);

/** Whether a Bash command reads source with cat, `sed -n`, head or tail; a grep or a pipe's filter does not count. */
function bashReadsSource(command) {
  if (/ambicode\.mjs/.test(command)) return false;
  const parts = command.split(/(&&|\|\||;|\||\n)/);
  return parts.some((segment, i) => {
    if (i % 2 === 1 || parts[i - 1] === '|') return false;
    const [word, ...args] = segment.trim().split(/\s+/);
    return SOURCE_READERS.has(word) || (word === 'sed' && args.some((a) => /^-\w*n/.test(a)));
  });
}

/**
 * Per-run mechanics the free choices show up in. `zshGlob` results are counted apart from `failedCalls` (the tool reported
 * an error); `failedWithZsh` adds the zsh ones that reported none. `readsVia.read` is the engine's receipt count, since
 * the command text misses `node "$N" read`; null with no ledger, never a 0.
 */
export function mechanicsOf(tools, receipts = null) {
  const bash = tools.filter((t) => t.name === 'Bash');
  const zsh = tools.filter((t) => t.name === 'Bash' && ZSH_GLOB.test(t.result ?? ''));
  const failedCalls = tools.filter((t) => t.error).length;
  return {
    zshGlob: zsh.length,
    failedWithZsh: failedCalls + zsh.filter((t) => !t.error).length,
    hostCapped: tools.filter((t) => /<persisted-output>|Output too large/.test(t.result ?? '')).length,
    readsVia: { read: receipts === null ? null : receipts.length, nativeRead: tools.filter((t) => t.name === 'Read').length, bash: bash.filter((t) => bashReadsSource(String(t.input?.command ?? ''))).length },
    operandRefusals: bash.reduce((n, t) => n + (String(t.result ?? '').match(REFUSED_OPERAND)?.length ?? 0), 0),
    servedBytes: receipts === null ? null : receipts.reduce((n, e) => n + (e.bytes ?? 0), 0),
  };
}

/**
 * Reads grouped by the model call that asked for them (the measure for "fetch every needed file in one turn"): calls
 * that read, those naming one path, distinct paths per reading call, and result bytes of reads naming only paths read before.
 */
export function readRequests(calls) {
  const seen = new Set();
  let requests = 0;
  let single = 0;
  let paths = 0;
  let rereadBytes = 0;
  for (const call of calls) {
    const reads = call.tools.filter(isRead);
    if (!reads.length) continue;
    const operands = reads.map(readOperands);
    const named = new Set(operands.flat());
    requests += 1;
    paths += named.size;
    if (named.size === 1) single += 1;
    reads.forEach((t, i) => {
      if (operands[i].length && operands[i].every((f) => seen.has(f))) rereadBytes += t.resultBytes ?? 0;
    });
    for (const f of named) seen.add(f);
  }
  return { readRequests: requests, singleFileReads: single, readPaths: paths, rereadBytes };
}

/** The session's first timestamp: when the agent's session began, after the harness built the scaffold. */
export const sessionStartOf = (events) => events.map((e) => e.timestamp).filter(Boolean).sort()[0] ?? null;

/** Attachment bytes the session put into the context, keyed by attachment type and hook event. */
export function injectedContext(events) {
  const out = {};
  for (const event of events) {
    const a = event.attachment;
    if (!a || a.type === 'hook_success') continue;
    const key = [a.type, a.hookEvent ?? a.hookName].filter(Boolean).join(':');
    out[key] = (out[key] ?? 0) + Buffer.byteLength(a.content === undefined ? JSON.stringify(a) : textOf(a.content));
  }
  return out;
}

/** The route as its ledger recorded it: each entry with its offset from the route's start. */
export function routeChain(ledgers) {
  if (!ledgers) return null;
  const entries = ledgers.flatMap((ledger) => ledger.entries);
  const start = entries.find((e) => e.kind === 'route')?.at ?? entries[0]?.at ?? null;
  const label = (e) => (e.kind === 'step' ? `${e.step}:${e.status}` : e.kind === 'exit' ? `exit:${e.reason}` : e.kind);
  const steps = entries.map((e) => ({ label: label(e), actor: e.actor ?? null, ms: elapsedMs(start, e.at), bytes: e.bytes ?? null, entry: e }));
  const map = entries.findLast((e) => e.kind === 'map') ?? null;
  const exit = entries.findLast((e) => e.kind === 'exit') ?? null;
  const delivered = entries.find((e) => e.kind === 'step' && e.status === 'delivered') ?? null;
  return {
    routes: entries.filter((e) => e.kind === 'route').length,
    skill: entries.find((e) => e.kind === 'route')?.skill ?? null,
    start,
    signature: steps.map((s) => s.label).join(' > '),
    steps,
    mapLayers: Array.isArray(map?.layers) ? map.layers.map((l) => ({ name: l?.name ?? '?', ms: l?.ms ?? null, hits: l?.hits ?? null })) : [],
    exit: exit ? { reason: exit.reason ?? null, complete: exit.complete ?? null } : null,
    deliveredAt: delivered?.at ?? null,
    stopBlocked: entries.filter((e) => e.kind === 'exit' && e.reason === 'blocked').length,
  };
}

function caseMeta(evalCase, analysis) {
  const known = analysis.meta(evalCase);
  if (known) return known;
  const file = [path.join(ROOT, TASK_EVAL_DIR, CASES_DIRECTORY, evalCase.name, 'truth.json'), evalCase.dir && path.join(ROOT, evalCase.dir, 'truth.json')].filter(Boolean).find(existsSync);
  return file ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// A preset truth spans the whole tree, so a root file (`package.json`) is a path too; a non-path string is not file truth.
const PATH_SHAPED = /^(?:[\w@.+-]+\/)*[\w@.+-]+\.[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*$/;
export const fileTruth = (meta) => (Array.isArray(meta?.truth) && meta.truth.every((t) => typeof t === 'string' && PATH_SHAPED.test(t)) ? meta.truth : []);

/** One row per run of every arm: the harness numbers, the score, and what the trace, session and ledger show. */
export function analyzeResult(results, { tracesDirs, cases = CASES_ROOT, withChains = true, ledgersDir = null }) {
  const analysis = createAnalysis({ cases, tracesDir: tracesDirs });
  const scored = new Map(scoreWithAnalysis(results, analysis).runs.map((r) => [`${r.case}\t${r.arm}\t${r.run}`, r]));
  const rows = [];
  for (const evalCase of results.cases ?? []) {
    const meta = caseMeta(evalCase, analysis);
    const truth = fileTruth(meta);
    const root = meta?.root ?? '';
    for (const [arm, runs] of Object.entries(evalCase.arms ?? {}))
      (runs ?? []).forEach((run, index) => {
        const score = scored.get(`${evalCase.name}\t${arm}\t${index}`) ?? {};
        const id = idOf(run);
        /** @type {Record<string, any>} */
        const row = {
          case: evalCase.name, kind: meta?.kind ?? 'unknown', side: meta?.side ?? null, arm, run: index, id,
          infra: infrastructureError(run), error: run.error ?? null, absent: Boolean(infrastructureError(run) || score.absent),
          answerFromTrace: Boolean(score.answerFromTrace), skippedPaidGraders: Boolean(run.skippedPaidGraders),
          passed: run.passed ?? null, score: run.score ?? null, costUsd: run.costUsd ?? null, judgeCostUsd: run.judgeCostUsd ?? null,
          agentCostUsd: score.agentCostUsd ?? null, costMismatch: score.costMismatch ?? null, outcome: score.outcome ?? null,
          readerReceipts: score.ledger?.readerReceipts ?? null,
          turns: run.turns ?? null, wallS: run.durationSeconds ?? null, startedAt: run.startedAt ?? null,
          recall: score.recall ?? null, precision: score.precision ?? null, f1: score.f1 ?? null, hit: score.hit ?? null,
          named: score.named ?? null, raised: score.raised ?? null, threads: score.threads ?? null,
          graders: (run.graders ?? []).map((g) => ({ name: g.name, passed: g.passed, explanation: g.explanation ?? null })),
          truth, answer: score.answer ?? (run.graders ?? []).find((g) => typeof g.evidence === 'string')?.evidence ?? null,
        };
        const decided = row.answer !== null && truth.length ? namedFiles(row.answer, truth, root) : null;
        row.namedFiles = decided?.named ?? null;
        const session = id ? sessionEvents(id, tracesDirs) : null;
        const sessionStart = session ? sessionStartOf(session) : null;
        const start = sessionStart ?? run.startedAt ?? null;
        row.setupS = sessionStart && run.startedAt ? elapsedMs(run.startedAt, sessionStart) / 1000 : null;
        const traceFile = id && tracesDirs.map((dir) => path.join(dir, `${id}.jsonl`)).find(existsSync);
        let calls = null;
        if (traceFile) {
          const chain = callChain(readJsonl(traceFile), start);
          calls = chain.calls;
          const result = chain.result;
          const tools = calls.flatMap((c) => c.tools);
          const reads = [];
          tools.forEach((tool) => {
            tool.files = toolFiles(tool, truth, root);
            if (isRead(tool)) reads.push(...tool.files);
          });
          const firstTrue = calls.findIndex((c) => c.tools.some((t) => isRead(t) && t.files.some((f) => truth.includes(f))));
          const counts = {};
          const kb = {};
          for (const tool of tools) {
            counts[tool.class] = (counts[tool.class] ?? 0) + 1;
            kb[tool.class] = (kb[tool.class] ?? 0) + (tool.resultBytes ?? 0) / 1024;
          }
          const readCounts = reads.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map());
          Object.assign(row, {
            traced: true, model: result?.modelUsage ? Object.keys(result.modelUsage)[0] : null,
            modelCalls: calls.length, toolCalls: tools.length, failedCalls: tools.filter((t) => t.error).length,
            parallelCalls: calls.filter((c) => c.tools.length > 1).length, toolCounts: counts, resultKb: kb,
            firstContext: calls[0]?.context ?? null, peakContext: Math.max(0, ...calls.map((c) => c.context ?? 0)) || null,
            outputTokens: result?.usage?.output_tokens ?? null, agentS: result?.duration_ms != null ? result.duration_ms / 1000 : null,
            apiS: result?.duration_api_ms != null ? result.duration_api_ms / 1000 : null, firstCallS: calls[0]?.offsetMs != null ? calls[0].offsetMs / 1000 : null,
            price: priceOf(result?.usage), filesRead: readCounts.size, trueFilesRead: [...readCounts.keys()].filter((f) => truth.includes(f)).length,
            rereads: [...readCounts.values()].filter((n) => n > 1).length, firstTrueReadCall: firstTrue < 0 ? null : firstTrue + 1,
            firstTool: tools[0] ? { class: tools[0].class, files: tools[0].files } : null,
          });
          Object.assign(row, readRequests(calls), mechanicsOf(tools));
          if (withChains) row.calls = calls;
        }
        if (session) {
          row.injected = injectedContext(session);
          const step = sessionFacts(session).step;
          if (step !== null) {
            const listed = mapPaths(step);
            const full = (f) => (truth.includes(f) || !truth.includes(path.posix.join(root, f)) ? f : path.posix.join(root, f));
            row.step = { bytes: Buffer.byteLength(step), text: step, leads: listed.leads.map(full) };
          }
        }
        const ledgers = id ? (ledgersDir ? ledgersIn(path.join(ledgersDir, id)) : ledgersOf(run, tracesDirs)) : null;
        if (row.traced) Object.assign(row, mechanicsOf(calls.flatMap((c) => c.tools), ledgers ? ledgers.flatMap((l) => l.entries).filter((e) => e.kind === 'search' && e.command === 'read') : null));
        const route = routeChain(ledgers);
        if (route) {
          row.route = route;
          // The sandbox's ledger is copied when the session ends, and 3 of 36 copies came out 4 entries short of what the
          // Stop hook reported writing (10 against 14, every other run complete): the route was closed, the copy was early.
          const wrote = session ? stopWrote(session) : null;
          const harvested = ledgers.reduce((n, l) => n + l.entries.length, 0);
          if (!route.exit && wrote !== null && wrote > harvested) route.stale = { wrote, harvested };
          row.routeReadyS = start && route.deliveredAt ? elapsedMs(start, route.deliveredAt) / 1000 : null;
          row.mapMs = route.mapLayers.reduce((a, l) => a + (l.ms ?? 0), 0) || null;
        }
        if (truth.length && decided) {
          const receipts = (ledgers ?? []).flatMap((l) => l.entries).filter((e) => e.kind === 'search' && e.command === 'read').flatMap((e) => e.names ?? []);
          const leads = row.step ? row.step.leads : [];
          row.fileStates = fileStates({ truth, created: meta?.created ?? [], root, calls, receipts, leads, named: decided.named, excluded: decided.excluded });
          row.missing = missingByExposure(row.fileStates);
        }
        if (row.step && row.namedFiles) {
          const map = new Set(row.step.leads);
          row.mapTrue = [...map].filter((f) => truth.includes(f));
          row.mapTrueMissed = row.mapTrue.filter((f) => !row.namedFiles.includes(f));
          row.trueOutsideMap = row.namedFiles.filter((f) => truth.includes(f) && !map.has(f));
        }
        rows.push(row);
      });
  }
  return rows;
}

export const METRICS = [
  ['score', 'harness score', 2], ['recall', 'recall', 3], ['precision', 'precision', 3], ['f1', 'F1', 3], ['hit', 'hit', 2],
  ['agentCostUsd', '$ per run (agent)', 3], ['judgeCostUsd', '$ judging', 3], ['costUsd', '$ harness total', 3], ['turns', 'turns', 1], ['modelCalls', 'model calls', 1], ['toolCalls', 'tool calls', 1],
  ['failedCalls', 'failed tool calls', 2], ['zshGlob', 'zsh glob failures', 2], ['failedWithZsh', 'failed incl. zsh', 2], ['hostCapped', 'host-capped results', 2], ['operandRefusals', 'read operand refusals', 2], ['servedBytes', 'read bytes served', 0], ['firstContext', 'context, 1st call', 0], ['peakContext', 'context, peak', 0],
  ['outputTokens', 'output tokens', 0], ['wallS', 'wall s', 1], ['setupS', 'scaffold s', 1], ['firstCallS', 's to 1st call', 1], ['routeReadyS', 's to route step', 1],
  ['filesRead', 'files read', 1], ['trueFilesRead', 'true files read', 1], ['firstTrueReadCall', 'call of 1st true read', 1],
];

export function summarize(rows) {
  const valid = rows.filter((r) => !r.absent);
  const out = { runs: rows.length, absent: rows.length - valid.length, traced: rows.filter((r) => r.traced).length };
  for (const [key] of METRICS) out[key] = mean(valid.map((r) => r[key]));
  out.passRate = mean(valid.map((r) => (r.passed === null ? null : Number(r.passed))));
  out.spread = (() => {
    const xs = valid.map((r) => primaryOf(r)).filter((x) => x !== null);
    return xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : null;
  })();
  return out;
}

/** The quality number a kind is judged on: recall where the scorer gives one, else the harness score. */
export const primaryOf = (row) => row.recall ?? row.score ?? null;

/** How far an arm's mean of the primary moves between repetitions, the wider of the two arms. */
export function noiseBand(pluginRows, bareRows) {
  const range = (rows) => {
    const means = repetitionMeans(rows.map((r) => ({ ...r, primary: primaryOf(r) })), 'primary').filter((x) => x !== null);
    return means.length > 1 ? Math.max(...means) - Math.min(...means) : null;
  };
  const bands = [range(pluginRows), range(bareRows)].filter((x) => x !== null);
  return bands.length ? Math.max(...bands) : null;
}

/** Results files of one eval type, newest first: an iteration's `results/*.json` and loose `*.json` beside it. */
export function resultFiles(outputs, type) {
  const top = path.join(outputs, type);
  if (!existsSync(top)) return [];
  const files = [];
  for (const day of readdirSync(top, { withFileTypes: true }).filter((e) => e.isDirectory()))
    for (const iteration of readdirSync(path.join(top, day.name), { withFileTypes: true }).filter((e) => e.isDirectory()))
      for (const dir of [path.join(top, day.name, iteration.name, 'results'), path.join(top, day.name, iteration.name)])
        if (existsSync(dir)) for (const name of readdirSync(dir)) if (name.endsWith('.json')) files.push(path.join(dir, name));
  return files
    .flatMap((file) => {
      try {
        const results = JSON.parse(readFileSync(file, 'utf8'));
        return Array.isArray(results.cases) && results.startedAt ? [{ file, results }] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => Date.parse(b.results.startedAt) - Date.parse(a.results.startedAt));
}

const pluginName = (results) => results.suite?.plugins?.[0]?.name ?? null;
const sharesCases = (a, b) => (a.cases ?? []).some((c) => (b.cases ?? []).some((d) => d.name === c.name));

/**
 * The N newest earlier plugin runs sharing cases with this one, those covering every case first. The bare reference
 * is not looked up here: it is the pinned baseline (`resolveBaseline`), never whichever naked run is newest.
 */
export function findComparisons(current, file, candidates, previous = PREVIOUS) {
  const before = candidates.filter((c) => path.resolve(c.file) !== path.resolve(file) && sharesCases(c.results, current) && Date.parse(c.results.startedAt) < Date.parse(current.startedAt));
  const coverage = (c) => (current.cases ?? []).filter((x) => (c.results.cases ?? []).some((y) => y.name === x.name)).length;
  // Another model or another served prompt is another treatment, not an earlier value of this one.
  const same = (c) => c.results.suite?.modelOverride === current.suite?.modelOverride && c.results.suite?.servedPrompt === current.suite?.servedPrompt;
  const runs = before.filter((c) => pluginName(c.results) !== NAKED_PLUGIN && same(c));
  const ranked = [...runs.filter((c) => coverage(c) === (current.cases ?? []).length), ...runs.filter((c) => coverage(c) < (current.cases ?? []).length)];
  return { previous: ranked.slice(0, previous) };
}

/** Where a result's traces and report live: `outputs/<type>/<date>/<iteration>/` maps to `reports/<type>/<date>/<iteration>/`. */
export function layoutOf(file, { outputs = OUTPUTS, reports = REPORTS } = {}) {
  const dir = path.dirname(path.resolve(file));
  const iteration = path.basename(dir) === 'results' ? path.dirname(dir) : dir;
  const relative = path.relative(outputs, iteration);
  const inside = !relative.startsWith('..') && !path.isAbsolute(relative) && relative.split(path.sep).length === 3;
  return {
    type: inside ? relative.split(path.sep)[0] : 'core',
    label: path.basename(iteration),
    tracesDirs: [path.join(iteration, 'traces'), path.join(dir, 'traces')],
    reportDir: inside ? path.join(reports, relative) : path.join(dir, 'report'),
  };
}

/** The plugin arm's rows, and the bare model's: this run's own without arm, else the baseline's naked or without arm. */
export function armsOf(rows, baselineRows, baselineResults) {
  const plugin = rows.filter((r) => r.arm === 'with');
  const own = rows.filter((r) => r.arm === 'without');
  if (own.length) return { plugin, bare: own, bareSource: 'this run\'s without arm' };
  if (!baselineRows) return { plugin, bare: [], bareSource: null };
  const arm = pluginName(baselineResults) === NAKED_PLUGIN ? 'with' : 'without';
  const cases = new Set(plugin.map((r) => r.case));
  return { plugin, bare: baselineRows.filter((r) => r.arm === arm && cases.has(r.case)), bareSource: `the ${arm} arm of the baseline` };
}

const ratio = (a, b) => (a !== null && b ? a / b : null);
const byCase = (rows) => rows.reduce((m, r) => m.set(r.case, [...(m.get(r.case) ?? []), r]), new Map());

/** Strong and weak places, each with the evidence that raised it. Codes key the proposals. */
export function findingsOf({ plugin, bare, previous, band, servedPrompt, current, baselineResults }) {
  const out = [];
  const add = (level, code, text, evidence = []) => out.push({ level, code, text, evidence });
  const invalid = plugin.filter((r) => r.infra);
  if (invalid.length) add('invalid', 'infra', `${invalid.length} plugin run(s) died outside the arm; their scores mean nothing`, invalid.map((r) => `${r.case} run ${r.run}: ${r.infra}`));
  const untraced = plugin.filter((r) => !r.traced).length;
  if (untraced) add('caveat', 'untraced', `${untraced} of ${plugin.length} plugin runs have no harvested trace: trace-based numbers cover the rest`);
  const fromTrace = plugin.filter((r) => r.answerFromTrace);
  const skipped = fromTrace.filter((r) => r.skippedPaidGraders);
  if (skipped.length) add('caveat', 'grader-skipped', `${skipped.length} plugin run(s) had their paid grader skipped; their files were scored from the trace's final result`, skipped.map((r) => `${r.case} run ${r.run}`));
  const unexplained = fromTrace.filter((r) => !r.skippedPaidGraders);
  if (unexplained.length) add('caveat', 'answer-from-trace', `${unexplained.length} plugin run(s) had no grader evidence; their files were scored from the trace's final result`, unexplained.map((r) => `${r.case} run ${r.run}`));
  const pinned = current.suite?.modelOverride ?? null;
  const models = [...new Set(plugin.map((r) => r.model).filter(Boolean))];
  if (pinned && models.some((m) => m !== pinned)) add('invalid', 'model', `runs used ${models.join(', ')}, the pinned model is ${pinned}`);
  if (baselineResults && baselineResults.claudeVersion !== current.claudeVersion)
    add('caveat', 'version', `the bare baseline ran on Claude Code ${baselineResults.claudeVersion}, this run on ${current.claudeVersion}: part of any difference may be the CLI`);
  if (servedPrompt === 'with') {
    const unrouted = plugin.filter((r) => r.traced && !r.route?.routes);
    if (unrouted.length) add('invalid', 'unrouted', `${unrouted.length} plugin run(s) recorded no route although the plugin prompt was served`, unrouted.map((r) => `${r.case} run ${r.run}`));
  } else if (plugin.length) add('caveat', 'naked-prompt', 'the plugin arm was served the naked prompt: no route was typed, so this measures hooks and context only');

  const bareByCase = byCase(bare);
  const pluginByCase = byCase(plugin);
  let excess = 0;
  const excessByCase = [];
  for (const [name, rows] of pluginByCase) {
    const p = summarize(rows);
    const b = bareByCase.has(name) ? summarize(bareByCase.get(name)) : null;
    const pp = mean(rows.filter((r) => !r.absent).map(primaryOf));
    const bp = b ? mean(bareByCase.get(name).filter((r) => !r.absent).map(primaryOf)) : null;
    const fmt = (x) => (x === null ? '-' : x.toFixed(2));
    if (pp !== null && bp !== null && band !== null) {
      if (pp - bp < -band) add('weak', 'quality-loss', `${name}: ${fmt(pp)} against bare ${fmt(bp)}, below by more than the noise band ${fmt(band)}`);
      else if (pp - bp > band) add('strong', 'quality-gain', `${name}: ${fmt(pp)} against bare ${fmt(bp)}, above the noise band ${fmt(band)}`);
    }
    if (pp !== null && bp !== null && pp >= THRESHOLDS.saturated && bp >= THRESHOLDS.saturated) add('info', 'saturated', `${name}: both arms ≥ ${THRESHOLDS.saturated}, the case carries no signal`);
    if (pp !== null && bp !== null && pp <= THRESHOLDS.floor && bp <= THRESHOLDS.floor) add('info', 'floor', `${name}: both arms ≤ ${THRESHOLDS.floor}, the case carries no signal`);
    if (p.spread !== null && p.spread >= THRESHOLDS.spread) add('weak', 'unstable', `${name}: plugin runs range ${p.spread.toFixed(2)} apart on the primary metric`);
    const r = ratio(p.agentCostUsd, b?.agentCostUsd ?? null);
    if (r !== null) {
      excess += (p.agentCostUsd - b.agentCostUsd) * rows.length;
      excessByCase.push([name, (p.agentCostUsd - b.agentCostUsd) * rows.length]);
      if (r > THRESHOLDS.costRatio) add('weak', 'cost-case', `${name}: ${r.toFixed(2)}× the bare agent cost ($${p.agentCostUsd.toFixed(3)} vs $${b.agentCostUsd.toFixed(3)} per run)`);
      if (r < THRESHOLDS.cheapRatio) add('strong', 'cheap-case', `${name}: ${r.toFixed(2)}× the bare cost`);
    }
    if (p.modelCalls !== null && b?.modelCalls != null) {
      if (p.modelCalls - b.modelCalls > THRESHOLDS.extraCalls) add('weak', 'turns', `${name}: ${p.modelCalls.toFixed(1)} model calls against bare ${b.modelCalls.toFixed(1)}`);
      else if (b.modelCalls - p.modelCalls > THRESHOLDS.extraCalls) add('strong', 'turns', `${name}: ${p.modelCalls.toFixed(1)} model calls against bare ${b.modelCalls.toFixed(1)}`);
    }
    const steps = new Set(rows.filter((x) => x.step).map((x) => x.step.text.replace(/task [^\s·]+/g, 'task <slug>').replace(/\.ambicode\/task\/[^/\s]+/g, '.ambicode/task/<slug>')));
    if (steps.size > 1) add('weak', 'step-unstable', `${name}: the route delivered ${steps.size} different steps across runs`);
  }
  const drift = driftOf(plugin, ACCEPTANCE.drift);
  const outOfBand = drift.filter((d) => d.status === 'out');
  if (outOfBand.length) add('weak', 'unstable-case', `${outOfBand.length} of ${drift.filter((d) => d.status !== 'gap').length} cases drift outside the band (${ACCEPTANCE.drift.qualityFloor}× best recall and F1, ${ACCEPTANCE.drift.costCeiling}× cheapest agent cost)`, outOfBand.map((d) => `${d.case}: ${d.reasons.join('; ')}`));
  const mismatched = plugin.filter((r) => typeof r.costMismatch === 'number');
  if (mismatched.length) add('caveat', 'cost-mismatch', `${mismatched.length} run(s) where the trace's cost differs from the harness cost minus judging; the trace's is used`, mismatched.map((r) => `${r.case} run ${r.run}: ${r.costMismatch.toFixed(6)}`));
  const uncounted = plugin.filter((r) => r.readerReceipts && r.readerReceipts.calls > (r.toolCounts?.['ambicode read'] ?? 0));
  if (uncounted.length) add('caveat', 'helper-uncounted', `${uncounted.length} run(s) have more engine read receipts than command-text \`ambicode read\` calls; tool classes undercount the reader`, uncounted.map((r) => `${r.case} run ${r.run}: ${r.readerReceipts.calls} receipts, ${r.toolCounts?.['ambicode read'] ?? 0} by command text`));
  const top = excessByCase.sort((a, b) => b[1] - a[1])[0];
  if (top && excess > 0 && top[1] >= excess) add('info', 'cost-driver', `${top[0]} accounts for all of the +$${excess.toFixed(3)} excess over bare; without it the plugin arm is not dearer`);

  const routed = plugin.filter((r) => r.route?.routes);
  const stale = routed.filter((r) => !r.route.exit && r.route.stale);
  if (stale.length) add('caveat', 'ledger-stale', `${stale.length} of ${routed.length} harvested ledgers are short of what the Stop hook wrote, so the route is not counted open`, stale.map((r) => `${r.case} run ${r.run}: ${r.route.stale.harvested} entries harvested, ${r.route.stale.wrote} written`));
  const open = routed.filter((r) => !r.route.exit && !r.route.stale);
  if (open.length) add('weak', 'route-open', `${open.length} of ${routed.length} routed runs ended with no exit entry`, open.map((r) => `${r.case} run ${r.run}: ${r.route.signature}`));
  const notDone = routed.filter((r) => r.route.exit && r.route.exit.reason !== 'done');
  if (notDone.length) add('weak', 'route-exit', `${notDone.length} routed runs exited other than done`, notDone.map((r) => `${r.case} run ${r.run}: exit ${r.route.exit.reason}`));
  const blocked = routed.reduce((n, r) => n + r.route.stopBlocked, 0);
  if (blocked) add('info', 'stop-blocked', `the Stop hook blocked ${blocked} time(s)`);
  const slow = routed.filter((r) => (r.routeReadyS ?? 0) > THRESHOLDS.routeReadyS);
  if (slow.length) add('weak', 'route-slow', `${slow.length} routed runs waited over ${THRESHOLDS.routeReadyS} s for the route step (mean ${mean(slow.map((r) => r.routeReadyS)).toFixed(1)} s, map ${(mean(slow.map((r) => r.mapMs)) / 1000).toFixed(1)} s)`);

  const missed = plugin.filter((r) => r.mapTrueMissed?.length);
  if (missed.length) add('weak', 'map-missed', `in ${missed.length} runs the answer left out true files the map had listed (${missed.reduce((n, r) => n + r.mapTrueMissed.length, 0)} files)`, missed.map((r) => `${r.case} run ${r.run}: ${r.mapTrueMissed.join(', ')}`));
  const outside = plugin.filter((r) => r.trueOutsideMap?.length);
  if (outside.length) add('info', 'outside-map', `in ${outside.length} runs the model found true files the map never listed (${outside.reduce((n, r) => n + r.trueOutsideMap.length, 0)} files)`, outside.map((r) => `${r.case} run ${r.run}: ${r.trueOutsideMap.join(', ')}`));
  const emptyMap = plugin.filter((r) => r.step && r.truth.length && r.mapTrue?.length === 0);
  if (emptyMap.length) add('weak', 'map-empty', `in ${emptyMap.length} runs the map listed no true file`, [...new Set(emptyMap.map((r) => r.case))]);
  const mapped = plugin.filter((r) => r.step && r.step.leads.length > 0);
  const broad = mapped.filter((r) => SEARCH_CLASSES.has(r.firstTool?.class) && !r.firstTool.files.some((f) => r.step.leads.includes(f)));
  if (broad.length) add('weak', 'first-call-broad', `${broad.length} of ${mapped.length} runs opened with a search or listing that names no map file, although the step had delivered a map`, broad.map((r) => `${r.case} run ${r.run}: ${r.firstTool.class}`));
  const failed = plugin.filter((r) => r.failedCalls);
  if (failed.length) add('info', 'failed-calls', `${failed.reduce((n, r) => n + r.failedCalls, 0)} failed tool calls in ${failed.length} runs`);
  const rereads = plugin.filter((r) => r.rereads);
  if (rereads.length) add('info', 'rereads', `${rereads.length} runs read the same file more than once (${rereads.reduce((n, r) => n + r.rereads, 0)} files)`);
  const pContext = mean(plugin.map((r) => r.firstContext));
  const bContext = mean(bare.map((r) => r.firstContext));
  if (pContext !== null && bContext !== null && pContext - bContext > THRESHOLDS.extraContext)
    add('weak', 'context', `the plugin's first request carries ${Math.round(pContext - bContext)} more tokens than bare, over the ${THRESHOLDS.extraContext}-token limit; every later call pays them as cache reads`);
  else if (pContext !== null && bContext !== null && pContext - bContext > THRESHOLDS.extraContextSoft)
    add('info', 'context-soft', `the plugin's first request carries ${Math.round(pContext - bContext)} more tokens than bare: within the ${THRESHOLDS.extraContext}-token limit, over the ${THRESHOLDS.extraContextSoft}-token target`);
  else if (pContext === null || bContext === null)
    add('caveat', 'context-unmeasured', `first-request context is unmeasured for the ${pContext === null ? 'plugin' : 'bare'} arm (no trace), so the ${THRESHOLDS.extraContext}-token budget is unchecked, not met`);

  // Only the cases both runs scored, under the same kind: a mixed walk's average is not this suite's previous value.
  const keyOf = (r) => `${r.case}\t${r.kind}`;
  for (const prev of previous) {
    const prevRows = prev.rows.filter((r) => r.arm === 'with' && !r.absent);
    const ours = plugin.filter((r) => !r.absent);
    const shared = new Set(ours.map(keyOf).filter((k) => prevRows.some((r) => keyOf(r) === k)));
    const pPrimary = mean(ours.filter((r) => shared.has(keyOf(r))).map(primaryOf));
    const prevPrimary = mean(prevRows.filter((r) => shared.has(keyOf(r))).map(primaryOf));
    if (pPrimary === null || prevPrimary === null || band === null) continue;
    const on = `on ${shared.size} shared case${shared.size === 1 ? '' : 's'}`;
    if (pPrimary - prevPrimary < -band) add('weak', 'regression', `primary ${pPrimary.toFixed(3)} against ${prevPrimary.toFixed(3)} in ${prev.label} ${on}: a drop beyond the noise band`);
    else if (pPrimary - prevPrimary > band) add('strong', 'improvement', `primary ${pPrimary.toFixed(3)} against ${prevPrimary.toFixed(3)} in ${prev.label} ${on}: a gain beyond the noise band`);
  }
  const order = { invalid: 0, weak: 1, caveat: 2, strong: 3, info: 4 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

const PROPOSALS = {
  infra: 'Rerun the invalid runs before reading any number (session limit, login or scaffold failures are not the arm).',
  unrouted: 'The typed command did not start a route: check the bundle was rebuilt (`npm run build`) and the prompt hook saw the launch.',
  'naked-prompt': 'Run with `--prompt with` so the plugin arm types its command; otherwise no skill route is measured.',
  'quality-loss': 'Read the losing cases\' chains first (chains.md): find the first call where the plugin run diverges from what the bare run did.',
  unstable: 'Treat these cases as noisy: compare means over 3+ runs, or replace them in the curated set.',
  saturated: 'Replace saturated cases in the curated set: both arms already solve them, so they cost money and carry no signal.',
  floor: 'Replace or re-check floor cases: neither arm solves them, so a change cannot show; check the truth is reachable from the ticket.',
  'cost-case': 'Open the dear cases\' chains: look for re-reads, broad listings and long tool results that inflate the context every later call re-reads.',
  'unstable-case': 'Cases whose runs disagree: read the drift audit\'s first divergence per pair (eval-replay/evals/analysis/drift-2026-10-09) and fix one mechanism at a time.',
  'cost-driver': 'One case decides the cost ratio: fix or study that case before judging the rest.',
  turns: 'Compare the call chains of the cases with the largest call difference: fewer calls with equal quality is the cheapest win.',
  'step-unstable': 'Make the route step deterministic for one input (ordering, timestamps, slugs), so runs of a case are comparable.',
  'route-open': 'Routes left open: read what each run did after its last ledger entry (the hook output and the Stop path) to see why no exit was written.',
  'route-exit': 'Routes that exit other than done: read each exit reason in the ledger and the hook output before it.',
  'route-slow': 'The route step arrives late: profile the slow map layer for this repository and cache what does not change between runs.',
  'map-missed': 'The answer drops files the map listed: make the step say which leads must be confirmed or rejected, or carry a reason per lead.',
  'outside-map': 'True files reached only by the model\'s own search are the map\'s recall gap: check which repository signal would have reached them, and test a change free with `evals:map-recall` and `evals:shortlist-recall`.',
  'map-empty': 'Maps with no true file: inspect the terms the route ranked for these cases; the request\'s words may not reach the code.',
  'first-call-broad': 'The model re-explores instead of starting from the map: the step does not steer the first move. Make the first action concrete (open lead 1) rather than advisory.',
  'failed-calls': 'Failed tool calls cost a round trip each: read the errors in chains.md (sandbox denials, wrong paths, wrong flags).',
  rereads: 'Repeated reads of one file: a route step that hands over the needed ranges would save the re-read.',
  context: 'The plugin\'s injected context is paid on every call: shorten the largest injected source (see Context) or move it behind a step.',
  regression: 'A drop against an earlier iteration: diff the bundle and the route steps between the two iterations before anything else.',
};

/** One proposal per finding code, in finding order, each carrying how many runs or cases raised it. */
export function proposalsOf(findings) {
  const seen = new Map();
  for (const f of findings) if (PROPOSALS[f.code] && f.level !== 'strong') seen.set(f.code, (seen.get(f.code) ?? 0) + Math.max(1, f.evidence.length));
  return [...seen].map(([code, count]) => ({ code, count, text: PROPOSALS[code] }));
}

const cell = (value, digits = 2) => (value === null || value === undefined || Number.isNaN(value) ? '-' : typeof value === 'number' ? value.toFixed(digits) : String(value).replace(/\|/g, '\\|'));
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const trim = (text, full, size = TRIM) => {
  const flat = String(text ?? '').trim();
  return full || flat.length <= size ? flat : `${flat.slice(0, size)}… (+${flat.length - size} chars)`;
};
const anchor = (row) => `${row.case}-${row.arm}-${row.run}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const kb = (bytes) => (bytes === null || bytes === undefined ? '-' : `${(bytes / 1024).toFixed(1)} KB`);

function comparisonTable(columns) {
  const summaries = columns.map((c) => (c.rows.length ? summarize(c.rows) : null));
  const header = ['metric', ...columns.map((c) => c.label), ...(columns[1] ? ['Δ vs bare'] : [])];
  const lines = METRICS.map(([key, name, digits]) => {
    const values = summaries.map((s) => (s ? s[key] : null));
    if (values.every((v) => v === null)) return null;
    const delta = columns[1] && values[0] !== null && values[1] !== null ? values[0] - values[1] : null;
    return [name, ...values.map((v) => cell(v, digits)), ...(columns[1] ? [delta === null ? '-' : `${delta >= 0 ? '+' : ''}${delta.toFixed(digits)}`] : [])];
  }).filter(Boolean);
  lines.unshift(['runs (absent)', ...summaries.map((s) => (s ? `${s.runs} (${s.absent})` : '-')), ...(columns[1] ? [''] : [])]);
  lines.push(['pass rate', ...summaries.map((s) => cell(s?.passRate)), ...(columns[1] ? [''] : [])]);
  return table(header, lines);
}

/** report.md: verdict, findings, proposals, then the per-case, route, context, tools, time and price sections. */
export function renderReport({ label, file, current, plugin, bare, bareSource, baselineFile, previous, band, findings, proposals }) {
  const out = [];
  const kinds = [...new Set(plugin.map((r) => r.kind))];
  const totalCost = plugin.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  const drift = new Map(driftOf(plugin, ACCEPTANCE.drift).map((d) => [d.case, d]));
  out.push(`# Eval report: ${label}`, '');
  out.push(`Source: \`${path.relative(ROOT, file)}\`. Started ${current.startedAt}, Claude Code ${current.claudeVersion}, model ${current.suite?.modelOverride ?? 'unpinned'}, plugin ${pluginName(current) ?? '?'}, served prompt ${current.suite?.servedPrompt ?? 'unrecorded'}, ablation ${current.suite?.ablation ?? '?'}.`);
  out.push(`${new Set(plugin.map((r) => r.case)).size} cases, ${plugin.length} plugin runs, $${totalCost.toFixed(2)} (harness total $${cell(current.costUsd)}), ${cell((current.durationSeconds ?? 0) / 60, 1)} min, ${current.partial ? '**partial**' : 'complete'}.`);
  out.push(`Bare: ${bareSource ? `${bareSource}${baselineFile ? ` (\`${path.relative(ROOT, baselineFile)}\`)` : ''}, ${bare.length} runs` : 'none found: no comparison with the bare model'}. Previous: ${previous.length ? previous.map((p) => `\`${p.label}\``).join(', ') : 'none'}.`);
  out.push(`Noise band (widest repetition range of the primary metric): ${band === null ? 'none (one repetition)' : band.toFixed(3)}. Prices: list, per token (input ${PRICES.input}, cache write ${PRICES.cacheWrite}, cache read ${PRICES.cacheRead}, output ${PRICES.output}).`);
  out.push(`Policy (\`ACCEPTANCE\` in eval-gate.mjs): gate ${JSON.stringify(ACCEPTANCE.gate)}; findings ${JSON.stringify(ACCEPTANCE.report)}; drift ${JSON.stringify(ACCEPTANCE.drift)}. Cost ratios are agent cost: the harness total includes judging.`, '');

  out.push('## 1. This run against bare and the previous iterations', '');
  for (const kind of kinds) {
    const columns = [
      { label: '**this**', rows: plugin.filter((r) => r.kind === kind) },
      { label: 'bare', rows: bare.filter((r) => r.kind === kind) },
      ...previous.map((p) => ({ label: p.label, rows: p.rows.filter((r) => r.arm === 'with' && r.kind === kind && plugin.some((x) => x.case === r.case)) })),
    ];
    out.push(`### ${kind}`, '', comparisonTable(columns), '');
  }

  const level = { invalid: 'INVALID', weak: 'weak', caveat: 'caveat', strong: 'strong', info: 'info' };
  out.push('## 2. Strong and weak places', '');
  if (!findings.length) out.push('Nothing crossed a threshold.', '');
  for (const f of findings) {
    out.push(`- **${level[f.level]}** \`${f.code}\` ${f.text}`);
    for (const e of f.evidence.slice(0, 6)) out.push(`  - ${e}`);
    if (f.evidence.length > 6) out.push(`  - … ${f.evidence.length - 6} more`);
  }
  out.push('', '## 3. Proposals', '');
  if (!proposals.length) out.push('None: no weak place found.');
  proposals.forEach((p, i) => out.push(`${i + 1}. ${p.text} (\`${p.code}\`, ${p.count}×)`));
  out.push('');

  out.push('## 4. Per case', '');
  const prevByCase = previous.map((p) => byCase(p.rows.filter((r) => r.arm === 'with')));
  const bareByCase = byCase(bare);
  const caseRows = [...byCase(plugin)].map(([name, rows]) => {
    const p = summarize(rows);
    const b = bareByCase.has(name) ? summarize(bareByCase.get(name)) : null;
    const prim = (rs) => (rs ? mean(rs.filter((r) => !r.absent).map(primaryOf)) : null);
    return [
      name, rows[0].kind, `${p.runs}`,
      cell(prim(rows)), cell(prim(bareByCase.get(name))), ...prevByCase.map((m) => cell(prim(m.get(name)))),
      cell(p.agentCostUsd, 3), cell(b?.agentCostUsd, 3), cell(ratio(p.agentCostUsd, b?.agentCostUsd ?? null)),
      `${cell(p.modelCalls, 1)}/${cell(b?.modelCalls, 1)}`, `${cell(p.peakContext, 0)}/${cell(b?.peakContext, 0)}`,
      cell(p.spread), drift.get(name)?.status ?? '-', rows.map((r) => r.outcome ?? '-').join(' '),
      rows.map((r) => `[${r.run}](chains.md#${anchor(r)})`).join(' '),
    ];
  });
  out.push(table(['case', 'kind', 'runs', 'primary', 'bare', ...previous.map((p) => p.label), '$ agent', '$ bare agent', 'ratio', 'calls p/b', 'peak ctx p/b', 'spread', 'drift', 'outcomes', 'chains'], caseRows), '');

  const routed = plugin.filter((r) => r.route);
  out.push('## 5. Route', '');
  if (!routed.length) out.push('No ledger was harvested for the plugin arm.', '');
  else {
    const endings = routed.reduce((m, r) => m.set(r.route.signature, (m.get(r.route.signature) ?? 0) + 1), new Map());
    out.push(table(['ledger sequence', 'runs'], [...endings].sort((a, b) => b[1] - a[1]).map(([s, n]) => [`\`${s}\``, `${n}`])), '');
    const steps = new Map();
    for (const r of routed) for (const s of r.route.steps) steps.set(s.label, [...(steps.get(s.label) ?? []), s]);
    out.push(table(['entry', 'actor', 'runs', 'mean ms from route start', 'mean bytes'], [...steps].map(([name, list]) => [name, list[0].actor ?? '-', `${list.length}`, cell(mean(list.map((s) => s.ms)), 0), cell(mean(list.map((s) => s.bytes)), 0)])), '');
    const layers = new Map();
    for (const r of routed) for (const l of r.route.mapLayers) layers.set(l.name, [...(layers.get(l.name) ?? []), l]);
    if (layers.size) out.push(table(['map layer', 'runs', 'mean ms', 'mean hits'], [...layers].map(([name, list]) => [name, `${list.length}`, cell(mean(list.map((l) => l.ms)), 0), cell(mean(list.map((l) => l.hits)), 1)])), '');
    const withMap = plugin.filter((r) => r.mapTrue);
    if (withMap.length)
      out.push(table(['case', 'true files', 'true in map', 'true named from map', 'true named outside map', 'map true left out'], [...byCase(withMap)].map(([name, rows]) => [name, `${rows[0].truth.length}`, `${rows[0].mapTrue.length}`, cell(mean(rows.map((r) => r.mapTrue.length - r.mapTrueMissed.length)), 1), cell(mean(rows.map((r) => r.trueOutsideMap.length)), 1), cell(mean(rows.map((r) => r.mapTrueMissed.length)), 1)])), '');
  }

  out.push('## 6. Context', '');
  const sources = new Set([...plugin, ...bare].flatMap((r) => Object.keys(r.injected ?? {})));
  if (sources.size) {
    const avg = (rows, key) => mean(rows.filter((r) => r.injected).map((r) => r.injected[key] ?? 0));
    out.push('Attachments the session recorded, by type and hook event; not every one reaches the model (a prompt snapshot is a UI record).', '');
    out.push(table(['session attachment', 'plugin mean', 'bare mean'], [...sources].sort().map((key) => [key, kb(avg(plugin, key)), kb(avg(bare, key))])), '');
  }
  out.push(table(['', 'plugin', 'bare'], [
    ['context, 1st call (tokens)', cell(mean(plugin.map((r) => r.firstContext)), 0), cell(mean(bare.map((r) => r.firstContext)), 0)],
    ['context, peak (tokens)', cell(mean(plugin.map((r) => r.peakContext)), 0), cell(mean(bare.map((r) => r.peakContext)), 0)],
    ['route step (bytes)', cell(mean(plugin.map((r) => r.step?.bytes)), 0), '-'],
  ]), '');

  out.push('## 7. Tools and files', '');
  const classes = [...new Set([...plugin, ...bare].flatMap((r) => Object.keys(r.toolCounts ?? {})))].sort();
  const perRun = (rows, pick) => mean(rows.filter((r) => r.traced).map(pick));
  const pooled = (rows) => {
    const traced = rows.filter((r) => r.traced);
    const requests = traced.reduce((n, r) => n + (r.readRequests ?? 0), 0);
    return requests ? traced.reduce((n, r) => n + (r.readPaths ?? 0), 0) / requests : null;
  };
  if (classes.length)
    out.push(table(['tool class', 'calls/run plugin', 'calls/run bare', 'result KB/run plugin', 'result KB/run bare'], classes.map((c) => [c, cell(perRun(plugin, (r) => r.toolCounts[c] ?? 0), 2), cell(perRun(bare, (r) => r.toolCounts[c] ?? 0), 2), cell(perRun(plugin, (r) => r.resultKb[c] ?? 0), 1), cell(perRun(bare, (r) => r.resultKb[c] ?? 0), 1)])), '');
  const received = plugin.filter((r) => r.readerReceipts);
  out.push(table(['', 'plugin', 'bare'], [
    ['files read / run', cell(perRun(plugin, (r) => r.filesRead), 1), cell(perRun(bare, (r) => r.filesRead), 1)],
    ['true files read / run', cell(perRun(plugin, (r) => r.trueFilesRead), 1), cell(perRun(bare, (r) => r.trueFilesRead), 1)],
    ['files read twice or more / run', cell(perRun(plugin, (r) => r.rereads), 2), cell(perRun(bare, (r) => r.rereads), 2)],
    ['model calls that read / run', cell(perRun(plugin, (r) => r.readRequests), 2), cell(perRun(bare, (r) => r.readRequests), 2)],
    ['  of those naming one path / run', cell(perRun(plugin, (r) => r.singleFileReads), 2), cell(perRun(bare, (r) => r.singleFileReads), 2)],
    ['paths per reading call (pooled)', cell(pooled(plugin), 2), cell(pooled(bare), 2)],
    ['re-read result KB / run', cell(perRun(plugin, (r) => r.rereadBytes / 1024), 1), cell(perRun(bare, (r) => r.rereadBytes / 1024), 1)],
    ['call of the first true-file read', cell(perRun(plugin, (r) => r.firstTrueReadCall), 1), cell(perRun(bare, (r) => r.firstTrueReadCall), 1)],
    [`reader calls / run, ${received.length} runs with a receipt (ledger)`, cell(perRun(received, (r) => r.readerReceipts.calls), 2), '-'],
    ['  the same runs, `ambicode read` by command text', cell(perRun(received, (r) => r.toolCounts['ambicode read'] ?? 0), 2), '-'],
    ['  the same runs, reader KB served (ledger)', cell(perRun(received, (r) => r.readerReceipts.bytes / 1024), 1), '-'],
    ['calls issuing > 1 tool / run', cell(perRun(plugin, (r) => r.parallelCalls), 2), cell(perRun(bare, (r) => r.parallelCalls), 2)],
    ['failed tool calls / run', cell(perRun(plugin, (r) => r.failedCalls), 2), cell(perRun(bare, (r) => r.failedCalls), 2)],
  ]), '');
  const exposed = (rows) => {
    const sum = (key) => rows.filter((r) => r.missing && !r.absent).reduce((n, r) => n + r.missing[key], 0);
    const missing = sum('missing');
    const of = (key) => `${sum(key)}${missing ? ` (${((100 * sum(key)) / missing).toFixed(0)}%)` : ''}`;
    return [`${missing}`, of('served'), `${sum('servedExcluded')}`, of('discovered'), of('unseen'), of('unknown'), `${sum('futureMissing')}/${sum('future')}`];
  };
  if (plugin.some((r) => r.missing))
    out.push('Missing existing truth, pooled over runs, by the furthest the run got with each file (`fileStates`). The answer lever reaches `served` only; created files are apart.', '',
      table(['arm', 'missing', 'served', '  of those excluded', 'discovered only', 'unseen', 'unknown', 'created missing'], [['plugin', ...exposed(plugin)], ['bare', ...exposed(bare)]]), '');
  const firsts = plugin.filter((r) => r.firstTool).reduce((m, r) => m.set(r.firstTool.class, (m.get(r.firstTool.class) ?? 0) + 1), new Map());
  if (firsts.size) out.push(`First tool call of the plugin arm: ${[...firsts].map(([c, n]) => `${c} ×${n}`).join(', ')}.`, '');

  out.push('## 8. Time', '');
  out.push(table(['seconds per run', 'plugin', 'bare'], [
    ['wall (harness)', cell(mean(plugin.map((r) => r.wallS)), 1), cell(mean(bare.map((r) => r.wallS)), 1)],
    ['scaffold, before the session', cell(mean(plugin.map((r) => r.setupS)), 1), cell(mean(bare.map((r) => r.setupS)), 1)],
    ['agent session', cell(mean(plugin.map((r) => r.agentS)), 1), cell(mean(bare.map((r) => r.agentS)), 1)],
    ['API', cell(mean(plugin.map((r) => r.apiS)), 1), cell(mean(bare.map((r) => r.apiS)), 1)],
    ['session start to the first model call', cell(mean(plugin.map((r) => r.firstCallS)), 1), cell(mean(bare.map((r) => r.firstCallS)), 1)],
    ['session start to the route step', cell(mean(plugin.map((r) => r.routeReadyS)), 1), '-'],
    ['map layers', cell(mean(plugin.map((r) => (r.mapMs ?? null) && r.mapMs / 1000)), 1), '-'],
  ]), '');

  out.push('## 9. Price', '');
  const price = (rows, key) => mean(rows.filter((r) => r.price).map((r) => r.price[key]));
  out.push(table(['$ per run', 'plugin', 'bare'], [
    ...['input', 'cacheWrite', 'cacheRead', 'output'].map((k) => [k, cell(price(plugin, k), 4), cell(price(bare, k), 4)]),
    ['agent (trace)', cell(mean(plugin.map((r) => r.agentCostUsd)), 4), cell(mean(bare.map((r) => r.agentCostUsd)), 4)],
    ['harness cost (agent + judge)', cell(mean(plugin.map((r) => r.costUsd)), 4), cell(mean(bare.map((r) => r.costUsd)), 4)],
    ['judge', cell(mean(plugin.map((r) => r.judgeCostUsd)), 4), cell(mean(bare.map((r) => r.judgeCostUsd)), 4)],
  ]), '');
  out.push(`Arm totals: plugin $${totalCost.toFixed(3)}${bare.length ? `, bare $${bare.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(3)} over ${bare.length} runs` : ''}.`, '');
  out.push('Every run\'s full chain is in [chains.md](chains.md); the numbers above are in report.json.', '');
  return out.join('\n');
}

/** chains.md: per run the route ledger, the injected context, every model call and tool call, and the answer. */
export function renderChains(rows, { full = false } = {}) {
  const out = ['# Run chains', ''];
  for (const r of rows) {
    out.push(`## <a id="${anchor(r)}"></a>${r.case} · ${r.arm} · run ${r.run} · ${r.id ?? 'no trace id'}`, '');
    out.push(`primary ${cell(primaryOf(r))} · score ${cell(r.score)} · $${cell(r.agentCostUsd, 3)} agent · ${r.outcome ?? '-'} · ${cell(r.wallS, 0)} s · ${r.modelCalls ?? '-'} model calls · ${r.toolCalls ?? '-'} tool calls · peak ctx ${r.peakContext ?? '-'}${r.infra ? ` · **INVALID: ${r.infra}**` : r.error ? ` · error: ${r.error}` : ''}`, '');
    if (r.route) {
      out.push(`Route \`${r.route.skill ?? '?'}\`: \`${r.route.signature}\``, '');
      out.push(table(['+ms', 'entry', 'actor', 'bytes', 'detail'], r.route.steps.map((s) => {
        const { id, at, route, kind, step, status, actor, bytes, ...rest } = s.entry;
        return [cell(s.ms, 0), s.label, actor ?? '-', bytes ?? '-', `\`${trim(JSON.stringify(rest), full, 200).replace(/\|/g, '\\|')}\``];
      })), '');
    }
    if (r.step) {
      const mark = (f) => `${f}${r.truth.includes(f) ? ' ✓' : ''}`;
      out.push(`Map leads: ${r.step.leads.map(mark).join(', ') || '-'}.`, '');
    }
    if (r.injected) out.push(`Injected: ${Object.entries(r.injected).map(([k, v]) => `${k} ${kb(v)}`).join(', ')}.`, '');
    for (const [i, call] of (r.calls ?? []).entries()) {
      const u = call.usage ?? {};
      out.push(`### call ${i + 1} · +${cell((call.offsetMs ?? 0) / 1000, 1)} s · ctx ${call.context ?? '-'} (write ${u.cache_creation_input_tokens ?? 0}, read ${u.cache_read_input_tokens ?? 0}) · out ${u.output_tokens ?? '-'} · $${cell(call.usd, 4)}${call.thinkingChars ? ` · thinking ${call.thinkingChars} chars` : ''}`, '');
      for (const text of call.text) if (text.trim()) out.push(`> ${trim(text, full).replace(/\n/g, '\n> ')}`, '');
      for (const t of call.tools) {
        const input = t.name === 'Bash' ? t.input.command : t.name === 'Read' ? t.input.file_path : JSON.stringify(t.input);
        const files = t.files?.length ? ` · files: ${t.files.map((f) => `${f}${r.truth.includes(f) ? ' ✓' : ''}`).join(', ')}` : '';
        out.push(`- **${t.name}** [${t.class}] \`${trim(input, full, 300).replace(/`/g, "'").replace(/\n/g, ' ⏎ ')}\` → ${kb(t.resultBytes)}, ${t.ms === null ? '-' : `${(t.ms / 1000).toFixed(1)} s`}${t.error ? ' · **error**' : ''}${files}`);
        if (t.error || full) out.push(`  - result: \`${trim(t.result, full, 300).replace(/`/g, "'").replace(/\n/g, ' ⏎ ')}\``);
      }
      out.push('');
    }
    if (r.namedFiles) out.push(`Answer named: ${r.namedFiles.map((f) => `${f} ${r.truth.includes(f) ? '✓' : '✗'}`).join(', ') || 'nothing'}; true files not named: ${r.truth.filter((f) => !r.namedFiles.includes(f)).join(', ') || 'none'}.`, '');
    const failed = r.graders.filter((g) => g.passed === false);
    if (failed.length) out.push(`Failed graders: ${failed.map((g) => `${g.name} (${g.explanation ?? '-'})`).join('; ')}.`, '');
  }
  return out.join('\n');
}

function resolveResult(target) {
  const resolved = path.resolve(target);
  if (!statSync(resolved).isDirectory()) return resolved;
  const dir = existsSync(path.join(resolved, 'results')) ? path.join(resolved, 'results') : resolved;
  const json = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  if (json.length !== 1) throw new Error(`${dir} holds ${json.length} result files: name one`);
  return path.join(dir, json[0]);
}

const strip = (rows) => rows.map(({ calls, answer, step, ...rest }) => ({ ...rest, ...(step ? { step: { bytes: step.bytes, leads: step.leads } } : {}) }));

export function buildReport(target, { baseline = null, lockFile = BASELINE_LOCK_FILE, previous = PREVIOUS, out = null, full = false, outputs = OUTPUTS, reports = REPORTS, cases = CASES_ROOT } = {}) {
  const file = resolveResult(target);
  const current = JSON.parse(readFileSync(file, 'utf8'));
  const layout = layoutOf(file, { outputs, reports });
  const candidates = resultFiles(outputs, layout.type);
  const found = findComparisons(current, file, candidates, previous);
  const baselineEntry = resolveBaseline(current, { baselinePath: baseline ?? undefined, lockFile });
  // Thrown away; run only for its refusal of a baseline of another model, Claude Code version, case or prompt.
  if (baselineEntry) withBaseline(current, baselineEntry.results, { baselinePath: baselineEntry.file });
  const rows = analyzeResult(current, { tracesDirs: layout.tracesDirs, cases });
  const baselineRows = baselineEntry ? analyzeResult(baselineEntry.results, { tracesDirs: baselineEntry.files.flatMap((f) => layoutOf(f, { outputs, reports }).tracesDirs), cases, withChains: false }) : null;
  const { plugin, bare, bareSource } = armsOf(rows, baselineRows, baselineEntry?.results);
  const prev = found.previous.map((p) => ({ label: layoutOf(p.file, { outputs, reports }).label, file: p.file, rows: analyzeResult(p.results, { tracesDirs: layoutOf(p.file, { outputs, reports }).tracesDirs, cases, withChains: false }) }));
  const band = noiseBand(plugin, bare);
  const usesOwnBare = rows.some((r) => r.arm === 'without');
  const findings = findingsOf({ plugin, bare, previous: prev, band, servedPrompt: current.suite?.servedPrompt, current, baselineResults: usesOwnBare ? null : baselineEntry?.results });
  const proposals = proposalsOf(findings);
  const reportDir = out ? path.resolve(out) : layout.reportDir;
  mkdirSync(reportDir, { recursive: true });
  const shown = { label: layout.label, file, current, plugin, bare, bareSource, baselineFile: usesOwnBare ? null : baselineEntry?.file, previous: prev, band, findings, proposals };
  writeFileSync(path.join(reportDir, 'report.md'), renderReport(shown));
  writeFileSync(path.join(reportDir, 'chains.md'), renderChains([...plugin, ...rows.filter((r) => r.arm === 'without')], { full }));
  writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify({ source: file, baseline: shown.baselineFile ?? null, previous: prev.map((p) => p.file), band, findings, proposals, plugin: strip(plugin), bare: strip(bare) }, null, 1)}\n`);
  return { reportDir, findings, proposals };
}

function main(argv) {
  const option = (name) => {
    const at = argv.indexOf(name);
    return at < 0 ? null : argv[at + 1];
  };
  const target = argv.find((arg, i) => !arg.startsWith('--') && !['--baseline', '--previous', '--out'].includes(argv[i - 1]));
  if (!target) throw new Error('usage: run-report.mjs <result.json | iteration dir> [--baseline <result.json>] [--previous <n>] [--out <dir>] [--full]');
  const { reportDir, findings, proposals } = buildReport(target, { baseline: option('--baseline'), previous: option('--previous') === null ? PREVIOUS : Number(option('--previous')), out: option('--out'), full: argv.includes('--full') });
  const count = (level) => findings.filter((f) => f.level === level).length;
  console.log(`report: ${path.relative(process.cwd(), reportDir)}/report.md (chains.md, report.json)`);
  console.log(`findings: ${count('invalid')} invalid, ${count('weak')} weak, ${count('strong')} strong, ${count('caveat')} caveats; ${proposals.length} proposals`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

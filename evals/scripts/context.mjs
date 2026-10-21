// Context size of one run, read from its trace: what the main session sent the model on each call.
// A call's context is input + cache-created + cache-read tokens. Subagent calls (parent_tool_use_id set) are left out:
// the trace carries only some of them (the task-fix probe of 2026-10-10 shows 1 of the reviewer's several calls).
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextTokens, events } from './trace.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where the per-run workspace copies (`<case>-<n>.ambicode/`) live: outside the repo, at the same path relative to it.
 * Kept inside, they were 13,596 of 15,744 entries under evals/ and `claude plugin eval` refuses a directory over 20,000.
 */
export function archiveOf(dir, env = process.env, repo = REPO) {
  return path.join(path.resolve(env.AMBICODE_EVAL_ARCHIVE ?? path.join(repo, '..', 'eval-archive')), path.relative(repo, dir));
}

/**
 * `{peak, final, calls, tools, session, api, costUsd}`: sizes in tokens, `tools` the distinct main-session tool_use blocks, `session`/`api` the seconds
 * the session and its model calls took, `costUsd` the trace's total (subagents included, no judge) (the harness's durationSeconds also counts case setup and graders); null when the trace has no main-session call.
 */
export function contextOf(traceText) {
  const calls = new Map();
  const tools = new Set();
  let result = null;
  for (const event of events(traceText)) {
    if (event.type === 'result') result = event;
    if (event.type !== 'assistant' || event.parent_tool_use_id || !event.message?.usage) continue;
    // One API call streams as several events with the same message id and the same usage.
    const usage = event.message.usage;
    for (const part of event.message.content ?? []) if (part.type === 'tool_use' && part.id) tools.add(part.id);
    calls.set(event.message.id, contextTokens(usage));
  }
  const sizes = [...calls.values()];
  const seconds = (ms) => (typeof ms === 'number' ? Math.round(ms / 100) / 10 : null);
  return sizes.length === 0 ? null : { peak: Math.max(...sizes), final: sizes.at(-1), calls: sizes.length, tools: tools.size, session: seconds(result?.duration_ms), api: seconds(result?.duration_api_ms), costUsd: result?.total_cost_usd ?? null };
}

/** The harness's sandbox of a trace (`<tmp>/e-XXXX/out/trace.jsonl`), or null for any other path: never delete beyond it. */
export function sandboxOf(tracePath) {
  const dir = path.dirname(path.dirname(tracePath));
  return /^e-[A-Za-z0-9]+$/.test(path.basename(dir)) && path.basename(path.dirname(tracePath)) === 'out' ? dir : null;
}

/** Copies `<cwd>/.ambicode` and `<cwd>/<dir>/.ambicode` (the case's `repo/`) to `target`; null when there is none. */
function keepAmbicode(cwd, target) {
  const found = [];
  if (existsSync(path.join(cwd, '.ambicode'))) found.push('.ambicode');
  for (const entry of existsSync(cwd) ? readdirSync(cwd, { withFileTypes: true }) : []) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && existsSync(path.join(cwd, entry.name, '.ambicode'))) found.push(path.join(entry.name, '.ambicode'));
  }
  // context/ is kept: the scout's output per run is the reference for later scout comparisons. The bench-input copy it once
  // excluded (~196 files per run, 17,642 entries against the harness eval-dir limit of 20,000) is checked by the count before each paid run.
  for (const relative of found) cpSync(path.join(cwd, relative), path.join(target, relative), { recursive: true });
  return found.length === 0 ? null : target;
}

function unseal(dir) {
  chmodSync(dir, 0o700);
  for (const entry of readdirSync(dir)) {
    const child = path.join(dir, entry);
    const stat = statSync(child, { throwIfNoEntry: false });
    if (stat?.isDirectory() && !stat.isSymbolicLink()) unseal(child);
  }
}

/**
 * Adds `context` to every run of a result kept with --keep-temp, copies each trace to `<tracesDir>/<case>-<n>.jsonl`
 * (one directory per run of the suite: an earlier run's traces are never touched; the `.ambicode` copies go to `archiveDir`),
 * and deletes the sandbox (it holds a whole fixture, node_modules included). A run whose trace is gone keeps no context.
 */
export function harvest(result, tracesDir, { remove = true, archiveDir = tracesDir } = {}) {
  mkdirSync(tracesDir, { recursive: true });
  for (const evalCase of result.cases ?? []) {
    for (const runs of Object.values(evalCase.arms ?? {})) {
      (runs ?? []).forEach((run, index) => {
        if (!run.tracePath || !existsSync(run.tracePath)) return;
        run.context = contextOf(readFileSync(run.tracePath, 'utf8'));
        run.trace = path.join(tracesDir, `${evalCase.name}-${index + 1}.jsonl`);
        copyFileSync(run.tracePath, run.trace);
        const sandbox = sandboxOf(run.tracePath);
        if (sandbox === null) return;
        // The harness seals what the plugin wrote (mode 000) in a read-only directory.
        unseal(sandbox);
        // The route's own record (ledger, delivered steps and payloads): the trace does not hold what a hook injected.
        const kept = keepAmbicode(path.join(sandbox, 'sealed', 'home', 'cwd'), path.join(archiveDir, path.basename(run.trace).replace(/\.jsonl$/, '.ambicode')));
        if (kept !== null) run.ambicode = kept;
        if (remove) rmSync(sandbox, { recursive: true, force: true });
      });
    }
  }
  return result;
}

// Context size of one run, read from its trace: what the main session sent the model on each call.
// A call's context is input + cache-created + cache-read tokens. Subagent calls (parent_tool_use_id set) are left out:
// the trace carries only some of them (the task-fix probe of 2026-10-10 shows 1 of the reviewer's several calls).
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/** `{peak, final, calls, tools}`: sizes in tokens, `tools` the distinct main-session tool_use blocks, or null when the trace has no main-session call. */
export function contextOf(traceText) {
  const calls = new Map();
  const tools = new Set();
  for (const line of traceText.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== 'assistant' || event.parent_tool_use_id || !event.message?.usage) continue;
    // One API call streams as several events with the same message id and the same usage.
    const usage = event.message.usage;
    for (const part of event.message.content ?? []) if (part.type === 'tool_use' && part.id) tools.add(part.id);
    calls.set(event.message.id, (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
  }
  const sizes = [...calls.values()];
  return sizes.length === 0 ? null : { peak: Math.max(...sizes), final: sizes.at(-1), calls: sizes.length, tools: tools.size };
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
 * (one directory per run of the suite: an earlier run's traces are never touched),
 * and deletes the sandbox (it holds a whole fixture, node_modules included). A run whose trace is gone keeps no context.
 */
export function harvest(result, tracesDir, { remove = true } = {}) {
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
        const kept = keepAmbicode(path.join(sandbox, 'sealed', 'home', 'cwd'), run.trace.replace(/\.jsonl$/, '.ambicode'));
        if (kept !== null) run.ambicode = kept;
        if (remove) rmSync(sandbox, { recursive: true, force: true });
      });
    }
  }
  return result;
}

// Context size of one run, read from its trace: what the main session sent the model on each call.
// A call's context is input + cache-created + cache-read tokens. Subagent calls (parent_tool_use_id set) are left out:
// the trace carries only some of them (the task-fix probe of 2026-10-10 shows 1 of the reviewer's several calls).
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/** `{peak, final, calls}` in tokens, or null when the trace has no main-session call. */
export function contextOf(traceText) {
  const calls = new Map();
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
    calls.set(event.message.id, (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
  }
  const sizes = [...calls.values()];
  return sizes.length === 0 ? null : { peak: Math.max(...sizes), final: sizes.at(-1), calls: sizes.length };
}

/** The harness's sandbox of a trace (`<tmp>/e-XXXX/out/trace.jsonl`), or null for any other path: never delete beyond it. */
export function sandboxOf(tracePath) {
  const dir = path.dirname(path.dirname(tracePath));
  return /^e-[A-Za-z0-9]+$/.test(path.basename(dir)) && path.basename(path.dirname(tracePath)) === 'out' ? dir : null;
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
 * Adds `context` to every run of a result kept with --keep-temp, copies each trace to `<tracesDir>/<case>-<n>.jsonl`,
 * and deletes the sandbox (it holds a whole fixture, node_modules included). A run whose trace is gone keeps no context.
 */
export function harvest(result, tracesDir, { remove = true } = {}) {
  rmSync(tracesDir, { recursive: true, force: true });
  mkdirSync(tracesDir, { recursive: true });
  for (const evalCase of result.cases ?? []) {
    for (const runs of Object.values(evalCase.arms ?? {})) {
      (runs ?? []).forEach((run, index) => {
        if (!run.tracePath || !existsSync(run.tracePath)) return;
        run.context = contextOf(readFileSync(run.tracePath, 'utf8'));
        run.trace = path.join(tracesDir, `${evalCase.name}-${index + 1}.jsonl`);
        copyFileSync(run.tracePath, run.trace);
        const sandbox = sandboxOf(run.tracePath);
        if (remove && sandbox !== null) {
          // The harness seals what the plugin wrote (mode 000) in a read-only directory.
          unseal(sandbox);
          rmSync(sandbox, { recursive: true, force: true });
        }
      });
    }
  }
  return result;
}

import path from 'node:path';
import type { Handler, HandlerResult } from '#types/harness';

const NAME = /^[\w-]+$/;
// A skill script lists files and greps; 60 s is ten times the slowest one measured (plan-check on the FE fixture, 5.8 s).
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

interface ScriptOutput {
  payload?: string | null;
  record?: Record<string, unknown>;
  entries?: Record<string, unknown>[];
  failed?: { code: string; message: string; recoverable?: boolean; revise?: { args: Record<string, readonly string[]>; lastRound?: string } };
  raise?: { gate: string; values: Record<string, readonly string[]> };
  exit?: string;
  exitDetail?: string;
}

/**
 * `run: script(<name>)` (C7): the step is `skills/<skill>/scripts/<name>.mjs`, a plain ESM file with no
 * imports from src/. It gets the step input as JSON on stdin and answers with JSON on stdout:
 * `payload` (the step text), `record` (fields merged into the step's completion entry), `entries`
 * (ledger entries to append, each with a `kind`), or `failed` / `raise` with the handler's own shapes. Entries are appended before a `failed`, so a failing check still leaves its record.
 * The script never writes the ledger itself; a script that must write outside the ledger is a CLI command.
 */
export const scriptHandler: Handler = async (input): Promise<HandlerResult> => {
  const name = input.params[0] ?? '';
  if (!NAME.test(name)) return { state: 'failed', code: 'script-name-invalid', message: `script(${name}): a script name is letters, digits, "_" or "-".`, recoverable: false };
  const file = path.join(input.runtime.pluginRoot, 'skills', input.view.skill, 'scripts', `${name}.mjs`);
  const stdin = JSON.stringify({
    task: input.view.task, skill: input.view.skill, repositoryRoot: input.dir.repositoryRoot, taskDir: input.dir.root, steps: input.dir.steps,
    args: input.args, params: input.params.slice(1), revise: input.revise, raisedBy: input.raisedBy, headless: input.view.mode === 'headless',
  });
  const outcome = await input.runtime.runner.run({ argv: [process.execPath, file], cwd: input.dir.repositoryRoot, timeoutMs: TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES, env: { kind: 'inherited' }, stdin });
  const where = path.relative(input.runtime.pluginRoot, file);
  if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
    const detail = outcome.failure ?? outcome.stderr.trim().split('\n').slice(-3).join(' | ');
    return { state: 'failed', code: 'script-failed', message: `${where} ${outcome.kind === 'exited' ? `exited ${outcome.exitCode}` : outcome.kind}${detail === '' ? '' : `: ${detail}`}`, recoverable: false };
  }
  let output: ScriptOutput;
  try {
    output = JSON.parse(outcome.stdout) as ScriptOutput;
  } catch {
    return { state: 'failed', code: 'script-output-invalid', message: `${where} printed no JSON object (${outcome.stdout.length} bytes).`, recoverable: false };
  }
  for (const entry of output.entries ?? []) {
    if (typeof entry['kind'] !== 'string') return { state: 'failed', code: 'script-output-invalid', message: `${where}: an entry has no kind.`, recoverable: false };
    await input.ledger.append({ ...entry, route: input.view.routeId } as never);
  }
  if (output.failed !== undefined) return { state: 'failed', recoverable: false, ...output.failed };
  if (output.raise !== undefined) return { state: 'raise', ...output.raise };
  return { state: 'ok', payload: output.payload ?? null, ...(output.record === undefined ? {} : { record: output.record }), ...(output.exit === undefined ? {} : { exit: output.exit, exitDetail: output.exitDetail }) };
};

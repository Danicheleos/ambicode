import path from 'node:path';
import { TEST_PATH_PATTERNS } from '#util/path-classes';
import type { Handler, HandlerResult } from '#types/harness';

const NAME = /^[\w-]+$/;
// `route next` runs inside the model's Bash tool call (default timeout 120 s); the script must time out first so the error with its last stage and Retry/Give up lines reaches the user, with ~20 s left for the rest of the step.
// 60 s killed the review brief step on Windows (1m0.47s); the in-process related-file scan now takes about 1 s on a 4.9k-file checkout (commit 639109f8).
const TIMEOUT_MS = 100_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
// A node crash prints about 700 characters (source line, error, six frames); the error leads, the version line trails. 1,800 holds twice that.
const STDERR_CHARS = 1800;
const ANSI = /\u001b\[[0-9;]*m/g;

interface ScriptOutput {
  payload?: string | null;
  record?: Record<string, unknown>;
  entries?: Record<string, unknown>[];
  failed?: { code: string; message: string; recoverable?: boolean; revise?: { args: Record<string, readonly string[]> } };
  raise?: { gate: string; values: Record<string, readonly string[]> };
  exit?: string;
  exitDetail?: string;
}

/**
 * `run: script(<name>)` (C7): the step is `skills/<skill>/scripts/<name>.mjs`, a plain ESM file with no
 * imports from src/. It gets the step input as JSON on stdin (with `testPatterns`, the sources of the test-path regular expressions, so a script judges a test file as the review does) and answers with JSON on stdout:
 * `payload` (the step text), `record` (fields merged into the step's completion entry), `entries`
 * (ledger entries to append, each with a `kind`), or `failed` / `raise` with the handler's own shapes. Entries are appended before a `failed`, so a failing check still leaves its record.
 * The script never writes the ledger itself; a script that must write outside the ledger is a CLI command.
 */
export const scriptHandler: Handler = async (input): Promise<HandlerResult> => {
  const name = input.params[0] ?? '';
  if (!NAME.test(name)) return { state: 'failed', code: 'script-name-invalid', message: `script(${name}): a script name is letters, digits, "_" or "-".`, recoverable: false };
  const file = path.join(input.runtime.pluginRoot, 'skills', input.view.skill, 'scripts', `${name}.mjs`);
  const stdin = JSON.stringify({
    task: input.view.task, skill: input.view.skill, repositoryRoot: input.dir.repositoryRoot, cwd: input.runtime.cwd, taskDir: input.dir.root, steps: input.dir.steps,
    args: input.args, params: input.params.slice(1), revise: input.revise, raisedBy: input.raisedBy, headless: input.view.mode === 'headless',
    testPatterns: TEST_PATH_PATTERNS.map((pattern) => pattern.source),
  });
  const outcome = await input.runtime.runner.run({ argv: [process.execPath, file], cwd: input.dir.repositoryRoot, timeoutMs: TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES, env: { kind: 'inherited' }, stdin });
  const where = path.relative(input.runtime.pluginRoot, file);
  if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
    const detail = outcome.failure ?? outcome.stderr.replace(ANSI, '').split('\n').map((line) => line.trimEnd()).filter((line) => line !== '').join(' | ').slice(0, STDERR_CHARS);
    // A killed script cannot say why it was slow: the last line it wrote is the stage it was waiting in.
    const waiting = outcome.kind === 'timed-out' ? outcome.stderr.replace(ANSI, '').split('\n').map((line) => line.trim()).filter((line) => line !== '').at(-1) : undefined;
    const kind = outcome.kind === 'exited' ? `exited ${outcome.exitCode}` : outcome.kind === 'timed-out' ? `timed-out after ${Math.round(TIMEOUT_MS / 1000)} s${waiting === undefined ? ' (it wrote no stage line)' : `, last stage: ${waiting}`}` : outcome.kind;
    return { state: 'failed', code: 'script-failed', message: `${where} ${kind}${detail === '' || waiting !== undefined ? '' : `: ${detail}`}`, recoverable: false };
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

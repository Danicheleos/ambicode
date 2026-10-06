import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { FileSystem } from '../ports/filesystem.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { localTimestamp } from '../review/review-name.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import { withLedgerLock, type LockedLedger } from '../task/ledger-lock.ts';
import { owningRoute, type NoteDeps } from '../task/notes.ts';
import { resolveTaskDir } from '../task/task-dir.ts';
import { AmbicodeError } from '../util/errors.ts';
import { runWorkerProcess } from './process-runner.ts';

export const MAX_ARTIFACT_BYTES = 65_536;
const MAX_OUTPUT_BYTES = 1_048_576;
const RELEASE = 'continue inline — do this work in the session; the worker\'s output was not used';

const JsonType = z.enum(['string', 'number', 'boolean', 'array', 'object']);
const Definition = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  argv: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().positive(),
  tools: z.array(z.string().min(1)).optional(),
  maxBudgetUsd: z.number().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
  outputSchema: z.strictObject({ type: z.literal('object'), required: z.array(z.string()), properties: z.record(z.string(), z.strictObject({ type: JsonType })) }),
});
export type WorkerDefinition = z.infer<typeof Definition>;

const badId = (id: string, why: string): AmbicodeError => new AmbicodeError('bad-argument', `Worker "${id}": ${why}`, { field: 'id' });

/** `<pluginRoot>/workers/<id>.yaml`, validated; any failure names the id (06-W4). */
export async function loadWorkerDefinition(fs: FileSystem, directory: string, id: string): Promise<WorkerDefinition> {
  if (!/^[a-z0-9-]+$/.test(id)) throw badId(id, 'an id is lowercase letters, digits and dashes.');
  const text = await fs.readText(path.join(directory, `${id}.yaml`)).catch(() => null);
  if (text === null) throw badId(id, `no definition ${id}.yaml under ${directory}.`);
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    throw badId(id, `the definition is not YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
  const parsed = Definition.safeParse(document);
  if (!parsed.success) throw badId(id, `the definition is invalid at ${parsed.error.issues[0]?.path.join('.') || 'root'}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  if (parsed.data.id !== id) throw badId(id, `the definition names itself "${parsed.data.id}".`);
  return parsed.data;
}

const typeOf = (value: unknown): string => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);

/** Why the output is not a valid artifact, or null with its serialization (06-W6). */
function validate(stdout: string, schema: WorkerDefinition['outputSchema']): { reason: string } | { text: string } {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return { reason: 'output is not JSON' };
  }
  if (typeOf(value) !== 'object') return { reason: `output is ${typeOf(value)}, not an object` };
  const record = value as Record<string, unknown>;
  const missing = schema.required.filter((key) => !(key in record));
  if (missing.length > 0) return { reason: `output misses ${missing.join(', ')}` };
  const wrong = Object.entries(schema.properties).filter(([key, property]) => key in record && typeOf(record[key]) !== property.type).map(([key]) => key);
  if (wrong.length > 0) return { reason: `output has the wrong type for ${wrong.join(', ')}` };
  const text = JSON.stringify(record);
  return Buffer.byteLength(text) > MAX_ARTIFACT_BYTES ? { reason: `output is ${Buffer.byteLength(text)} bytes; the limit is ${MAX_ARTIFACT_BYTES}` } : { text };
}

/** `worker run <id>`: one process through the worker runner; anything but a valid object leaves no artifact (06-W5–W7). */
export async function runWorker(deps: NoteDeps & { runner: ProcessRunner; definitions: string }, input: { id: string; task: string }): Promise<{ entry: LedgerEntry; artifact: string }> {
  const { runtime, session } = deps;
  const definition = await loadWorkerDefinition(runtime.fs, deps.definitions, input.id);
  const dir = await resolveTaskDir(runtime, input.task);
  const locked = <T>(work: (ledger: LockedLedger) => Promise<T>): Promise<T> =>
    deps.ledger !== undefined ? work(deps.ledger) : withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session ?? runtime.ids.writerId(), work);
  await locked((ledger) => owningRoute(ledger, session, input.task));

  const started = runtime.clock.now().getTime();
  const result = await runWorkerProcess(deps.runner, {
    argv: definition.argv.map((part) => part.replaceAll('{taskDir}', dir.root)),
    cwd: dir.repositoryRoot,
    timeoutMs: definition.timeoutMs,
    maxOutputBytes: MAX_OUTPUT_BYTES,
    ...(definition.tools === undefined ? {} : { tools: definition.tools }),
    ...(definition.maxBudgetUsd === undefined ? {} : { maxBudgetUsd: definition.maxBudgetUsd }),
    ...(definition.maxTurns === undefined ? {} : { maxTurns: definition.maxTurns }),
  });
  const checked = result.kind === 'failed' ? { reason: `process ${result.reason}` } : validate(result.outcome.stdout, definition.outputSchema);

  return locked(async (ledger) => {
    const route = await owningRoute(ledger, session, input.task);
    const common = { kind: 'worker', worker: definition.id, ms: runtime.clock.now().getTime() - started, ...(route === null ? {} : { route }) };
    if ('reason' in checked) {
      await ledger.append({ ...common, outcome: 'inline', artifact: null, reason: checked.reason });
      throw new AmbicodeError('worker-output-invalid', `Worker ${definition.id} gave no usable output: ${checked.reason}.`, { details: [`reason: ${checked.reason}`, `Release: ${RELEASE}.`] });
    }
    await runtime.fs.mkdirp(dir.workers);
    const base = path.join(dir.workers, `${definition.id}-${localTimestamp(runtime.clock.now())}`);
    let file = `${base}.json`;
    for (let attempt = 2; !(await runtime.fs.createExclusive(file, checked.text)); attempt += 1) file = `${base}-${attempt}.json`;
    const artifact = path.relative(dir.repositoryRoot, file).split(path.sep).join('/');
    return { entry: await ledger.append({ ...common, outcome: 'ran', artifact }), artifact };
  });
}

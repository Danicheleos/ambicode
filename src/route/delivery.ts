import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import type { TaskDir } from '../task/task-dir.ts';

export const CLI_LIMIT = 8000;
export const HOOK_LIMIT = 9800;
export const PREVIEW_CHARS = 300;

export type DeliveryChannel = 'cli' | 'hook';

export interface Composed {
  /** What the caller prints. */
  text: string;
  /** The whole message, when it went to a file behind a preview. */
  file: string | null;
  full: string;
  bytes: number;
}

/** The first route of a chain: it stays the same when a later route resumes it. */
export const chainKey = (ids: readonly string[]): string => ids.at(-1) ?? '';

/** Three lines every step message starts with: where we are, what to do now, the command that ends the step. */
export function stepHeader(input: { skill: string; task: string; step: string; position: number; total: number; now: string; then: string }): string {
  const now = input.now.replace(/\s+/g, ' ').trim();
  // A command in backticks is never cut: a cut one cannot be run.
  const clipped = now.length <= 160 || now.includes('`') ? now : `${now.slice(0, 157)}…`;
  return [
    `[ambicode] ${input.skill} · task ${input.task} · step ${input.step} (${input.position}/${input.total})`,
    `Now: ${clipped}`,
    `Then: ${input.then}`,
  ].join('\n');
}

export function compose(input: { header: string; body: string; channel: DeliveryChannel; dir: TaskDir; step: string; chain: string }): Composed {
  const full = input.body === '' ? input.header : `${input.header}\n\n${input.body}`;
  const limit = input.channel === 'hook' ? HOOK_LIMIT : CLI_LIMIT;
  if (full.length <= limit) return { text: full, file: null, full, bytes: Buffer.byteLength(full) };
  const file = path.join(input.dir.steps, `${safe(input.chain)}-${input.step}.md`);
  const bytes = Buffer.byteLength(full);
  const preview = input.body.slice(0, PREVIEW_CHARS);
  return { text: `${input.header}\n\n${preview}…\nRead it whole: ${bytes} bytes: ${file}`, file, full, bytes };
}

export async function writeStepFile(fs: FileSystem, composed: Composed, comment: string): Promise<void> {
  if (composed.file === null) return;
  await fs.mkdirp(path.dirname(composed.file));
  await fs.writeText(composed.file, `<!-- ${comment} -->\n${composed.full}\n`);
}

const safe = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, '-');
const payloadFile = (dir: TaskDir, chain: string, key: string): string => path.join(dir.steps, `payload-${safe(chain)}-${safe(key)}.txt`);

export async function savePayload(fs: FileSystem, dir: TaskDir, chain: string, key: string, text: string): Promise<void> {
  await fs.mkdirp(dir.steps);
  await fs.writeText(payloadFile(dir, chain, key), text);
}

export async function loadPayload(fs: FileSystem, dir: TaskDir, chain: string, key: string): Promise<string | null> {
  return fs.readText(payloadFile(dir, chain, key)).catch(() => null);
}

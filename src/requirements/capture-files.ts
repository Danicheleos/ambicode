import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { CapturedRequirement } from '../contracts/requirements.ts';
import type { TaskDir } from '../task/task-dir.ts';

const primary = (dir: TaskDir, key: string): string => path.join(dir.requirements, `${key}.json`);
const versioned = (dir: TaskDir, key: string, rawHash: string): string => path.join(dir.requirements, `${key}.${rawHash.replace(/^sha256:/, '').slice(0, 12)}.json`);

async function readParsed(fs: FileSystem, file: string): Promise<CapturedRequirement | null> {
  try {
    const parsed = CapturedRequirement.safeParse(JSON.parse(await fs.readText(file)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The file for a capture: `<key>.json` unless it holds another response of the same key, then a per-response file. */
export async function writeCapture(fs: FileSystem, dir: TaskDir, key: string, rawHash: string, text: string): Promise<void> {
  await fs.mkdirp(dir.requirements);
  const held = await readParsed(fs, primary(dir, key));
  await fs.writeText(held !== null && held.rawHash !== rawHash ? versioned(dir, key, rawHash) : primary(dir, key), text);
}

/** The capture a ledger entry refers to; a file recorded for another response is not it. */
export async function readCapture(fs: FileSystem, dir: TaskDir, key: string, rawHash: string | null): Promise<CapturedRequirement | null> {
  const first = await readParsed(fs, primary(dir, key));
  if (rawHash === null || first?.rawHash === rawHash) return first;
  return readParsed(fs, versioned(dir, key, rawHash));
}

export const capturePaths = (dir: TaskDir, key: string, rawHash: string): string[] => [primary(dir, key), versioned(dir, key, rawHash)];

/** A capture as one chain recorded it: relation and derivation belong to the chain's ledger entry, not to the shared file. */
export function asRecorded(capture: CapturedRequirement, entry: Readonly<Record<string, unknown>>): CapturedRequirement {
  const relation = CapturedRequirement.shape.relation.safeParse(entry.relation);
  const derivedFrom = typeof entry.derivedFrom === 'string' ? entry.derivedFrom : entry.derivedFrom === null ? null : capture.derivedFrom;
  return { ...capture, relation: relation.success ? relation.data : capture.relation, derivedFrom };
}

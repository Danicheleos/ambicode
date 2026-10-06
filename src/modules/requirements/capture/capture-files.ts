import path from 'node:path';
import { CapturedHits, CapturedRequirement } from '#types/modules/requirements';
import type { TaskDir } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

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

const capturePaths = (dir: TaskDir, key: string, rawHash: string): string[] => [primary(dir, key), versioned(dir, key, rawHash)];

/** A capture as one chain recorded it: relation and derivation belong to the chain's ledger entry, not to the shared file. */
export function asRecorded(capture: CapturedRequirement, entry: Readonly<Record<string, unknown>>): CapturedRequirement {
  const relation = CapturedRequirement.shape.relation.safeParse(entry.relation);
  const derivedFrom = typeof entry.derivedFrom === 'string' ? entry.derivedFrom : entry.derivedFrom === null ? null : capture.derivedFrom;
  return { ...capture, relation: relation.success ? relation.data : capture.relation, derivedFrom };
}

/** A search list's file name: the first 12 hex digits of its response hash. */
export const searchName = (rawHash: string): string => `search-${rawHash.replace(/^sha256:/, '').slice(0, 12)}`;

/** The files a `requirement` ledger entry points at: a list entry names its search file, not its `key`. */
export const entryPaths = (dir: TaskDir, entry: Readonly<Record<string, unknown>>): string[] =>
  entry['capture'] === 'list' ? [primary(dir, searchName(String(entry['rawHash'])))] : capturePaths(dir, String(entry['key']), String(entry['rawHash']));

/** The hit list a `capture: 'list'` entry recorded, or null when its file is gone or unreadable. */
export async function readList(fs: FileSystem, dir: TaskDir, rawHash: string): Promise<CapturedHits | null> {
  try {
    const parsed = CapturedHits.safeParse(JSON.parse(await fs.readText(primary(dir, searchName(rawHash)))));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

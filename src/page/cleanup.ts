import path from 'node:path';
import { z } from 'zod';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';

/**
 * Temporary directories AMBICODE created, and only those.
 *
 * A sweep that deleted every directory matching a name prefix would eventually
 * delete somebody else's, so a directory is removed only when it carries a
 * marker this tool wrote (doc 03 P1.6). A directory that cannot be read, or
 * whose marker does not validate, is left alone and reported.
 */

export const OWNERSHIP_MARKER = '.ambicode-owned.json';

/** Prefixes `FileSystem.temporaryDirectory` is called with. */
export const OWNED_PREFIXES = [
  'ambicode-snapshot-',
  'ambicode-page-',
  'ambicode-workspace-',
  'ambicode-index-',
  'ambicode-reviewer-',
];

export const OwnershipMarker = z.strictObject({
  tool: z.literal('ambicode'),
  kind: z.enum(['snapshot', 'page-session', 'workspace-inspection', 'index', 'reviewer-prompt']),
  createdAt: z.string().min(1),
  /** Informational; ownership does not depend on the process still existing. */
  pid: z.number().int().nonnegative(),
});
export type OwnershipMarker = z.infer<typeof OwnershipMarker>;

export async function markOwned(
  fs: FileSystem,
  directory: string,
  kind: OwnershipMarker['kind'],
  clock: Clock,
  pid: number,
): Promise<void> {
  const marker: OwnershipMarker = {
    tool: 'ambicode',
    kind,
    createdAt: clock.now().toISOString(),
    pid,
  };
  await fs.writeText(path.join(directory, OWNERSHIP_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
}

export async function readOwnership(fs: FileSystem, directory: string): Promise<OwnershipMarker | null> {
  const marker = path.join(directory, OWNERSHIP_MARKER);
  if (!(await fs.exists(marker))) return null;
  try {
    const parsed = OwnershipMarker.safeParse(JSON.parse(await fs.readText(marker)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface SweepOptions {
  fs: FileSystem;
  clock: Clock;
  /** Directories older than this are candidates; younger ones may be in use. */
  maxAgeMs: number;
  prefixes?: readonly string[];
}

export interface SweepReport {
  removed: string[];
  /** Directories that matched a prefix but carried no valid AMBICODE marker. */
  skipped: string[];
  /** Removal attempts that failed, surfaced instead of retried elsewhere. */
  failures: string[];
}

/**
 * Removes expired AMBICODE temporary directories at startup. Saved review
 * results, drafts and publication history live in the repository and are never
 * touched by this.
 */
export async function sweepOwnedTemporaries(options: SweepOptions): Promise<SweepReport> {
  const report: SweepReport = { removed: [], skipped: [], failures: [] };
  const root = options.fs.temporaryRoot();
  const prefixes = options.prefixes ?? OWNED_PREFIXES;

  let entries;
  try {
    entries = await options.fs.readdir(root);
  } catch (error) {
    report.failures.push(
      `The temporary directory ${root} could not be listed, so no cleanup was attempted: ${describe(error)}`,
    );
    return report;
  }

  const now = options.clock.now().getTime();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
    const directory = path.join(root, entry.name);

    const marker = await readOwnership(options.fs, directory);
    if (marker === null) {
      report.skipped.push(directory);
      continue;
    }
    const age = now - Date.parse(marker.createdAt);
    if (!Number.isFinite(age) || age < options.maxAgeMs) continue;

    try {
      await options.fs.remove(directory);
      report.removed.push(directory);
    } catch (error) {
      report.failures.push(`${directory} could not be removed: ${describe(error)}`);
    }
  }
  return report;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import path from 'node:path';
import { z } from 'zod';
import type { Clock, FileSystem } from '#types/ports';
import type { SweepReport } from '#types/review';
import { messageOf } from '#util/errors';

/**
 * Removes a directory only when it carries a marker this tool wrote: a prefix
 * match alone would eventually delete somebody else's. Unreadable or invalid
 * markers leave the directory alone and reported.
 */

export const OWNERSHIP_MARKER = '.ambicode-owned.json';

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
  maxAgeMs: number;
  prefixes?: readonly string[];
}

export async function sweepOwnedTemporaries(options: SweepOptions): Promise<SweepReport> {
  const report: SweepReport = { removed: [], skipped: [], failures: [] };
  const root = options.fs.temporaryRoot();
  const prefixes = options.prefixes ?? OWNED_PREFIXES;

  let entries;
  try {
    entries = await options.fs.readdir(root);
  } catch (error) {
    report.failures.push(
      `The temporary directory ${root} could not be listed, so no cleanup was attempted: ${messageOf(error)}`,
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
      report.failures.push(`${directory} could not be removed: ${messageOf(error)}`);
    }
  }
  return report;
}

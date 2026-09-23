import { z } from 'zod';

/**
 * The `ambicode locate` boundary contract (R4): a short, ranked list of files
 * a request is probably about, derived from signals that already exist in the
 * repository — path and filename shape, file contents, and which files
 * habitually change together.
 *
 * It is deliberately not an index. Nothing here is persisted, nothing is
 * derived once and reused, and every field is recomputed from git on each
 * call; `plan/09-backlog.md` still owns a custom index, a symbol database and
 * a dependency-graph engine, and this contract must never grow into one.
 *
 * Two properties make the output usable as evidence rather than as a guess:
 *
 *   - every candidate carries the **specific reason** it ranked, so a reader
 *     can tell a directory-name coincidence from a file that changed with the
 *     rest of the boundary eleven times;
 *   - emptiness is reported as emptiness. A shortlist that found nothing says
 *     so and never widens into "here is the whole project" — the same rule
 *     `src/checks/select.ts` applies to test selection.
 */

export const LocateCandidate = z.strictObject({
  /** Repository-relative, POSIX-separated. */
  path: z.string().min(1),
  /** Higher ranks first. Comparable within one call, not across calls. */
  score: z.number().positive(),
  /**
   * Why this file is here, one clause per contributing signal. An unexplained
   * ranking is not evidence, so this is never empty.
   */
  reasons: z.array(z.string().min(1)).min(1),
});
export type LocateCandidate = z.infer<typeof LocateCandidate>;

/**
 * The shortlist as `prepare` carries it (R2 compact style: an empty list is
 * omitted rather than emitted). `candidates` is the exception — an explicit
 * empty array is the honest-emptiness statement, so it is always present.
 */
export const PrepareShortlist = z.strictObject({
  terms: z.array(z.string().min(1)).min(1),
  candidates: z.array(LocateCandidate),
  limitations: z.array(z.string().min(1)).min(1).optional(),
});
export type PrepareShortlist = z.infer<typeof PrepareShortlist>;

export const LocateOutput = z.strictObject({
  command: z.literal('locate'),
  projectId: z.string().min(1),
  /** The terms actually searched for, after normalization and bounding. */
  terms: z.array(z.string().min(1)),
  /** How many candidates the caller asked to see. */
  limit: z.number().int().positive(),
  candidates: z.array(LocateCandidate),
  /**
   * What this shortlist could not establish: a term that matched nothing, a
   * term so broad it was dropped rather than allowed to return the project, a
   * bounded grep, a repository with too little history for co-change to mean
   * anything, candidates left out by `--limit`.
   */
  limitations: z.array(z.string().min(1)),
});
export type LocateOutput = z.infer<typeof LocateOutput>;

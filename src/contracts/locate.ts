import { z } from 'zod';

/**
 * Deliberately not an index: nothing is persisted, every field is recomputed from
 * git on each call. A shortlist that found nothing says so; it never widens to the project.
 */

export const LocateCandidate = z.strictObject({
  path: z.string().min(1),
  /** Higher ranks first. Comparable within one call, not across calls. */
  score: z.number().positive(),
  reasons: z.array(z.string().min(1)).min(1),
});
export type LocateCandidate = z.infer<typeof LocateCandidate>;

/** Empty lists are omitted, except `candidates`: an explicit empty array is how emptiness is reported. */
export const PrepareShortlist = z.strictObject({
  terms: z.array(z.string().min(1)).min(1),
  candidates: z.array(LocateCandidate),
  limitations: z.array(z.string().min(1)).min(1).optional(),
});
export type PrepareShortlist = z.infer<typeof PrepareShortlist>;

export const LocateOutput = z.strictObject({
  command: z.literal('locate'),
  projectId: z.string().min(1),
  terms: z.array(z.string().min(1)),
  limit: z.number().int().positive(),
  candidates: z.array(LocateCandidate),
  limitations: z.array(z.string().min(1)),
});
export type LocateOutput = z.infer<typeof LocateOutput>;

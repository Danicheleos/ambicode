import { z } from 'zod';

/**
 * Requirement/source-presence schemas shared by every activity (doc 04 P2.2
 * correction C). `review`, `investigate` and `plan` all normalize requirement
 * evidence through the same shape; only `ReviewResult` (doc 02) keeps its own
 * legacy `quality-review` spelling for its persisted contract, mapped from
 * `source-free` when a `ReviewResult` is built (`src/review/bundle.ts`).
 *
 * These types used to live on `contracts/review.ts`, which made every
 * activity-neutral caller (`ambicode prepare`) import review-specific
 * ownership for a concept — "was a source supplied" — that has nothing to do
 * with review. `contracts/review.ts` now re-exports them for its own existing
 * importers rather than declaring a second copy.
 */

/**
 * Whether requirement-based analysis has anything to judge against.
 * `source-free` means no requirement URL was supplied, whatever the activity;
 * it is not a claim about quality or correctness (doc 02, "Central values").
 */
export const RequirementMode = z.enum(['source-free', 'requirement-based']);
export type RequirementMode = z.infer<typeof RequirementMode>;

export const RequirementSource = z.strictObject({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  retrievedAt: z.string().min(1),
  sourceVersion: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  content: z.string(),
  citations: z.array(z.string()).default([]),
  status: z.enum(['retrieved', 'unavailable', 'forbidden', 'not-found']),
  /** Required whenever status is not `retrieved`. */
  failureReason: z.string().nullable().default(null),
  /** Tool the outer session used, recorded as provenance. */
  retrievedVia: z.string().min(1),
});
export type RequirementSource = z.infer<typeof RequirementSource>;

/**
 * A contradiction between requirement sources. Code detects structural cases;
 * the outer session declares the ones only a reader can see (doc 05). Either
 * way the operation stops before checks, policy-dependent code, or the model
 * (doc 02).
 */
export const RequirementConflict = z.strictObject({
  summary: z.string().min(1),
  /** Requirement source IDs that disagree. */
  sourceIds: z.array(z.string().min(1)).min(2),
  detectedBy: z.enum(['helper', 'session']),
});
export type RequirementConflict = z.infer<typeof RequirementConflict>;

export const ProvenanceEntry = z.strictObject({
  kind: z.enum(['prompt', 'pack', 'config', 'requirement']),
  reference: z.string().min(1),
  contentHash: z.string().min(1),
});
export type ProvenanceEntry = z.infer<typeof ProvenanceEntry>;

import { z } from 'zod';

/** `source-free` means no requirement URL was supplied; it is not a claim about quality. */
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
  failureReason: z.string().nullable().default(null),
  retrievedVia: z.string().min(1),
});
export type RequirementSource = z.infer<typeof RequirementSource>;

/** Either detector stops the operation before checks, policy-dependent code, or the model run. */
export const RequirementConflict = z.strictObject({
  summary: z.string().min(1),
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

import { z } from 'zod';

/** `source-free` means no requirement URL was supplied; it is not a claim about quality. */
export const RequirementMode = z.enum(['source-free', 'requirement-based']);
export type RequirementMode = z.infer<typeof RequirementMode>;

const sourceHead = {
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  /** The retrieval time the MCP tool's own response carried; absent when it carried none. */
  retrievedAt: z.string().min(1).nullable().default(null),
};

const sourceBody = {
  sourceVersion: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  content: z.string(),
  citations: z.array(z.string()).default([]),
  status: z.enum(['retrieved', 'unavailable', 'forbidden', 'not-found']),
  failureReason: z.string().nullable().default(null),
  retrievedVia: z.string().min(1),
};

/** What a session may put in an envelope: `receivedAt` is absent, so an envelope that sets it is refused. */
export const RequirementEnvelopeSource = z.strictObject({ ...sourceHead, ...sourceBody });
export type RequirementEnvelopeSource = z.infer<typeof RequirementEnvelopeSource>;

/**
 * A normalized source as stored. `receivedAt` is stamped by the CLI when it receives the
 * envelope; results written before it existed lack it and stay readable.
 */
export const RequirementSource = z.strictObject({
  ...sourceHead,
  receivedAt: z.string().min(1).optional(),
  ...sourceBody,
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

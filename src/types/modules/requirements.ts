import { z } from 'zod';
import type { Runtime } from '../composition.ts';
import type { TaskDir, LockedLedger } from './evidence.ts';
import type { RouteView, RouteArgs } from '../harness.ts';

/** `source-free` means no requirement URL was supplied; it is not a claim about quality. */
export const RequirementMode = z.enum(['source-free', 'requirement-based']);
export type RequirementMode = z.infer<typeof RequirementMode>;

export const RequirementSource = z.strictObject({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  retrievedAt: z.string().min(1),
  sourceVersion: z.string().nullable().default(null),
  content: z.string(),
  citations: z.array(z.string()).default([]),
  status: z.enum(['retrieved', 'unavailable', 'forbidden', 'not-found']),
  failureReason: z.string().nullable().default(null),
  retrievedVia: z.string().min(1),
  relation: z.enum(['asked', 'child', 'parent', 'link', 'mention']).optional(),
  derivedFrom: z.string().nullable().optional(),
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

/** One captured MCP result (`requirements/<key>.json`); a search hit list is reduced to `{key, summary}` per hit. */
export const CapturedRequirement = z.strictObject({
  key: z.string().min(1),
  url: z.string(),
  title: z.string(),
  type: z.string(),
  relation: z.enum(['asked', 'child', 'parent', 'link', 'mention']),
  derivedFrom: z.string().nullable(),
  retrievedVia: z.string().min(1),
  retrievedAt: z.string().min(1),
  sourceVersion: z.string().nullable(),
  content: z.string(),
  links: z.array(z.string()).default([]),
  parent: z.string().nullable().default(null),
  rawHash: z.string().min(1),
});
export type CapturedRequirement = z.infer<typeof CapturedRequirement>;

export const CapturedHits = z.strictObject({
  query: z.string(),
  total: z.number().int().min(0),
  hits: z.array(z.strictObject({ key: z.string().min(1), summary: z.string() })),
  retrievedVia: z.string().min(1),
  retrievedAt: z.string().min(1),
  rawHash: z.string().min(1),
});
export type CapturedHits = z.infer<typeof CapturedHits>;

export interface CaptureDeps {
  runtime: Runtime;
  dir: TaskDir;
  ledger: LockedLedger;
  view: RouteView;
  mcpServer: string | null;
  /** Keys the route asked for: its `--requirement` URLs and the URLs or bare key in its text. */
  asked: readonly string[];
}

export interface EnvelopeSource {
  key: string;
  title: string;
  content: string;
  url: string;
  relation: 'asked' | 'child' | 'parent' | 'link' | 'mention' | 'args';
  derivedFrom: string | null;
  retrievedAt: string;
  rawHash?: string;
}

export interface EnvelopeInput {
  runtime: Runtime;
  dir: TaskDir;
  ledger: LockedLedger;
  view: RouteView;
  args: RouteArgs;
  mcpServer: string | null;
  acceptanceField?: string | null;
  runner?: string;
}

export const RequirementEvidence = z.strictObject({
  mcpServer: z.string().min(1).nullable().default(null),
  sources: z.array(RequirementSource).default([]),
  conflicts: z
    .array(RequirementConflict.omit({ detectedBy: true }))
    .default([]),
});

export type RequirementEvidence = z.infer<typeof RequirementEvidence>;

export interface NormalizedRequirements {
  mode: RequirementMode;
  sources: RequirementSource[];
  conflicts: z.infer<typeof RequirementConflict>[];
  mcpServer: string | null;
  notices: string[];
  provenance: ProvenanceEntry[];
}

/** `inline`: evidence a route already holds, e.g. its requirement envelope. */
export type EvidenceSource = { kind: 'stdin' } | { kind: 'file'; path: string } | { kind: 'inline'; evidence: RequirementEvidence };

/** The code of the ground step's recoverable failure that carries the chosen-keys instruction; once per answer. */
export const EXPANSION_FETCH = 'requirements-expansion-fetch';

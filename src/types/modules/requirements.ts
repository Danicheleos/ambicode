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
});
export type RequirementSource = z.infer<typeof RequirementSource>;

export const ProvenanceEntry = z.strictObject({
  kind: z.enum(['prompt', 'pack', 'config', 'requirement']),
  reference: z.string().min(1),
  contentHash: z.string().min(1),
});
export type ProvenanceEntry = z.infer<typeof ProvenanceEntry>;

export interface CaptureDeps {
  runtime: Runtime;
  dir: TaskDir;
  ledger: LockedLedger;
  view: RouteView;
  /** Keys the route asked for: its `--requirement` URLs and the URLs or bare key in its text. */
  asked: readonly string[];
}

/** A captured requirement as an envelope lists it; `args` is the request text standing in when nothing was captured. */
export interface EnvelopeSource {
  key: string;
  title: string;
  content: string;
  url: string;
  relation: 'captured' | 'args';
  retrievedAt: string;
  rawHash?: string;
  tool?: string;
}

export interface EnvelopeInput {
  runtime: Runtime;
  dir: TaskDir;
  ledger: LockedLedger;
  view: RouteView;
  args: RouteArgs;
}

export const RequirementEvidence = z.object({
  sources: z.array(RequirementSource).default([]),
});

export type RequirementEvidence = z.infer<typeof RequirementEvidence>;

export interface NormalizedRequirements {
  mode: RequirementMode;
  sources: RequirementSource[];
  notices: string[];
  provenance: ProvenanceEntry[];
}

/** `inline`: evidence a route already holds, e.g. its requirement envelope. */
export type EvidenceSource = { kind: 'stdin' } | { kind: 'file'; path: string } | { kind: 'inline'; evidence: RequirementEvidence };

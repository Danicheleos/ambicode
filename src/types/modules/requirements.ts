import { z } from 'zod';
import type { Runtime } from '../composition.ts';
import type { TaskDir, LockedLedger } from './evidence.ts';
import type { RouteView, RouteArgs } from '../harness.ts';

/** `source-free` means no requirement URL was supplied; it is not a claim about quality. */
export const RequirementSource = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  retrievedAt: z.string().min(1),
  content: z.string(),
});
export type RequirementSource = z.infer<typeof RequirementSource>;

export interface CaptureDeps {
  runtime: Runtime;
  dir: TaskDir;
  ledger: LockedLedger;
  view: RouteView;
  /** Keys the route asked for: its `--requirement` URLs and the URLs or bare key in its text. */
  asked: readonly string[];
}

/** A captured requirement as an envelope lists it. */
export interface EnvelopeSource {
  key: string;
  title: string;
  content: string;
  url: string;
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

/** `inline`: evidence a route already holds, e.g. its requirement envelope. */
export type EvidenceSource = { kind: 'stdin' } | { kind: 'file'; path: string } | { kind: 'inline'; evidence: RequirementEvidence };

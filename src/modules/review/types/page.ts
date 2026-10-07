import type { PublicationState } from '#types/primitives';
import type { CoverageGap } from '#types/platform/provider';
import type { ReviewResult } from '#types/modules/review';
import type { FastifyInstance } from 'fastify';
import type { SessionStore } from '../page/session.ts';

export type ParsedSubmission =
  | {
      kind: 'ok';
      submissionId: string;
      drafts: Map<string, string>;
      selected: Set<string>;
    }
  | {
      kind: 'invalid';
      errors: string[];
      drafts: Map<string, string>;
      selected: Set<string>;
    };

export const TAKEOVER_HEADER = 'x-ambicode-takeover';

export interface PageModel {
  reviewId: string;
  createdAt: string;
  status: ReviewResult['status'];
  statusReason: string | null;
  requirementMode: ReviewResult['requirementMode'];
  reviewModel: string;
  pluginVersion: string;
  target: TargetSummary;
  requirements: RequirementSummary[];
  provenance: { kind: string; reference: string; contentHash: string }[];
  checks: CheckSummary[];
  coverage: CoverageSummary;
  omissions: string[];
  reviewer: ReviewerSummary | null;
  publication: PublicationSummary;
  findings: FindingCard[];
  csrfToken: string;
  submissionId: string;
  errors: string[];
  lastSubmission: LastSubmission | null;
}

interface TargetSummary {
  kind: ReviewResult['target']['kind'];
  snapshotId: string;
  notes: string[];
  remote: {
    provider: string;
    host: string;
    projectPath: string;
    mergeRequestIid: number;
    webUrl: string;
    versionId: number;
    baseSha: string;
    startSha: string;
    headSha: string;
  } | null;
}

interface RequirementSummary {
  id: string;
  url: string;
  title: string;
  status: string;
  sourceVersion: string | null;
  retrievedAt: string;
  retrievedVia: string;
  failureReason: string | null;
}

interface CheckSummary {
  projectId: string;
  checkId: string;
  status: string;
  selectedCount: number;
  selectionComplete: boolean;
  exitCode: number | null;
  argv: string;
  limitations: string[];
  mutations: string[];
}

interface CoverageSummary {
  complete: boolean;
  declaredFileCount: number | null;
  deliveredFileCount: number;
  versionState: string | null;
  gaps: CoverageGap[];
}

interface ReviewerSummary {
  status: string;
  model: string;
  tools: string[];
  timeoutSeconds: number;
  detail: string | null;
  rejections: string[];
}

interface PublicationSummary {
  available: boolean;
  unavailableReason: string | null;
  revisionState: string | null;
  revisionReason: string | null;
  selectableCount: number;
}

export interface LastSubmission {
  submittedAt: string;
  stopped: boolean;
  stoppedReason: string | null;
  published: number;
  alreadyPublished: number;
  failed: number;
  uncertain: number;
  stale: number;
}

export interface FindingCard {
  id: string;
  risk: string;
  confidence: string;
  category: string;
  path: string;
  line: number;
  side: string;
  /** The excerpt the validator took from the pinned snapshot, never the model's. */
  excerpt: string;
  explanation: string;
  ruleRefs: string[];
  requirementRefs: string[];
  supporting: { path: string; line: number; side: string }[];
  draft: string;
  /** Always false on a new session; the human checks it themselves. */
  selected: boolean;
  publishable: boolean;
  notPublishableReason: string | null;
  state: PublicationState;
  stateMessage: string | null;
  discussionUrl: string | null;
}

export interface PageServer {
  app: FastifyInstance;
  sessions: SessionStore;
  capability: string;
  /** The session id inside a signed cookie value, or `valid: false` for one this server did not sign. */
  unsignCookie(value: string): { valid: boolean; value: string | null };
  setAuthority(authority: string): void;
  stopped: Promise<string>;
  beginShutdown(reason: string): void;
  stop(reason: string): Promise<void>;
  noteActivity(): void;
}

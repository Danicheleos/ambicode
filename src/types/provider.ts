import { z } from 'zod';
import { ProviderId } from './primitives.ts';

/** Local working and branch targets never pass through a provider; Git resolves them directly. */

/** `unsupported` is a first-class answer a human can be shown, never an exception or a success. */
export type ProviderOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'unsupported'; provider: ProviderId; operation: ProviderOperation; message: string }
  | {
      kind: 'failed';
      provider: ProviderId;
      operation: ProviderOperation;
      message: string;
      details: string[];
      /**
       * Only meaningful for `publishComment`. `before-send` requires structured proof
       * that nothing was created; otherwise `uncertain`, never inferred from message text.
       */
      certainty: DeliveryCertainty;
    };

export const DeliveryCertainty = z.enum(['before-send', 'uncertain']);
export type DeliveryCertainty = z.infer<typeof DeliveryCertainty>;

export type ProviderOperation =
  | 'resolveTarget'
  | 'fetchSnapshot'
  | 'getCurrentRevision'
  | 'getIdentity'
  | 'listDiscussions'
  | 'publishComment';

export function providerOk<T>(value: T): ProviderOutcome<T> {
  return { kind: 'ok', value };
}

export function providerUnsupported<T>(
  provider: ProviderId,
  operation: ProviderOperation,
  message: string,
): ProviderOutcome<T> {
  return { kind: 'unsupported', provider, operation, message };
}

export function providerFailed<T>(
  provider: ProviderId,
  operation: ProviderOperation,
  message: string,
  details: string[] = [],
  certainty: DeliveryCertainty = 'uncertain',
): ProviderOutcome<T> {
  return { kind: 'failed', provider, operation, message, details, certainty };
}

export const RemoteTarget = z.strictObject({
  provider: ProviderId,
  host: z.string().min(1),
  projectId: z.string().min(1),
  projectPath: z.string().min(1),
  /** Where the post-image blobs live: differs from the target only for a fork merge request. */
  sourceProjectId: z.string().min(1),
  sourceProjectPath: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  webUrl: z.string().min(1),
  versionId: z.number().int().positive(),
  baseSha: z.string().min(1),
  startSha: z.string().min(1),
  headSha: z.string().min(1),
});
export type RemoteTarget = z.infer<typeof RemoteTarget>;

export const RemotePosition = z.strictObject({
  baseSha: z.string().min(1),
  startSha: z.string().min(1),
  headSha: z.string().min(1),
  oldPath: z.string().nullable(),
  newPath: z.string().nullable(),
  oldLine: z.number().int().positive().nullable(),
  newLine: z.number().int().positive().nullable(),
});
export type RemotePosition = z.infer<typeof RemotePosition>;

export function samePosition(left: RemotePosition, right: RemotePosition): boolean {
  return (
    left.baseSha === right.baseSha &&
    left.startSha === right.startSha &&
    left.headSha === right.headSha &&
    left.oldPath === right.oldPath &&
    left.newPath === right.newPath &&
    left.oldLine === right.oldLine &&
    left.newLine === right.newLine
  );
}

export const RemoteNote = z.strictObject({
  id: z.string().min(1),
  discussionId: z.string().min(1),
  author: z.string(),
  body: z.string(),
  url: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  resolved: z.boolean().nullable().default(null),
  resolvable: z.boolean().default(false),
  system: z.boolean().default(false),
  position: RemotePosition.nullable().default(null),
});
export type RemoteNote = z.infer<typeof RemoteNote>;

export const RemoteDiscussion = z.strictObject({
  id: z.string().min(1),
  resolved: z.boolean(),
  notes: z.array(RemoteNote).default([]),
});
export type RemoteDiscussion = z.infer<typeof RemoteDiscussion>;

/**
 * `collecting` is not "current": GitLab creates diff versions asynchronously, so a new
 * head briefly has an older newest version, and publishing against it would attach
 * a comment to code the author has already replaced.
 */
export const RemoteRevisionState = z.enum(['current', 'stale', 'collecting', 'unavailable']);
export type RemoteRevisionState = z.infer<typeof RemoteRevisionState>;

export const RemoteRevision = z.strictObject({
  state: RemoteRevisionState,
  provider: ProviderId,
  host: z.string().min(1),
  projectId: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  headSha: z.string().nullable(),
  versionId: z.number().int().positive().nullable(),
  collectedHeadSha: z.string().nullable(),
  mergeRequestState: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
});
export type RemoteRevision = z.infer<typeof RemoteRevision>;

/**
 * Identity is compared explicitly because a match on head alone would accept a
 * different merge request; any non-`current` state is a difference in its own right.
 */
export function revisionMatches(
  pinned: RemoteTarget,
  current: RemoteRevision,
): { same: true } | { same: false; differences: string[] } {
  const differences: string[] = [];
  if (pinned.provider !== current.provider) {
    differences.push(`provider ${pinned.provider} → ${current.provider}`);
  }
  if (pinned.host !== current.host) differences.push(`host ${pinned.host} → ${current.host}`);
  if (pinned.projectId !== current.projectId) {
    differences.push(`project ${pinned.projectId} → ${current.projectId}`);
  }
  if (pinned.mergeRequestIid !== current.mergeRequestIid) {
    differences.push(
      `merge request !${pinned.mergeRequestIid} → !${current.mergeRequestIid}`,
    );
  }
  if (current.headSha !== null && pinned.headSha !== current.headSha) {
    differences.push(`head ${short(pinned.headSha)} → ${short(current.headSha)}`);
  }
  if (current.versionId !== null && pinned.versionId !== current.versionId) {
    differences.push(`diff version ${pinned.versionId} → ${current.versionId}`);
  }
  if (current.state !== 'current') {
    differences.push(current.reason ?? `the merge request revision is ${current.state}`);
  }
  return differences.length === 0 ? { same: true } : { same: false, differences };
}

function short(sha: string): string {
  return sha.slice(0, 12);
}

export const CoverageGap = z.strictObject({
  kind: z.enum([
    'aggregate-cap',
    'omitted-files',
    'file-truncated',
    'file-unavailable',
    'no-files',
  ]),
  path: z.string().nullable().default(null),
  detail: z.string().min(1),
});
export type CoverageGap = z.infer<typeof CoverageGap>;

export const ReviewCoverage = z.strictObject({
  complete: z.boolean(),
  declaredFileCount: z.number().int().nonnegative().nullable().default(null),
  deliveredFileCount: z.number().int().nonnegative().default(0),
  versionState: z.string().nullable().default(null),
  gaps: z.array(CoverageGap).default([]),
});
export type ReviewCoverage = z.infer<typeof ReviewCoverage>;

export const COMPLETE_COVERAGE: ReviewCoverage = {
  complete: true,
  declaredFileCount: null,
  deliveredFileCount: 0,
  versionState: null,
  gaps: [],
};

export interface ResolveTargetRequest {
  url: string;
}

export interface FetchSnapshotRequest {
  target: RemoteTarget;
  includeSiblingContext: boolean;
}

export interface FetchedSnapshot {
  files: RemoteFetchedFile[];
  patch: string;
  read(relativePath: string): Promise<FetchedContent | null>;
  list(directoryName: string): Promise<string[]>;
  prime?(relativePaths: readonly string[]): Promise<void>;
  omissions: string[];
  coverage: ReviewCoverage;
}

export type FetchedContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary' }
  | { kind: 'symlink' }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'unavailable'; reason: string };

export interface RemoteFetchedFile {
  oldPath: string | null;
  newPath: string | null;
  changeKind: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  binary: boolean;
  oldMode: string | null;
  newMode: string | null;
  /** Its target is never followed. */
  symlink: boolean;
  incomplete: boolean;
  incompleteReason: string | null;
  patchSection: string;
}

export interface ListDiscussionsRequest {
  target: RemoteTarget;
  /**
   * Exceeding it is reported, never hidden. Reconciliation passes no ceiling: a
   * display limit is not evidence that a comment does not exist.
   */
  maxDiscussions: number;
}

export interface DiscussionListing {
  discussions: RemoteDiscussion[];
  /** Reconciliation may conclude a comment is absent only from a complete listing. */
  complete: boolean;
  omissions: string[];
}

export interface PublishCommentRequest {
  target: RemoteTarget;
  body: string;
  position: RemotePosition;
}

export interface PublishedComment {
  discussionId: string;
  noteId: string;
  url: string | null;
}

/** A marker in a comment written by somebody else is not evidence that AMBICODE posted it. */
export interface ProviderIdentity {
  username: string;
  displayName: string;
}

/** A provider never edits the checkout and publishes only when the human form asks it to. */
export interface ReviewProvider {
  readonly id: ProviderId;
  /** Whether this provider owns a URL. Cheap and pure: no process, no network. */
  owns(url: string): boolean;
  resolveTarget(request: ResolveTargetRequest): Promise<ProviderOutcome<RemoteTarget>>;
  fetchSnapshot(request: FetchSnapshotRequest): Promise<ProviderOutcome<FetchedSnapshot>>;
  getCurrentRevision(target: RemoteTarget): Promise<ProviderOutcome<RemoteRevision>>;
  getIdentity(target: RemoteTarget): Promise<ProviderOutcome<ProviderIdentity>>;
  listDiscussions(request: ListDiscussionsRequest): Promise<ProviderOutcome<DiscussionListing>>;
  publishComment(request: PublishCommentRequest): Promise<ProviderOutcome<PublishedComment>>;
}

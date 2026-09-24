import { z } from 'zod';
import { ProviderId } from './primitives.ts';

/**
 * The provider-neutral contract (doc 02, "Provider contract"). Review,
 * reporting and the selection page depend on this module and on the registry;
 * none of them imports a GitLab or GitHub module. Adding a provider changes its
 * own module and one registration.
 *
 * Local working and branch targets do not pass through a provider at all: they
 * are resolved with Git directly, because there is no remote to ask.
 */

/**
 * Every provider operation answers with one of these. `unsupported` is a
 * first-class answer, not an exception: a registered provider that cannot do
 * something says so in a form the caller can show a human, and never resembles
 * a success (doc 02).
 */
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
       * Whether a write this failure describes can be proven to have never
       * reached the remote. Only meaningful for `publishComment`; other
       * operations may leave it at its safe default (doc 03 P1.6/P1.7
       * correction A).
       *
       * `before-send`: the process never started, or the provider proved the
       * request was rejected before it could create anything.
       * `uncertain`: the request may have started; creation cannot be
       * disproved. This is the default a caller must assume absent structured
       * proof otherwise — never inferred from message text.
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

/**
 * `certainty` defaults to `uncertain`: a caller that does not have structured
 * proof that a write never reached the remote must never claim it did (doc 03
 * P1.7 correction A). Only a proven pre-send rejection passes `'before-send'`
 * explicitly.
 */
export function providerFailed<T>(
  provider: ProviderId,
  operation: ProviderOperation,
  message: string,
  details: string[] = [],
  certainty: DeliveryCertainty = 'uncertain',
): ProviderOutcome<T> {
  return { kind: 'failed', provider, operation, message, details, certainty };
}

/**
 * The pinned identity of a remote merge request. It lives with the provider
 * contract rather than with the review schemas because the provider is what
 * establishes it, and because the review schemas then depend on this module in
 * one direction only.
 */
export const RemoteTarget = z.strictObject({
  provider: ProviderId,
  /** Host and port exactly as the supplied URL named them. */
  host: z.string().min(1),
  /** The project the merge request targets. */
  projectId: z.string().min(1),
  projectPath: z.string().min(1),
  /**
   * Where the post-image blobs live. Equal to the target project except for a
   * fork merge request, whose head commits exist only in the fork.
   */
  sourceProjectId: z.string().min(1),
  sourceProjectPath: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  webUrl: z.string().min(1),
  /** The collected diff version the review is pinned to. */
  versionId: z.number().int().positive(),
  baseSha: z.string().min(1),
  startSha: z.string().min(1),
  headSha: z.string().min(1),
});
export type RemoteTarget = z.infer<typeof RemoteTarget>;

/** A position in a remote diff, pinned to the revision the review was built on. */
export const RemotePosition = z.strictObject({
  baseSha: z.string().min(1),
  startSha: z.string().min(1),
  headSha: z.string().min(1),
  oldPath: z.string().nullable(),
  newPath: z.string().nullable(),
  /** Set for a removed or context line. */
  oldLine: z.number().int().positive().nullable(),
  /** Set for an added or context line. */
  newLine: z.number().int().positive().nullable(),
});
export type RemotePosition = z.infer<typeof RemotePosition>;

/** Whether two positions address exactly the same line of the same revision. */
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

/**
 * One note inside a discussion, with the identity later reconciliation needs:
 * a retry must be able to recognize a comment it already posted (doc 02).
 */
export const RemoteNote = z.strictObject({
  id: z.string().min(1),
  discussionId: z.string().min(1),
  author: z.string(),
  body: z.string(),
  url: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  /** Null when the note is not resolvable, e.g. a plain comment. */
  resolved: z.boolean().nullable().default(null),
  resolvable: z.boolean().default(false),
  /** A state change GitLab wrote itself, not a human's comment. */
  system: z.boolean().default(false),
  position: RemotePosition.nullable().default(null),
});
export type RemoteNote = z.infer<typeof RemoteNote>;

export const RemoteDiscussion = z.strictObject({
  id: z.string().min(1),
  /** True only when every resolvable note in the thread is resolved. */
  resolved: z.boolean(),
  notes: z.array(RemoteNote).default([]),
});
export type RemoteDiscussion = z.infer<typeof RemoteDiscussion>;

/**
 * Whether the pinned revision is still the merge request's current one.
 *
 * `collecting` is deliberately not a kind of "current": GitLab creates a diff
 * version asynchronously, so a newly pushed head has an older newest version
 * for a while. Publishing against that version would attach a comment to code
 * the author has already replaced (doc 03 P1.5 correction 1).
 */
export const RemoteRevisionState = z.enum(['current', 'stale', 'collecting', 'unavailable']);
export type RemoteRevisionState = z.infer<typeof RemoteRevisionState>;

/** What `getCurrentRevision` answers, for the stale-revision checks. */
export const RemoteRevision = z.strictObject({
  state: RemoteRevisionState,
  provider: ProviderId,
  host: z.string().min(1),
  projectId: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  /** The merge request's current source head. Null when it could not be read. */
  headSha: z.string().nullable(),
  /** The newest collected diff version, which a new push eventually creates. */
  versionId: z.number().int().positive().nullable(),
  /** The head that newest collected version describes. */
  collectedHeadSha: z.string().nullable(),
  /** GitLab's own merge request state: opened, closed, merged, locked. */
  mergeRequestState: z.string().nullable().default(null),
  /** Why the state is not `current`. Null only when it is. */
  reason: z.string().nullable().default(null),
});
export type RemoteRevision = z.infer<typeof RemoteRevision>;

/**
 * Whether a pinned target still describes the merge request as it is now.
 * Provider identity, merge-request identity and revision are compared
 * explicitly: a match on head alone would accept a different merge request,
 * and a `collecting` or `unavailable` answer is never treated as a match.
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
  // A non-current state is a difference in its own right even when every field
  // above happens to line up: "GitLab has not collected the new diff yet" must
  // never read as "the pinned version is still the current one".
  if (current.state !== 'current') {
    differences.push(current.reason ?? `the merge request revision is ${current.state}`);
  }
  return differences.length === 0 ? { same: true } : { same: false, differences };
}

function short(sha: string): string {
  return sha.slice(0, 12);
}

/**
 * A structural coverage gap: a change the review provably did not see.
 *
 * Coverage is represented as data rather than inferred from omission wording,
 * so a result with a gap can be refused the `complete` status without matching
 * strings (doc 03 P1.5 correction 2).
 */
export const CoverageGap = z.strictObject({
  kind: z.enum([
    /** GitLab capped the version as a whole: files are missing from the list. */
    'aggregate-cap',
    /** The version declares more changed files than it delivered. */
    'omitted-files',
    /** A delivered file's diff body was collapsed or truncated. */
    'file-truncated',
    /** A file's content could not be read at the pinned revision. */
    'file-unavailable',
    /** The version carries no file diffs at all. */
    'no-files',
  ]),
  /** The file this gap is about, when it is about one. */
  path: z.string().nullable().default(null),
  detail: z.string().min(1),
});
export type CoverageGap = z.infer<typeof CoverageGap>;

/** Structural coverage of the reviewed change. `complete` means no gap. */
export const ReviewCoverage = z.strictObject({
  complete: z.boolean(),
  /** Files GitLab says the version changed, when it said. */
  declaredFileCount: z.number().int().nonnegative().nullable().default(null),
  deliveredFileCount: z.number().int().nonnegative().default(0),
  /** GitLab's own collection state for the pinned version, verbatim. */
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
  /** The full merge-request URL a human supplied. */
  url: string;
}

export interface FetchSnapshotRequest {
  target: RemoteTarget;
  /** Read unchanged files beside a changed one as reviewer context. */
  includeSiblingContext: boolean;
}

export interface FetchedSnapshot {
  /** Changed files with their hunks, the authority for finding locations. */
  files: RemoteFetchedFile[];
  /** The patch of those files, rebuilt from the pinned diff version. */
  patch: string;
  /** Immutable post-image content by repository-relative path. */
  read(relativePath: string): Promise<FetchedContent | null>;
  list(directoryName: string): Promise<string[]>;
  /**
   * Announces every path about to be read, so a provider that can fetch many
   * at once may do so. It is a hint and never an answer: whatever it does or
   * does not manage, each path is still obtained through `read`.
   */
  prime?(relativePaths: readonly string[]): Promise<void>;
  /** Everything the snapshot does not contain, and why. Never silent. */
  omissions: string[];
  /** Whether the delivered diff is the whole change, structurally. */
  coverage: ReviewCoverage;
}

export type FetchedContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary' }
  | { kind: 'symlink' }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'unavailable'; reason: string };

/** A changed file as the provider reports it, before snapshot policy applies. */
export interface RemoteFetchedFile {
  oldPath: string | null;
  newPath: string | null;
  changeKind: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  binary: boolean;
  /** The entry's pre- and post-image modes, verbatim, or null when absent. */
  oldMode: string | null;
  newMode: string | null;
  /** The post-image is a symlink; its target is never followed. */
  symlink: boolean;
  /** GitLab collapsed or capped this file's diff; its content is incomplete. */
  incomplete: boolean;
  /** Why it is incomplete, for the omission. Null when it is not. */
  incompleteReason: string | null;
  /** The `diff --git` section this file contributes to the rebuilt patch. */
  patchSection: string;
}

export interface ListDiscussionsRequest {
  target: RemoteTarget;
  /**
   * Hard ceiling on threads read; exceeding it is reported, never hidden.
   * Reconciliation passes no ceiling, because a display limit is not evidence
   * that a comment does not exist (doc 03 P1.5 correction 4).
   */
  maxDiscussions: number;
}

export interface DiscussionListing {
  discussions: RemoteDiscussion[];
  /**
   * Whether every thread that exists remotely was read. Reconciliation may
   * conclude "this comment is not there" only from a complete listing.
   */
  complete: boolean;
  /** Threads that exist remotely but were not read, with the reason. */
  omissions: string[];
}

export interface PublishCommentRequest {
  target: RemoteTarget;
  /** The human's text, verbatim, plus whatever marker the caller appended. */
  body: string;
  position: RemotePosition;
}

export interface PublishedComment {
  discussionId: string;
  noteId: string;
  url: string | null;
}

/**
 * Who the provider is authenticated as. Reconciliation needs it: a marker in a
 * comment written by somebody else is not evidence that AMBICODE posted it.
 */
export interface ProviderIdentity {
  /** The account name the remote reports for the current credentials. */
  username: string;
  displayName: string;
}

/**
 * One interface for every remote host. A provider never edits the developer's
 * checkout and never publishes without being asked to by the human form; a
 * `publishComment` implementation existing is not a path to it being called.
 */
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

import { z } from 'zod';
import { ProviderId } from './primitives.ts';

/**
 * The provider-neutral contract (doc 02, "Provider contract"). Review,
 * reporting and the later selection page depend on this module and on the
 * registry; none of them imports a GitLab or GitHub module. Adding a provider
 * changes its own module and one registration.
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
    };

export type ProviderOperation =
  | 'resolveTarget'
  | 'fetchSnapshot'
  | 'getCurrentRevision'
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
): ProviderOutcome<T> {
  return { kind: 'failed', provider, operation, message, details };
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

/** What `getCurrentRevision` answers, for the P1.6 stale-revision checks. */
export const RemoteRevision = z.strictObject({
  provider: ProviderId,
  host: z.string().min(1),
  projectId: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  headSha: z.string().min(1),
  /** The newest collected diff version, which a new push creates. */
  versionId: z.number().int().positive(),
});
export type RemoteRevision = z.infer<typeof RemoteRevision>;

/**
 * Whether a pinned target still describes the merge request as it is now.
 * Provider identity, merge-request identity and revision are compared
 * explicitly: a match on head alone would accept a different merge request.
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
    differences.push(`merge request !${pinned.mergeRequestIid} → !${current.mergeRequestIid}`);
  }
  if (pinned.headSha !== current.headSha) {
    differences.push(`head ${pinned.headSha.slice(0, 12)} → ${current.headSha.slice(0, 12)}`);
  }
  if (pinned.versionId !== current.versionId) {
    differences.push(`diff version ${pinned.versionId} → ${current.versionId}`);
  }
  return differences.length === 0 ? { same: true } : { same: false, differences };
}

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
  /** Everything the snapshot does not contain, and why. Never silent. */
  omissions: string[];
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
  /** GitLab collapsed or capped this file's diff; its content is incomplete. */
  incomplete: boolean;
  /** The `diff --git` section this file contributes to the rebuilt patch. */
  patchSection: string;
}

export interface ListDiscussionsRequest {
  target: RemoteTarget;
  /** Hard ceiling on threads read; exceeding it is reported, never hidden. */
  maxDiscussions: number;
}

export interface DiscussionListing {
  discussions: RemoteDiscussion[];
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
  listDiscussions(request: ListDiscussionsRequest): Promise<ProviderOutcome<DiscussionListing>>;
  publishComment(request: PublishCommentRequest): Promise<ProviderOutcome<PublishedComment>>;
}

/** Turns a non-ok outcome into the sentences an operator can act on. */
export function describeProviderOutcome(
  outcome: Exclude<ProviderOutcome<unknown>, { kind: 'ok' }>,
): { message: string; details: string[] } {
  return {
    message: outcome.message,
    details: outcome.kind === 'failed' ? outcome.details : [],
  };
}

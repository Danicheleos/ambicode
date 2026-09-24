import { z } from 'zod';
import {
  providerFailed,
  providerOk,
  type CoverageGap,
  type DiscussionListing,
  type FetchSnapshotRequest,
  type FetchedContent,
  type FetchedSnapshot,
  type ListDiscussionsRequest,
  type ProviderIdentity,
  type ProviderOutcome,
  type PublishCommentRequest,
  type PublishedComment,
  type RemoteDiscussion,
  type RemoteRevision,
  type RemoteFetchedFile,
  type RemoteTarget,
  type ResolveTargetRequest,
  type ReviewCoverage,
  type ReviewProvider,
} from '../../contracts/provider.ts';
import type { ProcessRunner } from '../../ports/process.ts';
import { MAX_SNAPSHOT_FILE_BYTES } from '../../config/defaults.ts';
import { isBinaryContent } from '../../snapshot/exclusions.ts';
import { toGitLabPositionFields } from '../position.ts';
import { GitLabApi, type ApiResult } from './api.ts';
import {
  GitLabBlobBatch,
  GitLabCompare,
  GitLabCreatedDiscussion,
  GitLabDiscussion,
  GitLabFile,
  GitLabMergeRequest,
  GitLabProject,
  GitLabTreeEntry,
  GitLabUser,
  GitLabVersion,
  GitLabVersionDetail,
  type GitLabVersionDiff,
} from './schemas.ts';
import { encodeProjectIdentity, parseMergeRequestUrl } from './url.ts';

/**
 * The GitLab implementation of the provider contract. It owns pagination,
 * revision pinning and diff positions; it does not own prompts, HTML, or the
 * decision to publish anything.
 *
 * Nothing here touches the developer's checkout: no fetch, no checkout, no
 * stash, no index write. The merge request is read over the API and mirrored
 * into the review snapshot, which is why a dirty working tree is irrelevant to
 * a remote review.
 */

const GITLAB_HOST_PATTERN = /(^|\.)gitlab\b/i;

/** Git's mode for a symlink blob; its target is never read or followed. */
const SYMLINK_MODE = '120000';
/** Git's mode for a submodule entry, which has no blob to mirror. */
const GITLINK_MODE = '160000';

/**
 * Version collection states GitLab uses when it did not deliver everything.
 * `collected` and `empty` are the only complete ones; the rest are caps.
 */
const CAPPED_VERSION_STATES = new Set(['overflow', 'without_files', 'timeout']);

/**
 * Paths per batched blob query. Two separate ceilings sit just above it, both
 * measured against gitlab.com:
 *
 * - the connection returns at most 100 nodes however many paths were asked
 *   for, and says so only in `pageInfo`. Asked for 141, it answered 124 — one
 *   full page plus a second query's 24 — with no error naming the 17 it left
 *   out.
 * - the query complexity limit is 250, and this selection costs about 2 per
 *   path: 118 paths is "complexity of 252, which exceeds max complexity of
 *   250", 117 is accepted.
 *
 * So 100 is the real limit, and `hasNextPage` is still checked, because a
 * server with a smaller page is the same failure with a different number.
 */
const MAX_BLOB_BATCH_PATHS = 100;

/**
 * `rawTextBlob` is empty for anything GitLab does not serve as text, and
 * `rawSize` is the blob's own byte length — which is what makes the answer
 * checkable rather than trusted.
 */
const BLOB_BATCH_QUERY =
  'query($project:ID!,$paths:[String!]!,$ref:String!){' +
  'project(fullPath:$project){repository{blobs(paths:$paths,ref:$ref){' +
  'pageInfo{hasNextPage} nodes{path rawSize rawTextBlob}}}}}';

export interface GitLabProviderOptions {
  runner: ProcessRunner;
  /** Working directory for glab. Its configuration is per-host, not per-repo. */
  cwd: string;
  executable?: string;
  /** Overridable in tests; production uses the module defaults. */
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export class GitLabProvider implements ReviewProvider {
  readonly id = 'gitlab' as const;
  private readonly options: GitLabProviderOptions;

  constructor(options: GitLabProviderOptions) {
    this.options = options;
  }

  /**
   * A GitLab merge request is recognized by its path shape, which GitHub and
   * the other hosts do not use, so a self-hosted GitLab on any hostname is
   * matched without a host allowlist. The `gitlab` hostname check only breaks
   * the tie for a URL that both providers could claim.
   */
  owns(url: string): boolean {
    const parsed = parseMergeRequestUrl(url);
    if (parsed.kind === 'ok') return true;
    try {
      return GITLAB_HOST_PATTERN.test(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  private apiFor(host: string): GitLabApi {
    return new GitLabApi({
      runner: this.options.runner,
      host,
      cwd: this.options.cwd,
      ...(this.options.executable === undefined ? {} : { executable: this.options.executable }),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      ...(this.options.maxOutputBytes === undefined ? {} : { maxOutputBytes: this.options.maxOutputBytes }),
    });
  }

  /**
   * Resolves the URL to a fully pinned target: provider, host, target and
   * source project, iid, web URL, the selected diff version and its base, start
   * and head SHAs. The local HEAD is never consulted for any of them.
   */
  async resolveTarget(request: ResolveTargetRequest): Promise<ProviderOutcome<RemoteTarget>> {
    const parsed = parseMergeRequestUrl(request.url);
    if (parsed.kind === 'invalid') {
      // Refused before any process starts: an unusable URL costs nothing.
      return providerFailed('gitlab', 'resolveTarget', parsed.reason, [
        ...parsed.details,
        'No request was made to GitLab.',
      ]);
    }
    const ref = parsed.ref;
    const api = this.apiFor(ref.host);

    const project = await api.request(
      { path: `projects/${encodeProjectIdentity(ref.projectPath)}` },
      GitLabProject,
    );
    if (project.kind !== 'ok') return this.fail('resolveTarget', project);

    // Both need only the project id, and each is a `glab` process measured at
    // 1.52s, so they run together. The merge request's failure is still the
    // one reported when both fail: it is the more specific answer.
    const [mergeRequest, versions] = await Promise.all([
      api.request({ path: mergeRequestPath(project.value.id, ref.mergeRequestIid) }, GitLabMergeRequest),
      api.collect(
        { path: `${mergeRequestPath(project.value.id, ref.mergeRequestIid)}/versions` },
        GitLabVersion,
      ),
    ]);
    if (mergeRequest.kind !== 'ok') return this.fail('resolveTarget', mergeRequest);
    if (versions.kind !== 'ok') return this.fail('resolveTarget', versions);

    // GitLab lists versions newest first; the newest collected one is what the
    // review pins to, and its own SHAs are used rather than the merge request's
    // current `diff_refs`, which follow the branch.
    const selected = versions.value.items[0];
    if (selected === undefined) {
      return providerFailed('gitlab', 'resolveTarget', 'This merge request has no collected diff version.', [
        'GitLab had not finished collecting the diff, or the merge request has no commits.',
        'AMBICODE does not fall back to the local HEAD as a remote revision.',
      ]);
    }
    if (selected.base_commit_sha === null || selected.start_commit_sha === null) {
      return providerFailed(
        'gitlab',
        'resolveTarget',
        `Diff version ${selected.id} does not carry a base and start commit, so positions could not be pinned.`,
        ['A comment without exact base/start/head SHAs would land on the wrong lines.'],
      );
    }

    const sourceProjectId = mergeRequest.value.source_project_id ?? project.value.id;
    const sourceProjectPath =
      sourceProjectId === project.value.id
        ? project.value.path_with_namespace
        : await this.sourceProjectPath(api, sourceProjectId);

    return providerOk({
      provider: 'gitlab',
      host: ref.host,
      projectId: project.value.id,
      projectPath: project.value.path_with_namespace,
      sourceProjectId,
      sourceProjectPath,
      mergeRequestIid: mergeRequest.value.iid,
      webUrl: mergeRequest.value.web_url,
      versionId: selected.id,
      baseSha: selected.base_commit_sha,
      startSha: selected.start_commit_sha,
      headSha: selected.head_commit_sha,
    });
  }

  /**
   * A fork's path is useful in the report but not load-bearing: blobs are
   * fetched by numeric id, so an inaccessible fork leaves the id in place
   * rather than failing resolution here. `fetchSnapshot` reports what it could
   * not read as an omission.
   */
  private async sourceProjectPath(api: GitLabApi, sourceProjectId: string): Promise<string> {
    const source = await api.request({ path: `projects/${encodeProjectIdentity(sourceProjectId)}` }, GitLabProject);
    return source.kind === 'ok' ? source.value.path_with_namespace : sourceProjectId;
  }

  async fetchSnapshot(request: FetchSnapshotRequest): Promise<ProviderOutcome<FetchedSnapshot>> {
    const target = request.target;
    const api = this.apiFor(target.host);

    const version = await api.request(
      {
        path: `${mergeRequestPath(target.projectId, target.mergeRequestIid)}/versions/${target.versionId}`,
      },
      GitLabVersionDetail,
    );
    if (version.kind !== 'ok') return this.fail('fetchSnapshot', version);

    // The pinned version must still be the pinned version.
    if (version.value.head_commit_sha !== target.headSha) {
      return providerFailed(
        'gitlab',
        'fetchSnapshot',
        `Diff version ${target.versionId} now reports head ${version.value.head_commit_sha.slice(0, 12)}, not the pinned ${target.headSha.slice(0, 12)}.`,
        ['The review was not built, because its evidence would not describe one revision.'],
      );
    }

    const omissions: string[] = [];
    const delivered: RemoteFetchedFile[] = [];
    const symlinkPaths = new Set<string>();

    for (const entry of version.value.diffs) {
      const file = toFetchedFile(entry);
      if (file.incompleteReason !== null) {
        omissions.push(
          `${entry.new_path || entry.old_path}: GitLab did not deliver this file's diff in full (${file.incompleteReason}), so its change is not part of the reviewed evidence.`,
        );
      }
      if (file.symlink && file.newPath !== null) symlinkPaths.add(file.newPath);
      delivered.push(file);
    }

    // Coverage is judged on what GitLab delivered, before anything below
    // narrows it: dropping a file here must never read as GitLab withholding one.
    const coverage = assessCoverage(version.value, delivered);

    // A merge request's diff is against the merge base, which for a long-lived
    // branch is far behind the target. Measured on MR 2677: 299 changed files,
    // of which 249 were byte-identical to the target branch already — including
    // package-lock.json and 15 of 16 translation bundles, which between them
    // blocked the review twice on the per-file ceiling. Reviewing them asks the
    // reader about work that merging would not change.
    const stillDiffers = await this.pathsDifferingFromTarget(api, target);
    const files =
      stillDiffers === null
        ? delivered
        : delivered.filter((file) => {
            const named = file.newPath ?? file.oldPath;
            return named === null || stillDiffers.has(named);
          });
    const dropped = delivered.length - files.length;
    if (stillDiffers === null) {
      omissions.push(
        'Whether each changed file still differs from the target branch could not be established, so the whole merge-request diff was reviewed, including any part of it that is already on the target branch.',
      );
    } else if (dropped > 0) {
      omissions.push(
        `${dropped} of the merge request's ${delivered.length} changed file(s) are already identical to ${target.projectPath}'s target branch at ${target.startSha.slice(0, 12)}, so merging changes nothing in them and they were not reviewed. The ${files.length} file(s) that would actually change were.`,
      );
    }

    const sections = files.map((file) => file.patchSection);
    for (const gap of coverage.gaps) {
      if (gap.kind === 'file-truncated') continue; // Already reported above.
      omissions.push(gap.detail);
    }

    const content = new RemoteContent(
      api,
      target,
      request.includeSiblingContext,
      symlinkPaths,
      (message) => omissions.push(message),
    );

    return providerOk({
      files,
      patch: sections.join(''),
      read: (relativePath) => content.read(relativePath),
      list: (directoryName) => content.list(directoryName),
      prime: (relativePaths) => content.prime(relativePaths),
      omissions,
      coverage,
    });
  }

  /**
   * The merge request as it is now, for the stale-revision checks.
   *
   * Both the merge request's own head and the newest collected diff version are
   * read, because they disagree for as long as GitLab is still collecting a new
   * push. Returning the newest collected version on its own would let
   * publication treat a superseded revision as current (doc 03 P1.5
   * correction 1).
   */
  async getCurrentRevision(target: RemoteTarget): Promise<ProviderOutcome<RemoteRevision>> {
    const api = this.apiFor(target.host);
    const identity = {
      provider: 'gitlab' as const,
      host: target.host,
      projectId: target.projectId,
      mergeRequestIid: target.mergeRequestIid,
    };

    const mergeRequest = await api.request(
      { path: mergeRequestPath(target.projectId, target.mergeRequestIid) },
      GitLabMergeRequest,
    );
    // A merge request that was deleted, or whose response could not be
    // validated or was truncated, is unavailable — never "unchanged".
    if (mergeRequest.kind !== 'ok') {
      return providerOk({
        ...identity,
        state: 'unavailable',
        headSha: null,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: null,
        reason: `The merge request could not be read: ${mergeRequest.message}`,
      });
    }

    const mr = mergeRequest.value;
    if (mr.state !== 'opened') {
      return providerOk({
        ...identity,
        state: 'unavailable',
        headSha: mr.sha,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: `The merge request is ${mr.state}, so a review comment can no longer be attached to its diff.`,
      });
    }

    // GitLab publishes `diff_refs` only once it has collected a diff for the
    // current head; their absence means collection is still in progress.
    if (mr.diff_refs === null || mr.diff_refs.head_sha === null) {
      return providerOk({
        ...identity,
        state: 'collecting',
        headSha: mr.sha,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason:
          'GitLab has not published current diff refs for this merge request, which means it is still collecting the diff for the newest push.',
      });
    }

    const currentHead = mr.sha ?? mr.diff_refs.head_sha;
    if (!sameSha(currentHead, mr.diff_refs.head_sha)) {
      return providerOk({
        ...identity,
        state: 'collecting',
        headSha: currentHead,
        versionId: null,
        collectedHeadSha: mr.diff_refs.head_sha,
        mergeRequestState: mr.state,
        reason: `The merge request head is ${currentHead.slice(0, 12)} but its diff refs still describe ${mr.diff_refs.head_sha.slice(0, 12)}; GitLab is still collecting.`,
      });
    }

    const versions = await api.collect(
      { path: `${mergeRequestPath(target.projectId, target.mergeRequestIid)}/versions` },
      GitLabVersion,
    );
    if (versions.kind !== 'ok') {
      return providerOk({
        ...identity,
        state: 'unavailable',
        headSha: currentHead,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: `The collected diff versions could not be read: ${versions.message}`,
      });
    }

    const newest = versions.value.items[0];
    if (newest === undefined) {
      return providerOk({
        ...identity,
        state: 'collecting',
        headSha: currentHead,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: 'This merge request has no collected diff version.',
      });
    }

    // The decisive comparison: the newest collected version must describe the
    // head the merge request actually points at. When it does not, a newer push
    // exists that GitLab has not collected yet, and the pinned version is not
    // the current one however old or new its id happens to be.
    if (!sameSha(newest.head_commit_sha, currentHead)) {
      return providerOk({
        ...identity,
        state: 'collecting',
        headSha: currentHead,
        versionId: newest.id,
        collectedHeadSha: newest.head_commit_sha,
        mergeRequestState: mr.state,
        reason: `The merge request head is ${currentHead.slice(0, 12)}, but the newest collected diff version ${newest.id} still describes ${newest.head_commit_sha.slice(0, 12)}. GitLab has not collected the newest push yet.`,
      });
    }

    if (!sameSha(currentHead, target.headSha) || newest.id !== target.versionId) {
      return providerOk({
        ...identity,
        state: 'stale',
        headSha: currentHead,
        versionId: newest.id,
        collectedHeadSha: newest.head_commit_sha,
        mergeRequestState: mr.state,
        reason: `The merge request has moved since the review: pinned ${target.headSha.slice(0, 12)} (version ${target.versionId}), current ${currentHead.slice(0, 12)} (version ${newest.id}).`,
      });
    }

    return providerOk({
      ...identity,
      state: 'current',
      headSha: currentHead,
      versionId: newest.id,
      collectedHeadSha: newest.head_commit_sha,
      mergeRequestState: mr.state,
      reason: null,
    });
  }

  /** The account glab is authenticated as, for reconciliation identity checks. */
  async getIdentity(target: RemoteTarget): Promise<ProviderOutcome<ProviderIdentity>> {
    const api = this.apiFor(target.host);
    const user = await api.request({ path: 'user' }, GitLabUser);
    if (user.kind !== 'ok') return this.fail('getIdentity', user);
    return providerOk({ username: user.value.username, displayName: user.value.name });
  }

  async listDiscussions(request: ListDiscussionsRequest): Promise<ProviderOutcome<DiscussionListing>> {
    const api = this.apiFor(request.target.host);
    const collected = await api.collect(
      { path: `${mergeRequestPath(request.target.projectId, request.target.mergeRequestIid)}/discussions` },
      GitLabDiscussion,
      { maxItems: request.maxDiscussions },
    );
    if (collected.kind !== 'ok') return this.fail('listDiscussions', collected);

    const omissions = collected.value.capped
      ? [
          `Only the first ${request.maxDiscussions} merge request discussion(s) were read. Older threads exist and were not shown to the reviewer.`,
        ]
      : [];

    return providerOk({
      discussions: collected.value.items.map(toRemoteDiscussion),
      complete: !collected.value.capped,
      omissions,
    });
  }

  /**
   * Called only by the publication run the human form authorizes. The CLI, the
   * review skill and the review command have no path that reaches it.
   */
  async publishComment(request: PublishCommentRequest): Promise<ProviderOutcome<PublishedComment>> {
    const api = this.apiFor(request.target.host);
    const created = await api.request(
      {
        path: `${mergeRequestPath(request.target.projectId, request.target.mergeRequestIid)}/discussions`,
        method: 'POST',
        body: { body: request.body, position: toGitLabPositionFields(request.position) },
      },
      GitLabCreatedDiscussion,
    );
    if (created.kind !== 'ok') return this.fail('publishComment', created);

    const note = created.value.notes[0];
    if (note === undefined) {
      return providerFailed(
        'gitlab',
        'publishComment',
        'GitLab accepted the discussion but returned no note, so delivery could not be confirmed.',
        ['Query the discussions before retrying; a lost response can still mean the comment exists.'],
      );
    }
    return providerOk({
      discussionId: created.value.id,
      noteId: note.id,
      url: `${request.target.webUrl}#note_${note.id}`,
    });
  }

  /**
   * The changed paths that still differ between the target branch and the
   * merge request head, or null when that could not be established.
   *
   * One `repository/compare` call, not one read per file. Null rather than an
   * empty set on any doubt — a partial answer would silently narrow the review,
   * which is the one failure this is not allowed to cause. `compare_timeout` is
   * GitLab saying so itself.
   *
   * This only ever removes files from GitLab's own diff, so it cannot invent a
   * change: a file the branch never touched is not in that diff to begin with,
   * and so cannot arrive here as a phantom revert of the target branch's work.
   * Measured on MR 2677: of 50 paths differing from the target, 0 were absent
   * from the merge request's own 299-file diff.
   */
  private async pathsDifferingFromTarget(
    api: GitLabApi,
    target: RemoteTarget,
  ): Promise<Set<string> | null> {
    if (sameSha(target.startSha, target.headSha)) return null;
    const compared = await api.request(
      {
        path: `projects/${encodeProjectIdentity(target.projectId)}/repository/compare`,
        query: { from: target.startSha, to: target.headSha, straight: 'true' },
      },
      GitLabCompare,
    );
    if (compared.kind !== 'ok' || compared.value.compare_timeout) return null;
    const paths = new Set<string>();
    for (const entry of compared.value.diffs) {
      if (entry.new_path !== '') paths.add(entry.new_path);
      if (entry.old_path !== '') paths.add(entry.old_path);
    }
    return paths;
  }

  private fail<T>(
    operation: Parameters<typeof providerFailed>[1],
    result: Exclude<ApiResult<unknown>, { kind: 'ok' }>,
  ): ProviderOutcome<T> {
    return providerFailed('gitlab', operation, result.message, result.details, result.certainty);
  }
}

/**
 * GitLab abbreviates a sha in some payloads and spells it in full in others, so
 * two spellings of the same commit are compared on their common prefix. Seven
 * hex characters is git's own minimum for an unambiguous abbreviation.
 */
export function sameSha(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  const length = Math.min(left.length, right.length);
  if (length < 7) return false;
  return left.slice(0, length) === right.slice(0, length);
}

/**
 * Whether the delivered diff is the whole change. GitLab caps a merge request
 * diff in two independent ways: per file, with `collapsed` or `too_large`, and
 * in aggregate, by declaring a `real_size` larger than the list it sends or by
 * marking the version's collection state as an overflow.
 *
 * Both are material: a missing file is a change nobody reviewed, so the result
 * may not be called complete (doc 03 P1.5 correction 2).
 */
export function assessCoverage(
  version: { real_size: string | null; state: string | null; diffs: readonly unknown[] },
  files: readonly RemoteFetchedFile[],
): ReviewCoverage {
  const gaps: CoverageGap[] = [];
  const declared = parseRealSize(version.real_size);
  const delivered = files.length;

  if (version.state !== null && CAPPED_VERSION_STATES.has(version.state)) {
    gaps.push({
      kind: 'aggregate-cap',
      path: null,
      detail: `GitLab reports the pinned diff version's collection state as "${version.state}", which means it did not deliver every changed file. The review covers only the files it sent.`,
    });
  }

  if (declared !== null && declared > delivered) {
    gaps.push({
      kind: 'omitted-files',
      path: null,
      detail: `GitLab declares ${declared} changed file(s) for the pinned version but delivered ${delivered}. The missing ${declared - delivered} file(s) were not reviewed.`,
    });
  }

  if (delivered === 0) {
    gaps.push({
      kind: 'no-files',
      path: null,
      detail: 'GitLab returned no file diffs for the pinned version, so there is nothing to review.',
    });
  }

  for (const file of files) {
    if (file.incompleteReason === null) continue;
    gaps.push({
      kind: 'file-truncated',
      path: file.newPath ?? file.oldPath,
      detail: `${file.newPath ?? file.oldPath ?? '(unnamed)'}: ${file.incompleteReason}.`,
    });
  }

  return {
    complete: gaps.length === 0,
    declaredFileCount: declared,
    deliveredFileCount: delivered,
    versionState: version.state,
    gaps,
  };
}

/** GitLab writes `real_size` as a decimal string, sometimes suffixed with "+". */
function parseRealSize(value: string | null): number | null {
  if (value === null) return null;
  const match = /^\s*(\d+)\s*\+?\s*$/.exec(value);
  if (match === null) return null;
  return Number.parseInt(match[1] as string, 10);
}

/**
 * Post-image blobs, read from the source project at the pinned head SHA. A fork
 * merge request's head commits exist only in the fork, so the target project is
 * not where the new content lives.
 *
 * Reads are memoized: the snapshot planner asks for changed files and then for
 * their neighbours, and an immutable revision cannot answer differently twice.
 */
class RemoteContent {
  private readonly api: GitLabApi;
  private readonly target: RemoteTarget;
  private readonly includeSiblings: boolean;
  private readonly symlinkPaths: ReadonlySet<string>;
  private readonly note: (message: string) => void;
  private readonly files = new Map<string, FetchedContent | null>();
  private readonly trees = new Map<string, string[]>();

  constructor(
    api: GitLabApi,
    target: RemoteTarget,
    includeSiblings: boolean,
    symlinkPaths: ReadonlySet<string>,
    note: (message: string) => void,
  ) {
    this.api = api;
    this.target = target;
    this.includeSiblings = includeSiblings;
    this.symlinkPaths = symlinkPaths;
    this.note = note;
  }

  async read(relativePath: string): Promise<FetchedContent | null> {
    const cached = this.files.get(relativePath);
    if (cached !== undefined) return cached;
    const value = await this.fetch(relativePath);
    this.files.set(relativePath, value);
    return value;
  }

  /**
   * Fetches what the planner is about to read in batches of
   * `MAX_BLOB_BATCH_PATHS`, instead of one request per file. Measured on MR
   * 2677's 47 changed files: 47 `repository/files` calls against one query of
   * 282 KB answered in 1.9s.
   *
   * Nothing here is load-bearing. A path this does not resolve — a failed
   * query, a short page, a blob GitLab will not serve as text, a body whose
   * length disagrees with the blob's own `rawSize` — is simply left uncached,
   * and `read` fetches it the old way, where bytes are classified before they
   * are decoded. So the fast path can only be faster, never a different answer.
   */
  async prime(relativePaths: readonly string[]): Promise<void> {
    // GraphQL addresses a project by its full path. An unreadable fork leaves
    // the numeric id in its place, which this cannot look up, so that case goes
    // straight to the per-file reads rather than spending a query to find out.
    if (!this.target.sourceProjectPath.includes('/')) return;
    const wanted = relativePaths.filter(
      (relativePath) => !this.files.has(relativePath) && !this.symlinkPaths.has(relativePath),
    );
    for (let start = 0; start < wanted.length; start += MAX_BLOB_BATCH_PATHS) {
      await this.primeBatch(wanted.slice(start, start + MAX_BLOB_BATCH_PATHS));
    }
  }

  private async primeBatch(paths: readonly string[]): Promise<void> {
    const result = await this.api.graphql(
      BLOB_BATCH_QUERY,
      { project: this.target.sourceProjectPath, paths, ref: this.target.headSha },
      GitLabBlobBatch,
    );
    if (result.kind !== 'ok') return;

    const blobs = result.value.data.project?.repository?.blobs;
    // A capped page is not a short answer: the paths GitLab left out are not
    // named anywhere, so nothing in this response identifies which of them are
    // missing rather than absent from the repository.
    if (blobs === undefined || blobs.pageInfo.hasNextPage) return;

    for (const node of blobs.nodes) {
      if (!paths.includes(node.path)) continue;
      const rawSize = node.rawSize === null ? null : Number(node.rawSize);
      if (rawSize === null || !Number.isSafeInteger(rawSize)) continue;
      if (rawSize > MAX_SNAPSHOT_FILE_BYTES) {
        this.files.set(node.path, { kind: 'too-large', bytes: rawSize });
        continue;
      }
      const text = node.rawTextBlob ?? '';
      // GraphQL hands back a decoded string, so the byte-level binary test the
      // per-file path runs cannot be applied here. This equality is the stand-in
      // and it is strict: a binary blob comes back as an empty string against a
      // non-zero `rawSize`, and anything GitLab re-encoded fails it too. Both
      // fall through to `fetch`, which sees the actual bytes.
      if (Buffer.byteLength(text, 'utf8') !== rawSize) continue;
      this.files.set(node.path, rawSize === 0 ? { kind: 'text', text: '' } : { kind: 'text', text });
    }
  }

  private async fetch(relativePath: string): Promise<FetchedContent | null> {
    // A symlink's blob holds the path it points at. It is never fetched and
    // never resolved, so nothing can be followed out of the snapshot.
    if (this.symlinkPaths.has(relativePath)) return { kind: 'symlink' };

    const result = await this.api.request(
      {
        path: `projects/${encodeProjectIdentity(this.target.sourceProjectId)}/repository/files/${encodeProjectIdentity(relativePath)}`,
        query: { ref: this.target.headSha },
      },
      GitLabFile,
    );

    if (result.kind !== 'ok') {
      // A fork whose repository the reviewer cannot read is the common case,
      // and it is an omission, not a file that happens to be empty.
      this.note(
        `${relativePath}: its content at ${this.target.headSha.slice(0, 12)} could not be read from ${this.target.sourceProjectPath} (${result.message}).`,
      );
      return { kind: 'unavailable', reason: result.message };
    }

    const file = result.value;
    if (file.content === null) return null;
    if (file.encoding !== 'base64') {
      this.note(`${relativePath}: GitLab returned it with an unexpected encoding, so it was not mirrored.`);
      return { kind: 'unavailable', reason: `unexpected encoding "${file.encoding ?? 'none'}"` };
    }

    const bytes = Buffer.from(file.content, 'base64');
    if (bytes.length > MAX_SNAPSHOT_FILE_BYTES) return { kind: 'too-large', bytes: bytes.length };
    // Classified on bytes before anything is decoded, exactly as local
    // snapshots are (doc 11).
    if (await isBinaryContent(bytes)) return { kind: 'binary' };
    return { kind: 'text', text: bytes.toString('utf8') };
  }

  async list(directoryName: string): Promise<string[]> {
    if (!this.includeSiblings) return [];
    const cached = this.trees.get(directoryName);
    if (cached !== undefined) return cached;

    const collected = await this.api.collect(
      {
        path: `projects/${encodeProjectIdentity(this.target.sourceProjectId)}/repository/tree`,
        query: { ref: this.target.headSha, ...(directoryName === '' ? {} : { path: directoryName }) },
      },
      GitLabTreeEntry,
    );

    if (collected.kind !== 'ok') {
      this.note(
        `${directoryName === '' ? '(repository root)' : directoryName}: its file listing could not be read, so unchanged files beside the change were not available as context.`,
      );
      this.trees.set(directoryName, []);
      return [];
    }

    const names = collected.value.items
      .filter((entry) => entry.type === 'blob' && entry.mode !== SYMLINK_MODE)
      .map((entry) => entry.path);
    this.trees.set(directoryName, names);
    return names;
  }
}

function mergeRequestPath(projectId: string, iid: number): string {
  return `projects/${encodeProjectIdentity(projectId)}/merge_requests/${iid}`;
}

type ModeKind = 'file' | 'symlink' | 'gitlink' | 'unknown';

function modeKind(mode: string | null): ModeKind {
  if (mode === null || mode === '' || mode === '0') return 'unknown';
  if (mode === SYMLINK_MODE) return 'symlink';
  if (mode === GITLINK_MODE) return 'gitlink';
  return 'file';
}

/**
 * GitLab delivers a file's diff body without the `diff --git` header, so the
 * header is rebuilt from the authoritative `old_path`/`new_path` fields. The
 * header is never parsed back for identity — those fields are the identity.
 *
 * An empty body is not automatically a truncation: a pure rename and a
 * mode-only change both legitimately carry no hunks, and reporting them as
 * missing coverage would make every renamed file a gap (doc 03 P1.5
 * correction 5).
 */
function toFetchedFile(entry: GitLabVersionDiff): RemoteFetchedFile {
  const oldPath = entry.new_file ? null : entry.old_path;
  const newPath = entry.deleted_file ? null : entry.new_path;

  const oldKind = modeKind(entry.a_mode);
  const newKind = modeKind(entry.b_mode);
  const typeChanged =
    !entry.new_file && !entry.deleted_file && oldKind !== 'unknown' && newKind !== 'unknown' && oldKind !== newKind;
  const symlink = newKind === 'symlink' || (entry.deleted_file && oldKind === 'symlink');

  const changeKind: RemoteFetchedFile['changeKind'] = entry.new_file
    ? 'added'
    : entry.deleted_file
      ? 'deleted'
      : typeChanged
        ? 'type-changed'
        : entry.renamed_file
          ? 'renamed'
          : 'modified';

  const body = entry.diff;
  const binary = /^Binary files .* differ$/m.test(body) || /^GIT binary patch$/m.test(body);
  // A rename or a mode change with no content change has nothing to put in a
  // hunk, and GitLab says so by sending the entry with an empty body.
  const modeOnly = entry.a_mode !== entry.b_mode && entry.a_mode !== null && entry.b_mode !== null;
  const contentlessIsExpected = entry.renamed_file || modeOnly || symlink || entry.generated_file === true;

  const incompleteReason =
    entry.too_large === true
      ? 'GitLab marked it too large'
      : entry.collapsed === true
        ? 'GitLab collapsed it'
        : body === '' && !binary && !contentlessIsExpected
          ? 'GitLab returned an empty diff body'
          : null;
  const incomplete = incompleteReason !== null;

  const header = [
    `diff --git a/${entry.old_path} b/${entry.new_path}`,
    ...(entry.a_mode === null || entry.b_mode === null || entry.a_mode === entry.b_mode
      ? []
      : [`old mode ${entry.a_mode}`, `new mode ${entry.b_mode}`]),
    `--- ${oldPath === null ? '/dev/null' : `a/${entry.old_path}`}`,
    `+++ ${newPath === null ? '/dev/null' : `b/${entry.new_path}`}`,
  ].join('\n');
  const section = incomplete
    ? `${header}\n`
    : `${header}\n${body.endsWith('\n') || body === '' ? body : `${body}\n`}`;

  return {
    oldPath,
    newPath,
    changeKind,
    binary,
    oldMode: entry.a_mode,
    newMode: entry.b_mode,
    symlink,
    incomplete,
    incompleteReason,
    patchSection: section,
  };
}

function toRemoteDiscussion(discussion: GitLabDiscussion): RemoteDiscussion {
  const notes = discussion.notes.map((note) => ({
    id: note.id,
    discussionId: discussion.id,
    author: note.author?.username ?? note.author?.name ?? '',
    body: note.body,
    url: null,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    resolved: note.resolved,
    resolvable: note.resolvable,
    system: note.system,
    position:
      note.position === null ||
      note.position.base_sha === null ||
      note.position.start_sha === null ||
      note.position.head_sha === null
        ? null
        : {
            baseSha: note.position.base_sha,
            startSha: note.position.start_sha,
            headSha: note.position.head_sha,
            oldPath: note.position.old_path,
            newPath: note.position.new_path,
            oldLine: note.position.old_line,
            newLine: note.position.new_line,
          },
  }));

  const resolvable = notes.filter((note) => note.resolvable);
  return {
    id: discussion.id,
    // A thread nobody can resolve is not a resolved thread.
    resolved: resolvable.length > 0 && resolvable.every((note) => note.resolved === true),
    notes,
  };
}

/** Kept close to the schemas it validates, so a drift shows up as a type error. */
export type GitLabCollectionSchema = z.ZodType<unknown>;

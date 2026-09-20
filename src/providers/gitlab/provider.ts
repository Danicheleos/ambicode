import { z } from 'zod';
import {
  providerFailed,
  providerOk,
  type DiscussionListing,
  type FetchSnapshotRequest,
  type FetchedContent,
  type FetchedSnapshot,
  type ListDiscussionsRequest,
  type ProviderOutcome,
  type PublishCommentRequest,
  type PublishedComment,
  type RemoteDiscussion,
  type RemoteRevision,
  type RemoteFetchedFile,
  type RemoteTarget,
  type ResolveTargetRequest,
  type ReviewProvider,
} from '../../contracts/provider.ts';
import type { ProcessRunner } from '../../ports/process.ts';
import { MAX_SNAPSHOT_FILE_BYTES } from '../../config/defaults.ts';
import { isBinaryContent } from '../../snapshot/exclusions.ts';
import { toGitLabPositionFields } from '../position.ts';
import { GitLabApi, type ApiResult } from './api.ts';
import {
  GitLabCreatedDiscussion,
  GitLabDiscussion,
  GitLabFile,
  GitLabMergeRequest,
  GitLabProject,
  GitLabTreeEntry,
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

    const mergeRequest = await api.request(
      { path: mergeRequestPath(project.value.id, ref.mergeRequestIid) },
      GitLabMergeRequest,
    );
    if (mergeRequest.kind !== 'ok') return this.fail('resolveTarget', mergeRequest);

    const versions = await api.collect(
      { path: `${mergeRequestPath(project.value.id, ref.mergeRequestIid)}/versions` },
      GitLabVersion,
    );
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
    const files: RemoteFetchedFile[] = [];
    const sections: string[] = [];

    for (const entry of version.value.diffs) {
      const file = toFetchedFile(entry);
      if (file.incomplete) {
        omissions.push(
          `${entry.new_path || entry.old_path}: GitLab did not deliver this file's diff in full (${describeIncompleteness(entry)}), so its change is not part of the reviewed evidence.`,
        );
      }
      files.push(file);
      sections.push(file.patchSection);
    }

    if (version.value.diffs.length === 0) {
      omissions.push('GitLab returned no file diffs for the pinned version, so there is nothing to review.');
    }

    const content = new RemoteContent(
      api,
      target,
      request.includeSiblingContext,
      (message) => omissions.push(message),
    );

    return providerOk({
      files,
      patch: sections.join(''),
      read: (relativePath) => content.read(relativePath),
      list: (directoryName) => content.list(directoryName),
      omissions,
    });
  }

  /** The merge request as it is now, for the P1.6 stale-revision checks. */
  async getCurrentRevision(target: RemoteTarget): Promise<ProviderOutcome<RemoteRevision>> {
    const api = this.apiFor(target.host);
    const versions = await api.collect(
      { path: `${mergeRequestPath(target.projectId, target.mergeRequestIid)}/versions` },
      GitLabVersion,
    );
    if (versions.kind !== 'ok') return this.fail('getCurrentRevision', versions);

    const newest = versions.value.items[0];
    if (newest === undefined) {
      return providerFailed('gitlab', 'getCurrentRevision', 'This merge request has no collected diff version.');
    }
    return providerOk({
      provider: 'gitlab',
      host: target.host,
      projectId: target.projectId,
      mergeRequestIid: target.mergeRequestIid,
      headSha: newest.head_commit_sha,
      versionId: newest.id,
    });
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
      omissions,
    });
  }

  /**
   * Implemented because the contract requires it. Nothing in P1.5 calls it: the
   * CLI, the review skill and the review command have no path that reaches a
   * remote write. Publication is authorized by the human form in P1.6.
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

  private fail<T>(
    operation: Parameters<typeof providerFailed>[1],
    result: Exclude<ApiResult<unknown>, { kind: 'ok' }>,
  ): ProviderOutcome<T> {
    return providerFailed('gitlab', operation, result.message, result.details);
  }
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
  private readonly note: (message: string) => void;
  private readonly files = new Map<string, FetchedContent | null>();
  private readonly trees = new Map<string, string[]>();

  constructor(
    api: GitLabApi,
    target: RemoteTarget,
    includeSiblings: boolean,
    note: (message: string) => void,
  ) {
    this.api = api;
    this.target = target;
    this.includeSiblings = includeSiblings;
    this.note = note;
  }

  async read(relativePath: string): Promise<FetchedContent | null> {
    const cached = this.files.get(relativePath);
    if (cached !== undefined) return cached;
    const value = await this.fetch(relativePath);
    this.files.set(relativePath, value);
    return value;
  }

  private async fetch(relativePath: string): Promise<FetchedContent | null> {
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

    const names = collected.value.items.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
    this.trees.set(directoryName, names);
    return names;
  }
}

function mergeRequestPath(projectId: string, iid: number): string {
  return `projects/${encodeProjectIdentity(projectId)}/merge_requests/${iid}`;
}

/**
 * GitLab delivers a file's diff body without the `diff --git` header, so the
 * header is rebuilt from the authoritative `old_path`/`new_path` fields. The
 * header is never parsed back for identity — those fields are the identity.
 */
function toFetchedFile(entry: GitLabVersionDiff): RemoteFetchedFile {
  const oldPath = entry.new_file ? null : entry.old_path;
  const newPath = entry.deleted_file ? null : entry.new_path;
  const changeKind = entry.new_file
    ? 'added'
    : entry.deleted_file
      ? 'deleted'
      : entry.renamed_file
        ? 'renamed'
        : 'modified';

  const body = entry.diff;
  const binary = /^Binary files .* differ$/m.test(body) || /^GIT binary patch$/m.test(body);
  const incomplete = entry.too_large === true || entry.collapsed === true || (body === '' && !binary);

  const header = [
    `diff --git a/${entry.old_path} b/${entry.new_path}`,
    `--- ${oldPath === null ? '/dev/null' : `a/${entry.old_path}`}`,
    `+++ ${newPath === null ? '/dev/null' : `b/${entry.new_path}`}`,
  ].join('\n');
  const section = incomplete
    ? `${header}\n`
    : `${header}\n${body.endsWith('\n') || body === '' ? body : `${body}\n`}`;

  return { oldPath, newPath, changeKind, binary, incomplete, patchSection: section };
}

function describeIncompleteness(entry: GitLabVersionDiff): string {
  if (entry.too_large === true) return 'GitLab marked it too large';
  if (entry.collapsed === true) return 'GitLab collapsed it';
  return 'GitLab returned an empty diff body';
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

/** Exported for the adapter tests, which assert the rebuilt patch directly. */
export const __testing = { toFetchedFile, toRemoteDiscussion };

/** Kept close to the schemas it validates, so a drift shows up as a type error. */
export type GitLabCollectionSchema = z.ZodType<unknown>;

import type {
  RemoteDiscussion,
  RemoteTarget,
  ReviewCoverage,
  ReviewProvider,
} from '../contracts/provider.ts';
import { combineDiff } from '../git/diff.ts';
import { parseRemoteProject, type RawChange } from '../git/git.ts';
import { AmbicodeError } from '../util/errors.ts';
import type { ContentSource, FileContent } from './content.ts';
import type { TargetResolution } from './target.ts';

/**
 * Resolves a merge-request URL into the same `TargetResolution` shape the local
 * targets produce, so the bundle, the snapshot, the prompt and the validator do
 * not know which kind of target they are working on.
 *
 * The developer's checkout is never touched: no fetch, no checkout, no stash,
 * no index write. Everything comes from the provider at the pinned revision.
 */

export interface RemoteTargetOptions {
  provider: ReviewProvider;
  url: string;
  /** The repository the command was run in; it supplies configuration only. */
  repositoryRoot: string;
  /** That checkout's `origin` URL, or null when it has none. */
  checkoutOriginUrl: string | null;
  includeSiblingContext: boolean;
  /** Zero disables reading prior threads entirely. */
  maxDiscussions: number;
}

export interface RemoteTargetResolution extends TargetResolution {
  remote: RemoteTarget;
  discussions: RemoteDiscussion[];
  /** Everything the remote could not supply, carried into the review result. */
  omissions: string[];
  /**
   * Whether the delivered diff is the whole change. Structural, so the review
   * status can refuse `complete` without matching omission wording.
   */
  coverage: ReviewCoverage;
}

export async function resolveMergeRequestTarget(
  options: RemoteTargetOptions,
): Promise<RemoteTargetResolution> {
  const resolved = await options.provider.resolveTarget({ url: options.url });
  if (resolved.kind !== 'ok') throw providerError('resolve', resolved);
  const remote = resolved.value;

  const fetched = await options.provider.fetchSnapshot({
    target: remote,
    includeSiblingContext: options.includeSiblingContext,
  });
  if (fetched.kind !== 'ok') throw providerError('fetch', fetched);
  const snapshot = fetched.value;

  // The provider's file list is authoritative for identity; the rebuilt patch
  // is split back into sections by the same code local diffs use, so hunk
  // parsing and line addressing behave identically for both.
  const changes: RawChange[] = snapshot.files.map((file) => ({
    oldPath: file.oldPath,
    newPath: file.newPath,
    changeKind: file.changeKind,
    // GitLab's own modes, so a symlink or a type change is identified by what
    // the remote recorded rather than guessed from the rebuilt patch.
    oldMode: file.oldMode ?? '',
    newMode: file.newMode ?? '',
  }));
  const files = combineDiff(changes, snapshot.patch).map((file, index) => ({
    ...file,
    // GitLab states binary-ness and truncation; the rebuilt patch body is not
    // re-interpreted to second-guess it.
    binary: file.binary || (snapshot.files[index]?.binary ?? false),
  }));

  const omissions = [...snapshot.omissions];
  const coverage = snapshot.coverage;
  const configuration = configurationProvenance(options, remote);
  if (configuration.mismatch !== null) omissions.push(configuration.mismatch);

  const discussions: RemoteDiscussion[] = [];
  if (options.maxDiscussions > 0) {
    const listed = await options.provider.listDiscussions({
      target: remote,
      maxDiscussions: options.maxDiscussions,
    });
    if (listed.kind === 'ok') {
      discussions.push(...listed.value.discussions);
      omissions.push(...listed.value.omissions);
    } else {
      // Prior discussion reduces duplicate noise; it is not evidence about the
      // code, so failing to read it narrows the review rather than stopping it.
      omissions.push(
        `Existing merge request discussions could not be read (${listed.message}), so the reviewer may repeat a point that was already raised.`,
      );
    }
  }

  const content: ContentSource = {
    pinning: `Read from ${remote.sourceProjectPath} at ${remote.headSha.slice(0, 12)} through the GitLab API, so it cannot change while the review runs.`,
    digest: remote.headSha,
    read: async (relativePath: string): Promise<FileContent | null> => {
      const value = await snapshot.read(relativePath);
      if (value === null) return null;
      // `unavailable` is already recorded as an omission by the provider; the
      // planner only needs to know it has no bytes. A symlink stays a symlink,
      // so it is reported rather than mirrored as an ordinary text file.
      return value.kind === 'unavailable' ? null : value;
    },
    list: (directoryName: string) => snapshot.list(directoryName),
    ...(snapshot.prime === undefined
      ? {}
      : { prime: (relativePaths: readonly string[]) => snapshot.prime?.(relativePaths) ?? Promise.resolve() }),
  };

  const notes = [
    `Merge request !${remote.mergeRequestIid} in ${remote.projectPath} on ${remote.host}.`,
    `Pinned to diff version ${remote.versionId}: base ${remote.baseSha.slice(0, 12)}, start ${remote.startSha.slice(0, 12)}, head ${remote.headSha.slice(0, 12)}.`,
    ...(remote.sourceProjectId === remote.projectId
      ? []
      : [`The source branch lives in ${remote.sourceProjectPath}, a fork; new file content was read from there.`]),
    'Your local checkout, branch and index were not read or modified for this review.',
    configuration.note,
    content.pinning,
  ];

  return {
    target: {
      kind: 'merge-request',
      repositoryRoot: options.repositoryRoot,
      snapshotId: `mr-${remote.mergeRequestIid}-v${remote.versionId}-${remote.headSha.slice(0, 12)}`,
      headSha: remote.headSha,
      baseSha: remote.baseSha,
      baseRef: null,
      remote,
      notes,
    },
    files,
    patch: snapshot.patch,
    content,
    // The pre-image of the pinned version. Used for evidence, never checked out.
    preImageRevision: remote.baseSha,
    remote,
    discussions,
    omissions,
    coverage,
  };
}

/**
 * Whose configuration judged this merge request. The checkout supplies the
 * policy packs and check commands, and nothing ties it to the merge request's
 * project: run a0e87d39 reviewed an inseer-api merge request from the
 * inseer-frontend checkout, and the frontend's prettier command selected nine
 * backend files, while the report said only that the checkout was not read.
 */
function configurationProvenance(
  options: RemoteTargetOptions,
  remote: RemoteTarget,
): { note: string; mismatch: string | null } {
  const origin = options.checkoutOriginUrl === null ? null : parseRemoteProject(options.checkoutOriginUrl);
  const where = `Judged with the configuration, policy packs and check commands of the checkout at ${options.repositoryRoot}`;
  if (options.checkoutOriginUrl === null) {
    return {
      note: `${where}, which has no origin remote, so whether it belongs to ${remote.projectPath} could not be checked.`,
      mismatch: null,
    };
  }
  if (origin === null) {
    return {
      note: `${where}; its origin is not a host and project path, so whether it belongs to ${remote.projectPath} could not be checked.`,
      mismatch: null,
    };
  }

  const same = (path: string): boolean =>
    origin.host === remote.host.split(':')[0]?.toLowerCase() && origin.path.toLowerCase() === path.toLowerCase();
  // A fork's checkout is still the same project's configuration.
  if (same(remote.projectPath) || same(remote.sourceProjectPath)) {
    return { note: `${where} (origin ${origin.host}/${origin.path}).`, mismatch: null };
  }
  return {
    note: `${where} (origin ${origin.host}/${origin.path}), which is not ${remote.host}/${remote.projectPath}.`,
    mismatch:
      `This checkout is ${origin.host}/${origin.path}, not ${remote.host}/${remote.projectPath}: its configuration, ` +
      'policy packs and check commands were written for another project and were applied to this merge request anyway. ' +
      "Run the review from a checkout of the merge request's own project to judge it by that project's rules.",
  };
}

function providerError(
  stage: 'resolve' | 'fetch',
  outcome: { kind: 'unsupported' | 'failed'; provider: string; message: string; details?: string[] },
): AmbicodeError {
  const code = outcome.kind === 'unsupported' ? 'provider-unsupported' : `provider-${stage}-failed`;
  return new AmbicodeError(code, outcome.message, {
    field: '--mr',
    details: [
      ...(outcome.details ?? []),
      `Provider: ${outcome.provider}.`,
      'Nothing was reviewed, and your checkout was not modified.',
    ],
  });
}

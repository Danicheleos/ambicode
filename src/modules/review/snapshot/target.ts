import path from 'node:path';
import { combineDiff, splitPatchSections } from '#platform/git/diff';
import { Git } from '#platform/git/git';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { MR_DIFF_JSON, MR_DIFF_PATCH } from './mr-capture.ts';
import type { Workspace } from '#types/composition';
import type { RawChange } from '#types/platform/git';
import type { FileSystem } from '#types/platform/ports';
import type { TargetResolution } from '../types/snapshot.ts';

interface WorkingTargetOptions {
  fs: FileSystem;
  git: Git;
  repositoryRoot: string;
}

/**
 * `git diff HEAD` nets staged and unstaged edits; untracked files arrive as intent-to-add
 * entries in a throwaway index copy, leaving `.git/index` untouched.
 */
export async function resolveWorkingTarget(options: WorkingTargetOptions): Promise<TargetResolution> {
  const { fs, git, repositoryRoot } = options;
  await requireHead(git);

  const unmerged = await git.unmergedPaths();
  if (unmerged.length > 0) {
    throw new AmbicodeError(
      'unmerged-index',
      'The index has unmerged paths, so there is no single working revision to review.',
      { details: ['Resolve the conflict, then run the review again.', ...unmerged.slice(0, 10)] },
    );
  }

  const headSha = await git.revParse('HEAD');
  if (headSha === null) throw new AmbicodeError('no-head', 'HEAD does not resolve to a commit.');

  const scratch = await fs.temporaryDirectory('ambicode-index-');
  const notes: string[] = [];
  try {
    const shadowIndex = path.join(scratch, 'index');
    const realIndex = path.join(await git.gitDir(), 'index');
    try {
      await fs.copyFile(realIndex, shadowIndex);
    } catch {
      // A repository with no index yet is fine: git creates the shadow copy.
    }
    const shadow = git.withIndexFile(shadowIndex);
    await shadow.markIntentToAdd();

    const changes = await shadow.rawDiff(['HEAD']);
    const patch = await shadow.patchDiff(['HEAD'], 3);
    const files = combineDiff(changes, patch);
    notes.push('Untracked files that git does not ignore are included as additions.');

    return {
      target: {
        kind: 'working',
        snapshotId: `working-${contentHash(`${headSha}\n${patch}`).slice(7, 23)}`,
        repositoryRoot,
        headSha,
        baseSha: headSha,
        baseRef: 'HEAD',
        notes,
      },
      files,
      patch,
    };
  } finally {
    await fs.remove(scratch);
  }
}

interface BranchTargetOptions {
  git: Git;
  repositoryRoot: string;
  baseRef: string;
}

/** Branch target: `merge-base(base, HEAD)` compared with committed `HEAD`. */
export async function resolveBranchTarget(options: BranchTargetOptions): Promise<TargetResolution> {
  const { git, repositoryRoot, baseRef } = options;
  await requireHead(git);

  if (baseRef.trim() === '') {
    throw new AmbicodeError(
      'baseline-missing',
      'Branch review needs a baseline, and none is configured.',
      {
        field: 'baseline',
        details: [
          'Pass --base <ref>, or set `baseline` in .ambicode/config.yaml.',
          'AMBICODE does not assume a default branch name.',
        ],
      },
    );
  }

  const baseCommit = await git.revParse(baseRef);
  if (baseCommit === null) {
    throw new AmbicodeError('baseline-unresolvable', `The baseline "${baseRef}" does not resolve to a commit.`, {
      field: 'baseline',
      details: ['AMBICODE will not substitute HEAD~1 for a missing baseline.'],
    });
  }

  const headSha = await git.revParse('HEAD');
  if (headSha === null) throw new AmbicodeError('no-head', 'HEAD does not resolve to a commit.');

  const mergeBase = await git.mergeBase(baseCommit, headSha);
  if (mergeBase === null) {
    throw new AmbicodeError(
      'no-merge-base',
      `"${baseRef}" and HEAD have no common ancestor, so there is no branch diff to review.`,
      { field: 'baseline' },
    );
  }

  const changes = await git.rawDiff([mergeBase, headSha]);
  const patch = await git.patchDiff([mergeBase, headSha], 3);
  const files = combineDiff(changes, patch);

  const notes = [`Compared merge-base(${baseRef}, HEAD) = ${mergeBase.slice(0, 12)} with committed HEAD.`];
  if (await git.isDirty()) {
    notes.push('Uncommitted working-tree changes exist and were excluded from this review.');
  }

  notes.push('The reviewer reads the checkout, which holds the branch head only if it is checked out.');

  return {
    target: {
      kind: 'branch',
      repositoryRoot,
      snapshotId: headSha,
      headSha,
      baseSha: mergeBase,
      baseRef,
      notes,
    },
    files,
    patch,
  };
}

interface CapturedTargetOptions { workspace: Workspace; task: string | null; url: string }

/** Paths and kind of one patch section, from its `---`/`+++` headers: the `diff --git` line is ambiguous for paths with spaces. */
function changeOf(section: string): RawChange {
  const header = (marker: string): string | null => {
    const value = section.split('\n').find((line) => line.startsWith(marker))?.slice(4).split('\t')[0] ?? '/dev/null';
    return value === '/dev/null' ? null : value.replace(/^[ab]\//, '');
  };
  const [oldPath, newPath] = [header('--- '), header('+++ ')];
  const changeKind = oldPath === null ? 'added' : newPath === null ? 'deleted' : oldPath === newPath ? 'modified' : 'renamed';
  return { oldPath, newPath, changeKind, oldMode: '100644', newMode: '100644' };
}

/**
 * Merge-request target from the diff the hook captured off the model's GitLab MCP call. The review is diff-only:
 * the merge request's files are not in the checkout.
 */
export async function resolveCapturedTarget(options: CapturedTargetOptions): Promise<TargetResolution> {
  const { workspace, task, url } = options;
  const { runtime, git, repositoryRoot } = workspace;
  const missing = (): AmbicodeError => new AmbicodeError('mr-diff-missing', `No merge-request diff is captured for ${url}.`, {
    details: ['Call the diff tool of your GitLab MCP server for this merge request, then run `route next`; the capture hook records its response.'],
  });
  if (task === null) throw missing();
  const dir = taskDirFor(repositoryRoot, task, '.', 'review').root;
  const patch = await runtime.fs.readText(path.join(dir, MR_DIFF_PATCH)).catch(() => null);
  if (patch === null) throw missing();
  const meta = JSON.parse(await runtime.fs.readText(path.join(dir, MR_DIFF_JSON)).catch(() => '{}')) as { sha?: string };
  const sections = splitPatchSections(patch);
  const files = combineDiff(sections.map(changeOf), patch);

  const headSha = meta.sha === undefined ? null : await git.revParse(meta.sha);
  const notes = ['Diff captured from the GitLab MCP server; nothing was fetched or checked out.', 'Diff only: the reviewer has no file content for this merge request.'];
  return {
    target: { kind: 'merge-request', repositoryRoot, snapshotId: `mr-${contentHash(`${url}\n${patch}`).slice(7, 23)}`, headSha, baseSha: null, baseRef: null, notes },
    files,
    patch,
  };
}

async function requireHead(git: Git): Promise<void> {
  if (!(await git.isRepository())) {
    throw new AmbicodeError('not-a-repository', 'This directory is not inside a git work tree.');
  }
  if (!(await git.hasHead())) {
    throw new AmbicodeError(
      'no-head',
      'This repository has no commits yet, which AMBICODE does not support.',
      { details: ['Make the first commit, then run the review again.'] },
    );
  }
}

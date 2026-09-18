import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ReviewTarget } from '../contracts/review.ts';
import { combineDiff, type DiffFile } from '../git/diff.ts';
import { Git } from '../git/git.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';

export interface TargetResolution {
  target: ReviewTarget;
  files: DiffFile[];
  /** Revision whose post-image content should be read: null means the working tree. */
  postImageRevision: string | null;
  preImageRevision: string;
}

export interface WorkingTargetOptions {
  git: Git;
  repositoryRoot: string;
}

/**
 * Working target: `HEAD` compared with the effective working-tree contents.
 *
 * `git diff HEAD` already yields the net of staged and unstaged edits, so a
 * staged change that the working file undoes is correctly absent. Untracked
 * files are brought in through intent-to-add entries written to a throwaway
 * index copy, which leaves `.git/index` byte-identical (doc 02).
 */
export async function resolveWorkingTarget(options: WorkingTargetOptions): Promise<TargetResolution> {
  const { git, repositoryRoot } = options;
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

  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-index-'));
  const notes: string[] = [];
  try {
    const shadowIndex = path.join(scratch, 'index');
    const realIndex = path.join(await git.gitCommonDir(), 'index');
    try {
      await copyFile(realIndex, shadowIndex);
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
        repositoryRoot,
        snapshotId: `working-${contentHash(`${headSha}\n${patch}`).slice(7, 23)}`,
        headSha,
        baseSha: headSha,
        baseRef: 'HEAD',
        remote: null,
        notes,
      },
      files,
      postImageRevision: null,
      preImageRevision: headSha,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export interface BranchTargetOptions {
  git: Git;
  repositoryRoot: string;
  /** Explicit `--base`, or the configured baseline; an empty baseline is not a guess. */
  baseRef: string;
}

/** Branch target: `merge-base(base, HEAD)` compared with committed `HEAD` (doc 02). */
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
    // Stated rather than silently applied (doc 02).
    notes.push('Uncommitted working-tree changes exist and were excluded from this review.');
  }

  return {
    target: {
      kind: 'branch',
      repositoryRoot,
      snapshotId: headSha,
      headSha,
      baseSha: mergeBase,
      baseRef,
      remote: null,
      notes,
    },
    files,
    postImageRevision: headSha,
    preImageRevision: mergeBase,
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

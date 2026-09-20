import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import type { ReviewTarget } from '../contracts/review.ts';
import { combineDiff, type DiffFile } from '../git/diff.ts';
import { Git } from '../git/git.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';
import { captureWorkingTree, revisionContent, type ContentSource } from './content.ts';

export interface TargetResolution {
  target: ReviewTarget;
  files: DiffFile[];
  /** The patch the review is about, pinned together with `content`. */
  patch: string;
  /** The only place downstream code reads reviewed file bytes from. */
  content: ContentSource;
  preImageRevision: string;
}

export interface WorkingTargetOptions {
  fs: FileSystem;
  git: Git;
  repositoryRoot: string;
}

/**
 * Working target: `HEAD` against the effective working tree. `git diff HEAD`
 * nets staged and unstaged edits; untracked files arrive as intent-to-add
 * entries in a throwaway index copy, leaving `.git/index` untouched (doc 02).
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
    const realIndex = path.join(await git.gitCommonDir(), 'index');
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

    // The only content that can change while the review runs, so it is read
    // once here and never again (doc 02).
    const content = await captureWorkingTree({
      fs,
      repositoryRoot,
      changedPaths: files
        .map((file) => file.newPath)
        .filter((value): value is string => value !== null),
      includeSiblings: true,
    });

    // A build or editor can write during the read. If the diff moved, capture
    // and patch may describe different bytes, so stop instead of publishing.
    const patchAfterCapture = await shadow.patchDiff(['HEAD'], 3);
    if (patchAfterCapture !== patch) {
      throw new AmbicodeError(
        'working-tree-changed',
        'The working tree changed while the review target was being captured, so the snapshot would not describe a single state of the code.',
        {
          details: [
            'Nothing was reviewed and nothing was modified.',
            'Let the build or editor finish writing, then run the review again.',
          ],
        },
      );
    }

    notes.push(content.pinning);

    return {
      target: {
        kind: 'working',
        // Covers the captured bytes too, so an id cannot name unseen content.
        snapshotId: `working-${contentHash(`${headSha}\n${patch}\n${content.digest}`).slice(7, 23)}`,
        repositoryRoot,
        headSha,
        baseSha: headSha,
        baseRef: 'HEAD',
        remote: null,
        notes,
      },
      files,
      patch,
      content,
      preImageRevision: headSha,
    };
  } finally {
    await fs.remove(scratch);
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

  const content = revisionContent(git, headSha);
  notes.push(content.pinning);

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
    patch,
    content,
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

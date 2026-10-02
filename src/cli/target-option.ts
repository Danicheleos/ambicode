import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import type { EvidenceSource } from '../requirements/normalize.ts';
import type { TargetSelection } from '../review/bundle.ts';
import { AmbicodeError } from '../util/errors.ts';
import type { ParsedArgs } from './args.ts';

/**
 * Shared by `review` and `bundle`. `validateTargetArgs` must stay pure: `main`
 * calls it before a runtime exists, so an invalid combination exits before any
 * filesystem, git or provider access.
 */
export const TARGET_OPTIONS = {
  values: ['base', 'mr', 'evidence', 'task'],
  repeated: ['requirement', 'approve', 'decline', 'exclude', 'only', 'context'],
  flags: ['json', 'branch', 'with-tests'],
} as const;

export interface ResolvedTargetOptions {
  target: TargetSelection;
  requirementUrls: string[];
  evidence: EvidenceSource | null;
  approvals: Set<string>;
  /** `--decline <key>`: without it, a check the human does not want run would leave the review waiting forever. */
  declines: Set<string>;
  /** `--task <slug>`: for a run with no requirement, so its plan, investigation and reviews share one directory. */
  task: string | null;
  /**
   * `--exclude <glob>`: added to `review.excludePaths`. The per-file snapshot
   * ceiling is not configurable, so this is the only way past one oversized file.
   */
  excludePaths: string[];
  /** `--only <glob>`: for a dirty working tree that holds edits unrelated to the task. */
  onlyPaths: string[];
  /** `--context <path>`: unchanged files the caller found relying on the change; a local target only. */
  contextPaths: string[];
  /** `--with-tests`: merge-request review leaves test code out by default, since no check can run it there. */
  withTests: boolean;
}

export function validateTargetArgs(command: string, args: ParsedArgs): TargetSelection {
  const branch = args.flag('branch');
  const mr = args.value('mr');
  const base = args.value('base');

  if (branch && mr !== null) {
    throw new AmbicodeError(
      'conflicting-target',
      `"${command}" reviews one target: pass --branch or --mr, not both.`,
      {
        field: '--mr',
        details: [
          '--branch reviews the local branch against its baseline.',
          '--mr <url> reviews a merge request on its GitLab host, without touching your checkout.',
          'With neither, the target is your uncommitted work.',
        ],
      },
    );
  }

  if (base !== null && !branch) {
    throw new AmbicodeError('baseline-not-applicable', '--base applies only to branch review.', {
      field: '--base',
      details: [
        'Add --branch to compare the local branch against that baseline.',
        mr === null
          ? 'Working-tree review compares against HEAD, which has no baseline to choose.'
          : 'A merge request carries its own base, start and head SHAs; AMBICODE pins those and will not substitute a local ref.',
      ],
    });
  }

  if (mr !== null && mr.trim() === '') {
    throw new AmbicodeError('bad-argument', '--mr needs a merge request URL.', { field: '--mr' });
  }

  if (mr !== null && args.all('context').length > 0) {
    throw new AmbicodeError('bad-argument', '--context names files in your checkout, and a merge request is not your checkout.', {
      field: '--context',
      details: ['Review the branch locally with --branch to use --context.'],
    });
  }

  if (mr !== null) return { kind: 'merge-request', url: mr };
  if (branch) return { kind: 'branch', baseRef: base };
  return { kind: 'working' };
}

export function resolveTargetOptions(
  command: string,
  runtime: Runtime,
  args: ParsedArgs,
): ResolvedTargetOptions {
  return {
    target: validateTargetArgs(command, args),
    requirementUrls: args.all('requirement'),
    evidence: evidenceSource(runtime, args.value('evidence')),
    approvals: new Set(args.all('approve')),
    declines: new Set(args.all('decline')),
    task: args.value('task'),
    excludePaths: args.all('exclude'),
    onlyPaths: args.all('only'),
    contextPaths: args.all('context'),
    withTests: args.flag('with-tests'),
  };
}

/** `-` is standard input, so a skill can pipe the same evidence to `prepare` and `review` without a temp file. */
export function evidenceSource(runtime: Runtime, value: string | null): EvidenceSource | null {
  if (value === null) return null;
  if (value === '-') return { kind: 'stdin' };
  return { kind: 'file', path: path.isAbsolute(value) ? value : path.resolve(runtime.cwd, value) };
}

import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import type { EvidenceSource } from '../requirements/normalize.ts';
import type { TargetSelection } from '../review/bundle.ts';
import { AmbicodeError } from '../util/errors.ts';
import type { ParsedArgs } from './args.ts';

/**
 * The target options `review` and `bundle` share, so the two commands cannot
 * disagree about what `--branch`, `--base` and `--mr` mean.
 *
 * `validateTargetArgs` decides every rule from the parsed arguments alone: no
 * filesystem, no git, no provider, no process. `main` calls it immediately
 * after parsing and before a runtime exists, so an invalid combination exits
 * before any of those (doc 02, "CLI execution contract").
 */
export const TARGET_OPTIONS = {
  values: ['base', 'mr', 'evidence', 'task'],
  repeated: ['requirement', 'approve', 'decline'],
  flags: ['json', 'branch'],
} as const;

export interface ResolvedTargetOptions {
  target: TargetSelection;
  requirementUrls: string[];
  evidence: EvidenceSource | null;
  approvals: Set<string>;
  /**
   * `--decline <key>`: the other answer. `--approve` alone gives a human one
   * way to end the question, and a check they do not want run would leave the
   * review waiting forever.
   */
  declines: Set<string>;
  /**
   * `--task <slug>`: the task directory this run belongs to. A run carrying a
   * requirement needs no slug — the ticket is one. This is for the rest: a
   * plain request the authoring skill has already named, so its plan, its
   * investigation and its reviews land in one directory instead of three.
   */
  task: string | null;
}

/** Pure: the target the arguments name, or the reason they name none. */
export function validateTargetArgs(command: string, args: ParsedArgs): TargetSelection {
  const branch = args.flag('branch');
  const mr = args.value('mr');
  const base = args.value('base');

  // Three targets, one at a time. Two of them together is not a preference to
  // resolve: it is two different reviews.
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

  if (mr !== null) return { kind: 'merge-request', url: mr };
  if (branch) return { kind: 'branch', baseRef: base };
  return { kind: 'working' };
}

/** The same decision plus the values that need the runtime's working directory. */
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
  };
}

/**
 * Shared with `prepare`, so the two commands resolve `--evidence` identically.
 * `-` is standard input (R2 change 4): a skill that hands the same evidence to
 * `prepare` and then to `review` pipes it twice rather than writing a file it
 * must then keep alive and delete in exactly one place.
 */
export function evidenceSource(runtime: Runtime, value: string | null): EvidenceSource | null {
  if (value === null) return null;
  if (value === '-') return { kind: 'stdin' };
  return { kind: 'file', path: path.isAbsolute(value) ? value : path.resolve(runtime.cwd, value) };
}

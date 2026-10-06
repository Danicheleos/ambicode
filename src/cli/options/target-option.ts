import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';
import type { EvidenceSource } from '#types/modules/requirements';
import type { TargetSelection } from '#types/modules/review';
import type { ParsedArgs } from '../types/cli.ts';
import type { ResolvedTargetOptions } from '../types/options.ts';

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

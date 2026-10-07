import { AmbicodeError } from '#util/errors';
import type { ParsedArgs } from '#types/cli';
import type { ReviewTargetArgs } from '#types/harness';
import type { TargetSelection } from '#types/modules/review';

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

/** The review target of a start, refused as `review` refuses it; absent for uncommitted work (08-R2). */
export function startTarget(skill: string, args: ParsedArgs): ReviewTargetArgs | undefined {
  if (skill !== 'review') {
    const field = args.value('mr') !== null ? '--mr' : args.value('base') !== null ? '--base' : args.flag('branch') ? '--branch' : null;
    if (field !== null) throw new AmbicodeError('bad-argument', `${field} names a review target; route ${skill} takes none.`, { field });
  }
  const selection = validateTargetArgs('route start', args);
  if (selection.kind === 'working') return undefined;
  return selection.kind === 'branch' ? { branch: true, base: selection.baseRef, mr: null } : { branch: false, base: null, mr: selection.url };
}

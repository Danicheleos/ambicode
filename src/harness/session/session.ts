import { AmbicodeError } from '#util/errors';
import { readEntries } from '../engine/context.ts';
import { liveHeads } from '../engine/fold.ts';
import type { Runtime } from '#types/composition';
import type { SessionBinding } from '#types/harness';

interface SessionSource { resolve(runtime: Runtime): Promise<SessionBinding> }

/** The owner is the session of the task's one live route chain; none or several are not guessed. */
export function taskSessionSource(task: string): SessionSource {
  return {
    async resolve(runtime) {
      const heads = liveHeads(await readEntries(runtime, task));
      if (heads.length === 0) return { state: 'unbound', reason: 'missing' };
      const owner = heads.length === 1 ? heads[0]!['session'] : null;
      return typeof owner === 'string' && owner !== '' ? { state: 'bound', session: owner, via: 'task' } : { state: 'unbound', reason: 'ambiguous' };
    },
  };
}

export function hookBinding(session: string): SessionBinding {
  return { state: 'bound', session, via: 'hook' };
}

export function sessionUnbound(binding: Extract<SessionBinding, { state: 'unbound' }>, task?: string): AmbicodeError {
  if (task === undefined) {
    return new AmbicodeError('session-unbound', 'This call names no task, so the CLI cannot tell which route it speaks for.', { details: ['Pass --task <slug> of a task with exactly one live route.'] });
  }
  if (binding.reason === 'missing') {
    return new AmbicodeError('route-not-open', `Task ${task} has no live route.`, { details: [`Start one: route start <skill> --task ${task}`] });
  }
  return new AmbicodeError('route-ambiguous', `Task ${task} has more than one live route, so the CLI cannot tell which one this call speaks for.`, {
    details: [`End the others with route start <skill> --task ${task} --fresh, or continue under another task: --task ${task}-2.`],
  });
}

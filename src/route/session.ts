import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import { contentHash } from '../util/hash.ts';
import { AmbicodeError } from '../util/errors.ts';
import { readEntries } from './context.ts';
import { liveHeads } from './fold.ts';

export type SessionBinding =
  | { state: 'bound'; session: string; via: 'hook' | 'env' | 'updated-input' | 'association' | 'task' }
  | { state: 'unbound'; reason: 'missing' | 'stale' | 'ambiguous' };

export interface SessionSource { resolve(runtime: Runtime): Promise<SessionBinding> }

/** Proves a start came from the evaluation harness: the run, the session and the intended start must all match (P58). */
export interface HarnessTokenPort { validate(runtime: Runtime, session: string, intendedStart: string): Promise<boolean> }

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

/** Without a platform proof of the token transport, nothing is harness-trusted. */
export const rejectingHarnessPort: HarnessTokenPort = { validate: async () => false };
export const cliHarnessPort: HarnessTokenPort = rejectingHarnessPort;

export function hookBinding(session: string): SessionBinding {
  return { state: 'bound', session, via: 'hook' };
}

/** Outcome "environment binding": the variable P-S recorded names the session; absent or empty is missing. */
export function environmentSessionSource(variable: string): SessionSource {
  return {
    async resolve(runtime) {
      const value = runtime.env[variable];
      return value === undefined || value.trim() === '' ? { state: 'unbound', reason: 'missing' } : { state: 'bound', session: value.trim(), via: 'env' };
    },
  };
}

/** Outcome "PreToolUse updatedInput": the guard added `--session`; it carries identity, never trust. */
export function updatedInputSessionSource(value: string | null): SessionSource {
  return { resolve: async () => (value === null || value === '' ? { state: 'unbound', reason: 'missing' } : { state: 'bound', session: value, via: 'updated-input' }) };
}

export const associationDirectory = (runtime: Runtime, repositoryRoot: string): string =>
  path.join(runtime.fs.temporaryRoot(), 'ambicode-hook-state', 'assoc', contentHash(repositoryRoot).replace(/[^a-z0-9]/gi, '').slice(0, 40));

/** Every hook event writes one file per session; the CLI binds only when exactly one exists for its repository. */
export function associationSessionSource(repositoryRoot: string): SessionSource {
  return {
    async resolve(runtime) {
      const directory = associationDirectory(runtime, repositoryRoot);
      const names = (await runtime.fs.readdir(directory).catch(() => [])).filter((entry) => entry.isFile()).map((entry) => entry.name);
      if (names.length === 0) return { state: 'unbound', reason: 'missing' };
      return names.length === 1 ? { state: 'bound', session: names[0]!, via: 'association' } : { state: 'unbound', reason: 'ambiguous' };
    },
  };
}

export async function writeAssociation(runtime: Runtime, repositoryRoot: string, session: string): Promise<void> {
  const directory = associationDirectory(runtime, repositoryRoot);
  await runtime.fs.mkdirp(directory);
  await runtime.fs.writeText(path.join(directory, session.replace(/[^A-Za-z0-9_-]/g, '_')), runtime.clock.now().toISOString());
}

export async function removeAssociation(runtime: Runtime, repositoryRoot: string, session: string): Promise<void> {
  await runtime.fs.remove(path.join(associationDirectory(runtime, repositoryRoot), session.replace(/[^A-Za-z0-9_-]/g, '_')));
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

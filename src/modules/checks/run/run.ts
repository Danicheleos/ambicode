import path from 'node:path';
import { MAX_COMMAND_OUTPUT_BYTES } from '#types/defaults';
import { normalizeRelative } from '#util/paths';
import { authorizeCommand } from '../selection/authorize.ts';
import { expandFiles } from '../selection/select.ts';
import type { CommandSpec, ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { CheckStatus } from '#types/primitives';
import type { Clock, ProcessRunner } from '#types/platform/ports';

interface RunOneOptions {
  runner: ProcessRunner;
  clock: Clock;
  repositoryRoot: string;
  project: ProjectConfig;
  policy: ResolvedPolicy;
  commandId: string;
  /** `<projectId>/<checkId>`: the key the caller's consent was recorded under. */
  key: string;
  command: CommandSpec | null | undefined;
  /** Project-relative files for the command's `{files}`. */
  files: readonly string[];
  timeoutSeconds: number;
}

export interface CheckRun {
  status: CheckStatus;
  argv: string[];
  exitCode: number | null;
  /** Standard output then standard error; empty unless the command started. */
  output: string;
  ms: number;
  /** Why the command did not run, or null. */
  detail: string | null;
}

const notRun = (status: CheckStatus, detail: string, argv: string[] = []): CheckRun => ({ status, argv, exitCode: null, output: '', ms: 0, detail });

/** Authorizes again at the spawn, so no caller reaches a process without a decision; the caller's consent arrives as `key`. */
export async function runOne(options: RunOneOptions): Promise<CheckRun> {
  const { command } = options;
  const authorization = authorizeCommand({ policy: options.policy, commandId: options.commandId, approvalKey: options.key, approvals: new Set([options.key]) });
  if (authorization.kind !== 'allowed') return notRun('skipped', authorization.kind === 'refused' ? authorization.reason : 'this run needs authorization');
  if (command === undefined) return notRun('skipped', `The check references command "${options.commandId}", which the project does not declare.`);
  if (command === null) return notRun('skipped', `Command "${options.commandId}" is configured as null, so this check has nothing to run. Set its argv to enable it.`);

  const argv = expandFiles(command.argv, options.files);
  const started = options.clock.elapsed();
  const outcome = await options.runner.run({
    argv,
    cwd: path.join(options.repositoryRoot, normalizeRelative(options.project.root), command.cwd ?? ''),
    timeoutMs: (command.timeoutSeconds ?? options.timeoutSeconds) * 1000,
    maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
    env: { kind: 'inherited' },
  });
  const ms = Math.round(options.clock.elapsed() - started);

  if (outcome.kind === 'spawn-failed') {
    const missingBinary = /ENOENT/.test(outcome.failure ?? '');
    return {
      ...notRun(missingBinary ? 'skipped' : 'error', missingBinary ? `The configured executable "${argv[0] ?? ''}" was not found, so this check did not run.` : `The check could not be started: ${outcome.failure ?? 'unknown failure'}.`, argv),
      ms,
    };
  }
  return {
    status: outcome.kind === 'timed-out' ? 'timed-out' : outcome.exitCode === 0 ? 'passed' : 'failed',
    argv,
    exitCode: outcome.exitCode,
    output: `--- stdout ---\n${outcome.stdout}\n--- stderr ---\n${outcome.stderr}\n`,
    ms,
    detail: null,
  };
}

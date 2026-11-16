import path from 'node:path';
import { normalizeRelative } from '#util/paths';
import type { ProjectConfig } from '#types/modules/config';
import type { CheckStatus } from '#types/primitives';
import type { Clock, ProcessRunner } from '#types/platform/ports';

interface RunOneOptions {
  runner: ProcessRunner;
  clock: Clock;
  repositoryRoot: string;
  project: ProjectConfig;
  /** The shell string from config, with `{file}` already substituted. */
  command: string;
  timeoutSeconds: number;
}

interface CheckRun {
  status: CheckStatus;
  exitCode: number | null;
  /** Standard output then standard error; empty unless the command started. */
  output: string;
  ms: number;
  /** Why the command did not run, or null. */
  detail: string | null;
}

/** Config commands are shell strings (`&&`, quoting, `{file}` lists), so they go through the platform shell, not an argv. */
export const shellArgv = (command: string): string[] => (process.platform === 'win32' ? ['cmd', '/d', '/s', '/c', command] : ['sh', '-c', command]);

/** Single quotes on POSIX, double on `cmd`: a file name with a space or `$` stays one argument. */
export const shellQuote = (value: string): string => (process.platform === 'win32' ? `"${value.replaceAll('"', '""')}"` : `'${value.replaceAll("'", "'\\''")}'`);

/** The one spawn of a check; its only caller, `runCheckOnly`, has had `authorizeKey` decide first. */
export async function runOne(options: RunOneOptions): Promise<CheckRun> {
  const started = options.clock.elapsed();
  const outcome = await options.runner.run({
    argv: shellArgv(options.command),
    cwd: path.join(options.repositoryRoot, normalizeRelative(options.project.root)),
    timeoutMs: options.timeoutSeconds * 1000,
    env: { kind: 'inherited' },
  });
  const ms = Math.round(options.clock.elapsed() - started);
  if (outcome.kind === 'spawn-failed') return { status: 'error', exitCode: null, output: '', ms, detail: `The check could not be started: ${outcome.failure ?? 'unknown failure'}.` };
  return {
    status: outcome.kind === 'timed-out' ? 'timed-out' : outcome.exitCode === 0 ? 'passed' : 'failed',
    exitCode: outcome.exitCode,
    output: `--- stdout ---\n${outcome.stdout}\n--- stderr ---\n${outcome.stderr}\n`,
    ms,
    detail: null,
  };
}

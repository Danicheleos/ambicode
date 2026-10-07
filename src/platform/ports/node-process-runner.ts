import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { resolveEnvironment } from './process.ts';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';
import { messageOf } from '#util/errors';

export class NodeProcessRunner implements ProcessRunner {
  private readonly baseEnv: Record<string, string | undefined>;

  constructor(baseEnv: Record<string, string | undefined> = process.env) {
    this.baseEnv = baseEnv;
  }

  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    const [executable, ...args] = request.argv;
    if (executable === undefined) {
      return outcome('spawn-failed', { failure: 'empty argument vector' });
    }

    const environment = resolveEnvironment(request.env, this.baseEnv);

    // Windows cannot tell a missing command from a failed one after spawning (see
    // `windowsCommandExists`). The message mirrors Unix's `spawn <command> ENOENT`.
    if (process.platform === 'win32' && !windowsCommandExists(executable, environment, request.cwd)) {
      return outcome('spawn-failed', { failure: `spawn ${executable} ENOENT` });
    }

    if (request.output === 'detached') return runDetached(executable, args, request.cwd, environment);

    const capture = new CombinedCapture(request.maxOutputBytes);
    const started = performance.now();

    const output = request.output === 'ignore' ? 'ignore' : 'pipe';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        cwd: request.cwd,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: [request.stdin === undefined ? 'ignore' : 'pipe', output, output],
      });
    } catch (error) {
      return outcome('spawn-failed', { failure: messageOf(error) });
    }

    child.stdout?.on('data', (chunk: Buffer) => capture.push('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => capture.push('stderr', chunk));
    if (request.stdin !== undefined) {
      child.stdin?.on('error', () => {});
      child.stdin?.end(request.stdin);
    }

    // A child left running when this process exits would hold the user's terminal or a port.
    const cleanup = (): void => void child.kill('SIGKILL');
    process.once('exit', cleanup);

    // Windows: `taskkill /T` walks the tree, so a `.cmd` shim's child dies with it.
    let killedByDeadline = false;
    const deadline =
      request.timeoutMs > 0
        ? setTimeout(() => {
            killedByDeadline = true;
            if (process.platform === 'win32') killProcessTree(child.pid);
            else child.kill('SIGKILL');
          }, request.timeoutMs)
        : undefined;

    const settled = await new Promise<{ code: number | null; error: Error | null }>((resolve) => {
      child.once('error', (error) => resolve({ code: null, error }));
      child.once('close', (code) => resolve({ code, error: null }));
    });
    if (deadline !== undefined) clearTimeout(deadline);
    process.removeListener('exit', cleanup);

    const base = { ...capture.decode(), durationMs: Math.round(performance.now() - started) };
    if (killedByDeadline) return outcome('timed-out', base);
    // An error event without a close: it never started (missing command, permission error, missing `cwd`).
    if (settled.error !== null) return outcome('spawn-failed', { ...base, failure: messageOf(settled.error) });
    return outcome('exited', { ...base, exitCode: settled.code });
  }
}

/** Outlives this process: no pipes, its own process group, unreferenced, so the caller can exit at once. */
function runDetached(executable: string, args: readonly string[], cwd: string, env: Record<string, string>): Promise<ProcessOutcome> {
  const started = performance.now();
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, { cwd, env, detached: true, stdio: 'ignore', windowsHide: true, shell: false });
    } catch (error) {
      resolve(outcome('spawn-failed', { failure: messageOf(error) }));
      return;
    }
    child.once('spawn', () => {
      child.unref();
      resolve(outcome('detached', { durationMs: Math.round(performance.now() - started) }));
    });
    child.once('error', (error) => resolve(outcome('spawn-failed', { failure: messageOf(error), durationMs: Math.round(performance.now() - started) })));
  });
}

/**
 * Windows only. A plain kill reaches only the spawned process, so a `.cmd` shim's child survives
 * and holds the pipes open. Failures are ignored: it may already have exited.
 */
function killProcessTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    const killer = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
    });
    killer.on('error', () => {});
    killer.unref();
  } catch {
  }
}

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC';

/**
 * Windows only. Spawning an unresolvable command can look like a check that ran and failed, so
 * absence is detected before spawn. Permissive on purpose, and
 * uses `statSync` rather than the port to see the same filesystem `CreateProcess` will.
 */
export function windowsCommandExists(
  command: string,
  environment: Readonly<Record<string, string>>,
  cwd: string,
): boolean {
  for (const candidate of windowsCandidates(command, environment, cwd)) {
    if (isExistingFile(candidate)) return true;
  }
  return false;
}

function* windowsCandidates(
  command: string,
  environment: Readonly<Record<string, string>>,
  cwd: string,
): Generator<string> {
  const lookup = (name: string): string | undefined => {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(environment)) {
      if (key.toLowerCase() === wanted) return value;
    }
    return undefined;
  };

  // Windows uses `;` whatever the host's `path.delimiter`. `||` so an empty `PATHEXT` falls back
  // to the default; the leading '' tries the name verbatim.
  const extensions = ['', ...(lookup('PATHEXT') || DEFAULT_PATHEXT).split(';').filter(Boolean)];

  const directories = /[\\/:]/.test(command)
    ? [cwd]
    : [cwd, ...(lookup('PATH') ?? '').split(';')];

  for (const directory of directories) {
    const unquoted =
      directory.length > 1 && directory.startsWith('"') && directory.endsWith('"')
        ? directory.slice(1, -1)
        : directory;
    // An empty `PATH` entry is skipped rather than read as the current
    // directory: implicitly searching it is the classic planting attack.
    if (unquoted === '') continue;
    let base: string;
    try {
      base = path.resolve(unquoted, command);
    } catch {
      continue;
    }
    for (const extension of extensions) yield base + extension;
  }
}

function isExistingFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch (error) {
    // A Windows App Execution Alias (under `WindowsApps`) is launchable but
    // throws `EACCES` on `stat`; calling it missing would break a real tool.
    return (error as NodeJS.ErrnoException).code === 'EACCES';
  }
}

export class CombinedCapture {
  private readonly limit: number;
  private readonly chunks: { stream: 'stdout' | 'stderr'; bytes: Buffer }[] = [];
  private retained = 0;
  private truncated = false;

  constructor(limit: number) {
    this.limit = Math.max(0, limit);
  }

  push(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const room = this.limit - this.retained;
    if (chunk.length === 0) return;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > room) {
      this.chunks.push({ stream, bytes: chunk.subarray(0, room) });
      this.retained += room;
      this.truncated = true;
      return;
    }
    this.chunks.push({ stream, bytes: chunk });
    this.retained += chunk.length;
  }

  decode(): { stdout: string; stderr: string; truncated: boolean } {
    const join = (stream: 'stdout' | 'stderr'): string => {
      const bytes = Buffer.concat(
        this.chunks.filter((entry) => entry.stream === stream).map((entry) => entry.bytes),
      );
      return decodeCompleteUtf8(bytes);
    };
    return { stdout: join('stdout'), stderr: join('stderr'), truncated: this.truncated };
  }
}

export function decodeCompleteUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, completeLength(bytes)));
}

function completeLength(bytes: Buffer): number {
  for (let back = 1; back <= 3 && back <= bytes.length; back += 1) {
    const byte = bytes[bytes.length - back] as number;
    if ((byte & 0b1100_0000) === 0b1000_0000) continue;
    const width = byte >= 0b1111_0000 ? 4 : byte >= 0b1110_0000 ? 3 : byte >= 0b1100_0000 ? 2 : 1;
    return width > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}

function outcome(kind: ProcessOutcome['kind'], partial: Partial<ProcessOutcome>): ProcessOutcome {
  return {
    kind,
    exitCode: partial.exitCode ?? null,
    stdout: partial.stdout ?? '',
    stderr: partial.stderr ?? '',
    truncated: partial.truncated ?? false,
    durationMs: partial.durationMs ?? 0,
    failure: partial.failure ?? null,
  };
}

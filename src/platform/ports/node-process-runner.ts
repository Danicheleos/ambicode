import { spawn } from 'node:child_process';
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

    const limit = Math.max(0, request.maxOutputBytes);
    const kept: Record<'stdout' | 'stderr', Buffer[]> = { stdout: [], stderr: [] };
    let retained = 0;
    let truncated = false;
    // One combined ceiling over both streams; whole buffers are decoded after the run, so a character split across chunks survives.
    const capture = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      const room = limit - retained;
      if (chunk.length > room) truncated = true;
      if (room <= 0 || chunk.length === 0) return;
      const bytes = chunk.subarray(0, room);
      kept[stream].push(bytes);
      retained += bytes.length;
    };
    const started = performance.now();

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        cwd: request.cwd,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: [request.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      return outcome('spawn-failed', { failure: messageOf(error) });
    }

    child.stdout?.on('data', (chunk: Buffer) => capture('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => capture('stderr', chunk));
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

    const base = { stdout: Buffer.concat(kept.stdout).toString('utf8'), stderr: Buffer.concat(kept.stderr).toString('utf8'), truncated, durationMs: Math.round(performance.now() - started) };
    if (killedByDeadline) return outcome('timed-out', base);
    // An error event without a close: it never started (missing command, permission error, missing `cwd`).
    if (settled.error !== null) return outcome('spawn-failed', { ...base, failure: messageOf(settled.error) });
    return outcome('exited', { ...base, exitCode: settled.code });
  }
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

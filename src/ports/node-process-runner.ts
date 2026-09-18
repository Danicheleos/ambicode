import { spawn } from 'node:child_process';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from './process.ts';

/**
 * Executes an argument vector directly. There is no shell: a configured command
 * is an executable plus arguments, so command substitution and redirection in a
 * configuration value cannot be interpreted (doc 05).
 */
export class NodeProcessRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    const [executable, ...args] = request.argv;
    if (executable === undefined) {
      return outcome('spawn-failed', { failure: 'empty argument vector' });
    }
    const started = performance.now();

    return await new Promise<ProcessOutcome>((resolve) => {
      const child = spawn(executable, args, {
        cwd: request.cwd,
        env: request.env ?? process.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;
      let settled = false;

      const append = (target: 'out' | 'err', chunk: Buffer) => {
        const current = target === 'out' ? stdout : stderr;
        const room = request.maxOutputBytes - current.length;
        if (room <= 0) {
          truncated = true;
          return;
        }
        const text = chunk.toString('utf8');
        const slice = text.length > room ? (truncated = true, text.slice(0, room)) : text;
        if (target === 'out') stdout += slice;
        else stderr += slice;
      };

      child.stdout.on('data', (chunk: Buffer) => append('out', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('err', chunk));

      const settle = (result: ProcessOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        settle(
          outcome('timed-out', {
            stdout,
            stderr,
            truncated,
            durationMs: Math.round(performance.now() - started),
          }),
        );
      }, request.timeoutMs);

      child.on('error', (error: Error) => {
        settle(
          outcome('spawn-failed', {
            failure: error.message,
            stdout,
            stderr,
            truncated,
            durationMs: Math.round(performance.now() - started),
          }),
        );
      });

      child.on('close', (code: number | null) => {
        settle(
          outcome('exited', {
            exitCode: code,
            stdout,
            stderr,
            truncated,
            durationMs: Math.round(performance.now() - started),
          }),
        );
      });

      if (request.stdin !== undefined) child.stdin.end(request.stdin);
      else child.stdin.end();
    });
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

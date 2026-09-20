import { execa, type Options, type ResultPromise } from 'execa';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from './process.ts';

/**
 * Executes an argument vector through Execa (doc 11). There is no shell: a
 * configured command is an executable plus arguments, so command substitution
 * and redirection in a configuration value cannot be interpreted (doc 05).
 */
export class NodeProcessRunner implements ProcessRunner {
  private readonly baseEnv: Record<string, string | undefined>;

  /** The composition root reads the host environment once and supplies it here. */
  constructor(baseEnv: Record<string, string | undefined> = process.env) {
    this.baseEnv = baseEnv;
  }

  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    const [executable, ...args] = request.argv;
    if (executable === undefined) {
      return outcome('spawn-failed', { failure: 'empty argument vector' });
    }

    const capture = new CombinedCapture(request.maxOutputBytes);
    const started = performance.now();

    const options: Options = {
      cwd: request.cwd,
      // Narrow overrides on top of the injected base, never a cloned process.env.
      env: { ...this.baseEnv, ...request.env } as Record<string, string>,
      extendEnv: false,
      shell: false,
      timeout: request.timeoutMs,
      // Kills the whole group where the platform supports it, so a timeout does
      // not leave a known descendant running (doc 02).
      forceKillAfterDelay: 2_000,
      killSignal: 'SIGKILL',
      cleanup: true,
      encoding: 'buffer',
      buffer: false,
      stdin: request.stdin === undefined ? 'ignore' : 'pipe',
      reject: false,
    };

    let child: ResultPromise<Options>;
    try {
      child = execa(executable, args, options);
    } catch (error) {
      return outcome('spawn-failed', { failure: messageOf(error) });
    }

    child.stdout?.on('data', (chunk: Buffer) => capture.push('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => capture.push('stderr', chunk));
    if (request.stdin !== undefined) child.stdin?.end(request.stdin);

    const result = await child;
    const durationMs = Math.round(performance.now() - started);
    const decoded = capture.decode();

    const base = { ...decoded, durationMs };
    if (result.timedOut === true) return outcome('timed-out', base);
    // Execa reports a missing executable, a permission error and a bad cwd
    // through `code`; a process that ran and failed has an exit code instead.
    if (result.failed === true && result.exitCode === undefined && result.signal === undefined) {
      return outcome('spawn-failed', { ...base, failure: result.shortMessage ?? messageOf(result) });
    }
    return outcome('exited', { ...base, exitCode: result.exitCode ?? null });
  }
}

/**
 * One retained-byte ceiling across both streams (doc 02, v1). Chunks are kept
 * in arrival order per stream and cut on a byte boundary; decoding happens once
 * at the end so a multibyte character split across two chunks survives, and a
 * character split by the ceiling is dropped rather than turned into U+FFFD.
 */
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

/**
 * Decodes only whole UTF-8 sequences. A trailing partial sequence — the one
 * truncation can produce — is discarded, so the retained prefix is always valid
 * text and never reports a replacement character the program did not emit.
 */
export function decodeCompleteUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, completeLength(bytes)));
}

function completeLength(bytes: Buffer): number {
  // At most three bytes of a four-byte sequence can be pending.
  for (let back = 1; back <= 3 && back <= bytes.length; back += 1) {
    const byte = bytes[bytes.length - back] as number;
    if ((byte & 0b1100_0000) === 0b1000_0000) continue; // continuation byte
    const width = byte >= 0b1111_0000 ? 4 : byte >= 0b1110_0000 ? 3 : byte >= 0b1100_0000 ? 2 : 1;
    return width > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

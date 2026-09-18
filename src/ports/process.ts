/**
 * The single seam through which every external executable is invoked. Nothing
 * in the codebase spawns a process directly, so unit tests can assert that a
 * forbidden command never reaches a runner (doc 07, U14).
 */
export interface ProcessRequest {
  argv: readonly string[];
  cwd: string;
  timeoutMs: number;
  /** Bytes of stdout/stderr retained; the rest is dropped with a limitation note. */
  maxOutputBytes: number;
  env?: Record<string, string>;
  stdin?: string;
}

export interface ProcessOutcome {
  /** `exited` covers any exit code; the caller decides what a code means. */
  kind: 'exited' | 'timed-out' | 'spawn-failed';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
  /** Populated for `spawn-failed`, e.g. a missing binary. */
  failure: string | null;
}

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessOutcome>;
}

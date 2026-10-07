import type { ReviewerOutput, ReviewerUsage } from '../modules/review.ts';

export interface Clock {
  now(): Date;
  elapsed(): number;
}

export interface FileStats {
  readonly size: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface DirectoryEntry {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface FileSystem {
  readText(absolutePath: string): Promise<string>;
  readBytes(absolutePath: string): Promise<Uint8Array>;
  writeText(absolutePath: string, contents: string): Promise<void>;
  /** Atomic (`O_EXCL`): of two processes racing for the per-review publication lease, only one wins. */
  createExclusive(absolutePath: string, contents: string): Promise<boolean>;
  /** One `O_APPEND` write, so lines under the pipe buffer size from two processes do not interleave. */
  appendText(absolutePath: string, contents: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdirp(absolutePath: string): Promise<void>;
  temporaryDirectory(prefix: string): Promise<string>;
  temporaryRoot(): string;
  remove(absolutePath: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  stat(absolutePath: string): Promise<FileStats>;
  lstat(absolutePath: string): Promise<FileStats>;
  readdir(absolutePath: string): Promise<DirectoryEntry[]>;
  exists(absolutePath: string): Promise<boolean>;
  /** A regular file the current user may execute; on Windows any regular file. */
  isExecutable(absolutePath: string): Promise<boolean>;
  realpath(absolutePath: string): Promise<string>;
  /** Matches relative to `cwd` and yields `/`-separated relative paths. */
  glob(pattern: string, cwd: string): Promise<string[]>;
  setTimes(absolutePath: string, time: Date): Promise<void>;
}

export interface IdSource {
  reviewId(): string;
  /** Names the holder of a route; recorded in the ledger, never a grant of consent. */
  ownerId(): string;
  /** URL-safe capability with at least 128 bits of entropy. */
  capability(): string;
  csrfToken(): string;
  /** 8 lowercase hex characters naming a writer that has no session. */
  writerId(): string;
}

/**
 * Every request states one explicitly, so a new caller cannot acquire the operator's whole
 * environment, and every token in it, by saying nothing.
 */
export type EnvironmentPolicy =
  | { kind: 'inherited'; overrides?: Readonly<Record<string, string>> }
  | {
      kind: 'replacement';
      allow: readonly string[];
      set?: Readonly<Record<string, string>>;
    };

export const COMMAND_TYPES = ['ambicode', 'check', 'format', 'baseline', 'reviewer', 'worker', 'index'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export interface ProcessRequest {
  argv: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  env: EnvironmentPolicy;
  stdin?: string;
  /**
   * `ignore` gives the child no pipes, for launchers like `cmd /c start <url>`: the browser inherits
   * piped handles and the run would last as long as the browser does. `detached` starts the child in its own
   * process group and resolves once it has spawned, without waiting for it. Default `capture`.
   */
  output?: 'capture' | 'ignore' | 'detached';
  /** Names the run for the command log; an untagged run is not logged. */
  purpose?: CommandType;
}

export interface ProcessOutcome {
  kind: 'exited' | 'timed-out' | 'spawn-failed' | 'detached';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
  failure: string | null;
}

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessOutcome>;
}

export interface ReviewerRequest {
  systemPrompt: string;
  prompt: string;
  /** Sanitized snapshot directory; the reviewer's only working directory. */
  workingDirectory: string;
  model: string;
  timeoutMs: number;
}

/** An ok `detail` is set only by a non-process reviewer, e.g. to say where a replayed answer came from. */
export type ReviewerInvocation =
  | {
      kind: 'ok';
      output: ReviewerOutput;
      rawLength: number;
      argv: readonly string[];
      usage?: ReviewerUsage;
      detail?: string;
    }
  | { kind: 'error'; reason: string; detail: string; argv: readonly string[]; usage?: ReviewerUsage };

export interface Reviewer {
  readonly source?: 'replay';
  assertIsolationAvailable?(): Promise<void>;
  invoke(request: ReviewerRequest): Promise<ReviewerInvocation>;
}

export interface StandardInput {
  /**
   * `null`, never a truncated string, when the stream exceeds `maxBytes`: the hook must stay a
   * silent no-op on an oversized payload, while a requirement envelope must fail loudly.
   */
  read(maxBytes: number): Promise<string | null>;
}

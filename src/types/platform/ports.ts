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

/** Every request states one explicitly, so a caller cannot acquire the operator's environment by saying nothing. */
export type EnvironmentPolicy = { kind: 'inherited'; overrides?: Readonly<Record<string, string>> };

export interface ProcessRequest {
  argv: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  env: EnvironmentPolicy;
  stdin?: string;
}

export interface ProcessOutcome {
  kind: 'exited' | 'timed-out' | 'spawn-failed';
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

export interface StandardInput {
  /**
   * `null`, never a truncated string, when the stream exceeds `maxBytes`: the hook must stay a
   * silent no-op on an oversized payload, while a requirement envelope must fail loudly.
   */
  read(maxBytes: number): Promise<string | null>;
}

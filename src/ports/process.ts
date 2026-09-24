/**
 * The single seam through which every external executable is invoked. Nothing
 * in the codebase spawns a process directly, so unit tests can assert that a
 * forbidden command never reaches a runner (doc 07, U14).
 */

/**
 * What the child process is allowed to see of the host environment. Every
 * request states one explicitly, so a new caller cannot acquire the operator's
 * whole environment — and every token in it — by saying nothing (doc 02).
 */
export type EnvironmentPolicy =
  /**
   * The base environment the composition root read once, plus narrow overrides
   * such as `LC_ALL=C`. Used by callers that are meant to behave like the
   * operator's own shell: git, project checks, the container CLI, `glab`.
   */
  | { kind: 'inherited'; overrides?: Readonly<Record<string, string>> }
  /**
   * Only the named variables are carried over from the base environment, plus
   * the explicit `set` values. Everything else the host holds — provider
   * tokens, registry credentials, database URLs, cloud workload identity — is
   * absent from the child, not merely unused by it.
   */
  | {
      kind: 'replacement';
      /** Names carried over from the base environment when they are present. */
      allow: readonly string[];
      set?: Readonly<Record<string, string>>;
    };

export interface ProcessRequest {
  argv: readonly string[];
  cwd: string;
  timeoutMs: number;
  /** Bytes of stdout/stderr retained; the rest is dropped with a limitation note. */
  maxOutputBytes: number;
  /** Required: see `EnvironmentPolicy`. There is no implicit default. */
  env: EnvironmentPolicy;
  stdin?: string;
  /**
   * `ignore` gives the child no stdout or stderr pipe at all. For a launcher
   * whose work is a program it starts and leaves behind: `cmd /c start <url>`
   * hands the browser the inherited pipes, and a piped run then ends only when
   * the browser does — measured 6,138 ms against a 3 s ceiling with pipes,
   * 51 ms without. Default `capture`.
   */
  output?: 'capture' | 'ignore';
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

/**
 * Resolves a policy against a base environment. Shared by the real runner and
 * by tests, so what a test asserts about isolation is what production applies.
 */
export function resolveEnvironment(
  policy: EnvironmentPolicy,
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  if (policy.kind === 'inherited') {
    const resolved: Record<string, string> = {};
    for (const [name, value] of Object.entries(base)) {
      if (value !== undefined) resolved[name] = value;
    }
    return { ...resolved, ...(policy.overrides ?? {}) };
  }

  const resolved: Record<string, string> = {};
  for (const name of policy.allow) {
    const value = base[name];
    if (value !== undefined) resolved[name] = value;
  }
  return { ...resolved, ...(policy.set ?? {}) };
}

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

export interface ProcessRequest {
  argv: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  env: EnvironmentPolicy;
  stdin?: string;
  /**
   * `ignore` gives the child no pipes, for launchers like `cmd /c start <url>`: the browser inherits
   * piped handles and the run would last as long as the browser does. Default `capture`.
   */
  output?: 'capture' | 'ignore';
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

import type { EnvironmentPolicy, ProcessOutcome, ProcessRunner } from '../ports/process.ts';

export interface WorkerProcessRequest {
  argv: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  stdin?: string;
  env?: EnvironmentPolicy;
  tools?: readonly string[];
  jsonSchema?: object;
  maxBudgetUsd?: number;
  maxTurns?: number;
}

export type WorkerProcessResult =
  | { kind: 'ok'; outcome: ProcessOutcome; argv: readonly string[] }
  | {
      kind: 'failed';
      reason: 'spawn-failed' | 'timed-out' | 'truncated' | 'nonzero-exit';
      outcome: ProcessOutcome;
      argv: readonly string[];
    };

/**
 * The only host variables a worker receives; every other token or secret the shell holds is
 * absent from the child. `HOME`, `USER` and XDG stay because subscription/keychain login reads them.
 */
export const WORKER_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'TMPDIR',
  // Claude Code reads this, else a literal "/tmp", never TMPDIR; sandboxed children die on EPERM without it.
  'CLAUDE_CODE_TMPDIR',
  'LANG', 'LC_ALL', 'TERM',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

/** A retry re-asks for the same answer, correctly serialized; 1 would discard a whole run on one slip. */
export const STRUCTURED_OUTPUT_ATTEMPTS = '3';

export function defaultWorkerEnvironment(): EnvironmentPolicy {
  return {
    kind: 'replacement',
    allow: [...WORKER_ENV_ALLOWLIST],
    set: { MAX_STRUCTURED_OUTPUT_RETRIES: STRUCTURED_OUTPUT_ATTEMPTS },
  };
}

export async function runWorkerProcess(
  runner: ProcessRunner,
  request: WorkerProcessRequest,
): Promise<WorkerProcessResult> {
  const argv = [
    ...request.argv,
    ...(request.tools === undefined ? [] : ['--tools', request.tools.join(',')]),
    ...(request.jsonSchema === undefined ? [] : ['--json-schema', JSON.stringify(request.jsonSchema)]),
    ...(request.maxBudgetUsd === undefined ? [] : ['--max-budget-usd', String(request.maxBudgetUsd)]),
    ...(request.maxTurns === undefined ? [] : ['--max-turns', String(request.maxTurns)]),
  ];
  const outcome = await runner.run({
    argv,
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    maxOutputBytes: request.maxOutputBytes,
    env: request.env ?? defaultWorkerEnvironment(),
    ...(request.stdin === undefined ? {} : { stdin: request.stdin }),
  });
  if (outcome.kind === 'spawn-failed' || outcome.kind === 'timed-out') {
    return { kind: 'failed', reason: outcome.kind, outcome, argv };
  }
  if (outcome.truncated) return { kind: 'failed', reason: 'truncated', outcome, argv };
  if (outcome.exitCode !== 0) return { kind: 'failed', reason: 'nonzero-exit', outcome, argv };
  return { kind: 'ok', outcome, argv };
}

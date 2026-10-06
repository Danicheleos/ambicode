import { WORKER_ENV_ALLOWLIST, STRUCTURED_OUTPUT_ATTEMPTS } from '#modules/types/workers';
import type { EnvironmentPolicy, ProcessOutcome, ProcessRunner } from '#types/ports';

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

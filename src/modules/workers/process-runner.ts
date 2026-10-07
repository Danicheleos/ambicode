import { WORKER_ENV_ALLOWLIST, STRUCTURED_OUTPUT_ATTEMPTS } from '#types/modules/workers';
import { outcomeFailure, type OutcomeFailure } from '#platform/ports/process';
import type { CommandType, EnvironmentPolicy, ProcessOutcome, ProcessRunner } from '#types/platform/ports';

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
  purpose?: CommandType;
}

type WorkerProcessResult =
  | { kind: 'ok'; outcome: ProcessOutcome; argv: readonly string[] }
  | { kind: 'failed'; reason: OutcomeFailure; outcome: ProcessOutcome; argv: readonly string[] };

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
    ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
    ...(request.stdin === undefined ? {} : { stdin: request.stdin }),
  });
  const reason = outcomeFailure(outcome);
  return reason === null ? { kind: 'ok', outcome, argv } : { kind: 'failed', reason, outcome, argv };
}

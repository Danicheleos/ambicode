import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '../ports/process.ts';

export interface StubbedCall {
  /** Matched against the argument vector joined by a space. */
  match: (argv: readonly string[]) => boolean;
  outcome: Partial<ProcessOutcome>;
}

/** Records every invocation so a test can assert what did and did not run. */
export class FakeProcessRunner implements ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  private readonly stubs: StubbedCall[] = [];

  stub(match: StubbedCall['match'], outcome: Partial<ProcessOutcome>): this {
    this.stubs.push({ match, outcome });
    return this;
  }

  stubArgv(prefix: readonly string[], outcome: Partial<ProcessOutcome>): this {
    return this.stub(
      (argv) => prefix.every((value, index) => argv[index] === value),
      outcome,
    );
  }

  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    this.calls.push(request);
    const stub = this.stubs.find((candidate) => candidate.match(request.argv));
    return {
      kind: stub?.outcome.kind ?? 'exited',
      exitCode: stub?.outcome.exitCode ?? 0,
      stdout: stub?.outcome.stdout ?? '',
      stderr: stub?.outcome.stderr ?? '',
      truncated: stub?.outcome.truncated ?? false,
      durationMs: stub?.outcome.durationMs ?? 1,
      failure: stub?.outcome.failure ?? null,
    };
  }

  argvs(): string[][] {
    return this.calls.map((call) => [...call.argv]);
  }
}

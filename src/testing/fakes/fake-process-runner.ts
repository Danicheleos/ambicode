import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/ports';

export interface StubbedCall {
  /** Matched against the argument vector joined by a space. */
  match: (argv: readonly string[]) => boolean;
  outcome: Partial<ProcessOutcome>;
  handler?: (request: ProcessRequest) => Promise<Partial<ProcessOutcome>>;
}

export class FakeProcessRunner implements ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  private readonly stubs: StubbedCall[] = [];

  stub(match: StubbedCall['match'], outcome: Partial<ProcessOutcome>): this {
    this.stubs.push({ match, outcome });
    return this;
  }

  stubEffect(
    match: StubbedCall['match'],
    handler: NonNullable<StubbedCall['handler']>,
  ): this {
    this.stubs.push({ match, outcome: {}, handler });
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
    const produced = stub?.handler === undefined ? (stub?.outcome ?? {}) : await stub.handler(request);
    const kind = produced.kind ?? 'exited';
    return {
      kind,
      // Only an `exited` process has one: the real runner reports null for a kill or a
      // failed spawn, so defaulting to 0 would assert an exit code production never produces.
      exitCode: produced.exitCode ?? (kind === 'exited' ? 0 : null),
      stdout: produced.stdout ?? '',
      stderr: produced.stderr ?? '',
      truncated: produced.truncated ?? false,
      durationMs: produced.durationMs ?? 1,
      failure: produced.failure ?? null,
    };
  }

  argvs(): string[][] {
    return this.calls.map((call) => [...call.argv]);
  }
}

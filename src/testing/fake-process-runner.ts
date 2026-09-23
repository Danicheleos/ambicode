import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '../ports/process.ts';

export interface StubbedCall {
  /** Matched against the argument vector joined by a space. */
  match: (argv: readonly string[]) => boolean;
  outcome: Partial<ProcessOutcome>;
  /** Lets a stub act, e.g. write the files a `docker cp` out would produce. */
  handler?: (request: ProcessRequest) => Promise<Partial<ProcessOutcome>>;
}

/** Records every invocation so a test can assert what did and did not run. */
export class FakeProcessRunner implements ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  private readonly stubs: StubbedCall[] = [];

  stub(match: StubbedCall['match'], outcome: Partial<ProcessOutcome>): this {
    this.stubs.push({ match, outcome });
    return this;
  }

  /** A stub that performs a side effect the real command would have had. */
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
      // Only an `exited` process has one. The real runner reports null for a
      // kill or a failed spawn, so a fake that defaulted to 0 let a test assert
      // an exit code production never produces.
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

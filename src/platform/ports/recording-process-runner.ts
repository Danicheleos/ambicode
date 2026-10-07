import { redactCommand } from '#platform/ledger/redact';
import type { CommandType, ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';

export interface CommandRecord {
  argv: string[];
  type: CommandType;
  exit: number | null;
  ms: number;
  outBytes: number;
}

/** Records every run that names its purpose; the records are flushed by whoever owns the invocation. */
export class RecordingProcessRunner implements ProcessRunner {
  readonly records: CommandRecord[] = [];

  private readonly inner: ProcessRunner;

  constructor(inner: ProcessRunner) {
    this.inner = inner;
  }

  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    const started = performance.now();
    const outcome = await this.inner.run(request);
    if (request.purpose !== undefined) {
      this.records.push({
        argv: [redactCommand(request.argv.join(' '))],
        type: request.purpose,
        exit: outcome.exitCode,
        ms: outcome.durationMs > 0 ? outcome.durationMs : Math.round(performance.now() - started),
        outBytes: Buffer.byteLength(outcome.stdout) + Buffer.byteLength(outcome.stderr),
      });
    }
    return outcome;
  }
}

/** A runner whose untagged runs carry `purpose`. */
export function taggedRunner(inner: ProcessRunner, purpose: CommandType): ProcessRunner {
  return { run: (request) => inner.run({ purpose, ...request }) };
}

import type { ReviewerOutput, ReviewerUsage } from '../contracts/review.ts';

export interface ReviewerRequest {
  systemPrompt: string;
  prompt: string;
  /** Sanitized snapshot directory; the reviewer's only working directory. */
  workingDirectory: string;
  model: string;
  timeoutMs: number;
}

/** An ok `detail` is set only by a non-process reviewer, e.g. to say where a replayed answer came from. */
export type ReviewerInvocation =
  | {
      kind: 'ok';
      output: ReviewerOutput;
      rawLength: number;
      argv: readonly string[];
      usage?: ReviewerUsage;
      detail?: string;
    }
  | { kind: 'error'; reason: string; detail: string; argv: readonly string[]; usage?: ReviewerUsage };

export interface Reviewer {
  readonly source?: 'replay';
  assertIsolationAvailable?(): Promise<void>;
  invoke(request: ReviewerRequest): Promise<ReviewerInvocation>;
}

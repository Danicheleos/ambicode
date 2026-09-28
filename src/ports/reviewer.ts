import type { ReviewerOutput, ReviewerUsage } from '../contracts/review.ts';

export interface ReviewerRequest {
  /**
   * Appended to the reviewer's default system prompt (doc 04 P2.4 correction
   * E1): the canonical shared operating contract and the reviewer role only.
   */
  systemPrompt: string;
  /** The ordinary user prompt: scope, guidance, evidence, and the diff. */
  prompt: string;
  /** Sanitized snapshot directory; the reviewer's only working directory. */
  workingDirectory: string;
  model: string;
  timeoutMs: number;
}

/**
 * `usage` is absent when no envelope was read, e.g. a timeout. An ok `detail`
 * is a fact the reader needs about a successful answer, such as where a
 * replayed one came from; the process reviewer never sets it.
 */
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
  /** Set only by a reviewer that answers without a model call. */
  readonly source?: 'replay';
  /**
   * Refuses before anything is composed if the required isolation cannot be
   * established. An implementation with nothing to prove may leave it out.
   */
  assertIsolationAvailable?(): Promise<void>;
  invoke(request: ReviewerRequest): Promise<ReviewerInvocation>;
}

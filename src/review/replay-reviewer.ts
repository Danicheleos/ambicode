import path from 'node:path';
import { z } from 'zod';
import { ReviewerOutput } from '../contracts/review.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import type { Reviewer, ReviewerInvocation, ReviewerRequest } from '../ports/reviewer.ts';

/**
 * Answers a review from a recording instead of a model call, for `claude
 * plugin eval` only. Inside that sandbox a nested `claude` reads as signed
 * out whatever it is given: `auth status` said `"loggedIn": false` with the
 * sandbox's full environment, with the reviewer allowlist plus `USER`, and
 * without `USER`, and a real call failed with `api_error` (probe, 2026-09-27;
 * the same three read `true`, `true`, `false` outside it). Replaying lets the
 * `with` arm measure the workflow around a known answer rather than an
 * authentication failure.
 *
 * It never widens what the review can do: it reads one file the operator
 * named, answers only for the exact snapshot a recording was made of, and
 * every answer carries `source: "replay"`. The answer still goes through the
 * same validation against this bundle as a model's would.
 */

/** Set by the operator running the evaluation to the recordings file's absolute path. */
export const REVIEWER_REPLAY_VARIABLE = 'EVAL_AMBICODE_REVIEWER_REPLAY';

export const ReviewerRecordings = z.strictObject({
  schemaVersion: z.literal(1),
  recordings: z.array(
    z.strictObject({
      /** `ReviewTarget.snapshotId` of the reviewed content; the only key. */
      snapshotId: z.string().min(1),
      case: z.string().min(1),
      /** The model whose answer this is, for the record. */
      model: z.string().min(1),
      /** Where the answer was captured, relative to the repository root. */
      recordedFrom: z.string().min(1),
      output: ReviewerOutput,
    }),
  ),
});
export type ReviewerRecordings = z.infer<typeof ReviewerRecordings>;

export interface ReplayReviewerOptions {
  fs: FileSystem;
  recordingsPath: string;
  snapshotId: string;
}

export class ReplayReviewer implements Reviewer {
  readonly source = 'replay' as const;
  private readonly fs: FileSystem;
  private readonly recordingsPath: string;
  private readonly snapshotId: string;

  constructor(options: ReplayReviewerOptions) {
    this.fs = options.fs;
    this.recordingsPath = options.recordingsPath;
    this.snapshotId = options.snapshotId;
  }

  async invoke(_request: ReviewerRequest): Promise<ReviewerInvocation> {
    const argv = ['replay', this.recordingsPath, this.snapshotId] as const;
    const fail = (reason: string, detail: string): ReviewerInvocation => ({ kind: 'error', reason, detail, argv });

    // A relative path would resolve against the scaffolded repository under
    // review, which is never where the operator meant.
    if (!path.isAbsolute(this.recordingsPath)) {
      return fail('replay-unreadable', `${REVIEWER_REPLAY_VARIABLE} must be an absolute path, got "${this.recordingsPath}"`);
    }
    let text: string;
    try {
      text = await this.fs.readText(this.recordingsPath);
    } catch (error) {
      return fail('replay-unreadable', `cannot read ${this.recordingsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch (error) {
      return fail('replay-invalid', `${this.recordingsPath} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsed = ReviewerRecordings.safeParse(document);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail('replay-invalid', `${this.recordingsPath}: ${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`);
    }

    const matches = parsed.data.recordings.filter((recording) => recording.snapshotId === this.snapshotId);
    if (matches.length > 1) {
      return fail('replay-invalid', `${this.recordingsPath} holds ${matches.length} recordings for snapshot ${this.snapshotId}`);
    }
    const recording = matches[0];
    if (recording === undefined) {
      const known = parsed.data.recordings.map((entry) => `${entry.case} ${entry.snapshotId}`).join(', ') || 'none';
      return fail(
        'replay-miss',
        `no recording for snapshot ${this.snapshotId} in ${this.recordingsPath} (recorded: ${known}); ` +
          'a change that differs from the recorded one by any byte has a different snapshot',
      );
    }
    return {
      kind: 'ok',
      output: recording.output,
      rawLength: JSON.stringify(recording.output).length,
      argv,
      detail:
        `replayed: no model was called in this run. The answer is the ${recording.model} recording of ` +
        `${recording.case} (${recording.recordedFrom}), made for this exact snapshot.`,
    };
  }
}

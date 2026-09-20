import path from 'node:path';
import {
  emptyPublicationRecord,
  PublicationPositions,
  PublicationRecord,
  type CommentDraft,
  type PublicationOutcome,
  type SubmissionRecord,
} from '../contracts/publication.ts';
import { ReviewResult } from '../contracts/review.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { AmbicodeError } from '../util/errors.ts';

/**
 * Everything the page reads and writes under a review's own gitignored
 * directory. Reads validate against the shared schema, and writes are atomic:
 * a temporary file in the same directory, then a rename, so a crash leaves the
 * previous version rather than half of the next one.
 *
 * Nothing written here may hold a capability, a session id, a cookie or CSRF
 * secret, a glab token or any model credential. Only review identifiers, the
 * human's own text, and what the remote answered.
 */

export const RESULT_FILE = 'result.json';
export const POSITIONS_FILE = 'publication-positions.json';
export const PUBLICATION_FILE = 'publication.json';

export class ReviewStore {
  private readonly fs: FileSystem;
  private readonly clock: Clock;
  readonly directory: string;

  constructor(fs: FileSystem, clock: Clock, reviewDirectory: string) {
    this.fs = fs;
    this.clock = clock;
    this.directory = reviewDirectory;
  }

  private pathOf(file: string): string {
    return path.join(this.directory, file);
  }

  async readResult(): Promise<ReviewResult> {
    const raw = await this.readJson(RESULT_FILE);
    if (raw === null) {
      throw new AmbicodeError('review-not-found', `No saved review result at ${this.pathOf(RESULT_FILE)}.`, {
        details: ['Run `ambicode review` first, or pass the path of a result.json that exists.'],
      });
    }
    const parsed = ReviewResult.safeParse(raw);
    if (!parsed.success) {
      throw new AmbicodeError(
        'review-result-invalid',
        `The saved review result at ${this.pathOf(RESULT_FILE)} does not match the schema AMBICODE expects.`,
        {
          details: [
            ...parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
            'AMBICODE will not display or publish from a result it could not validate.',
          ],
        },
      );
    }
    return parsed.data;
  }

  /** Null when the review had no remote target, so no position was derivable. */
  async readPositions(): Promise<PublicationPositions | null> {
    const raw = await this.readJson(POSITIONS_FILE);
    if (raw === null) return null;
    const parsed = PublicationPositions.safeParse(raw);
    if (!parsed.success) {
      throw new AmbicodeError(
        'publication-positions-invalid',
        `The saved publication positions at ${this.pathOf(POSITIONS_FILE)} could not be validated.`,
        {
          details: [
            ...parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
            'Positions are never recomputed from the current merge request, so nothing can be published from this review.',
          ],
        },
      );
    }
    return parsed.data;
  }

  async writePositions(positions: PublicationPositions): Promise<void> {
    await this.writeJson(POSITIONS_FILE, PublicationPositions.parse(positions));
  }

  async readPublication(reviewId: string): Promise<PublicationRecord> {
    const raw = await this.readJson(PUBLICATION_FILE);
    if (raw === null) return emptyPublicationRecord(reviewId, this.clock.now().toISOString());
    const parsed = PublicationRecord.safeParse(raw);
    if (!parsed.success) {
      throw new AmbicodeError(
        'publication-record-invalid',
        `The saved publication state at ${this.pathOf(PUBLICATION_FILE)} could not be validated.`,
        {
          details: [
            ...parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
            'Publishing again from an unreadable history could duplicate comments, so it is refused.',
          ],
        },
      );
    }
    return parsed.data;
  }

  async writePublication(record: PublicationRecord): Promise<void> {
    await this.writeJson(PUBLICATION_FILE, PublicationRecord.parse(record));
  }

  /** Saves the human's edits before anything is sent, so a failure cannot lose them. */
  async saveDrafts(record: PublicationRecord, drafts: readonly CommentDraft[]): Promise<PublicationRecord> {
    const merged = new Map(record.drafts.map((draft) => [draft.findingId, draft]));
    for (const draft of drafts) merged.set(draft.findingId, draft);
    const next: PublicationRecord = {
      ...record,
      drafts: [...merged.values()].sort((a, b) => a.findingId.localeCompare(b.findingId)),
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writePublication(next);
    return next;
  }

  /**
   * Folds one submission into the record. Earlier confirmed publications are
   * preserved: a later failure never rewrites a comment that was delivered.
   */
  async recordSubmission(
    record: PublicationRecord,
    submission: SubmissionRecord,
  ): Promise<PublicationRecord> {
    const outcomes = new Map(record.outcomes.map((outcome) => [outcome.findingId, outcome]));
    for (const outcome of submission.outcomes) {
      const previous = outcomes.get(outcome.findingId);
      // A confirmed publication is terminal. A later "stale" or "failed" for
      // the same finding describes an attempt that never happened remotely.
      if (previous !== undefined && isTerminal(previous) && !isTerminal(outcome)) continue;
      outcomes.set(outcome.findingId, outcome);
    }
    const next: PublicationRecord = {
      ...record,
      outcomes: [...outcomes.values()].sort((a, b) => a.findingId.localeCompare(b.findingId)),
      submissions: [...record.submissions, submission],
      updatedAt: this.clock.now().toISOString(),
    };
    await this.writePublication(next);
    return next;
  }

  private async readJson(file: string): Promise<unknown> {
    const absolute = this.pathOf(file);
    if (!(await this.fs.exists(absolute))) return null;
    const text = await this.fs.readText(absolute);
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new AmbicodeError('review-file-unreadable', `${absolute} is not valid JSON.`, {
        details: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await this.fs.mkdirp(this.directory);
    const destination = this.pathOf(file);
    // Same directory, so the rename is on one filesystem and therefore atomic.
    const temporary = `${destination}.writing`;
    await this.fs.writeText(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await this.fs.rename(temporary, destination);
  }
}

function isTerminal(outcome: PublicationOutcome): boolean {
  return outcome.state === 'published' || outcome.state === 'already-published';
}

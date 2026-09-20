import type {
  PersistedPosition,
  PublicationOutcome,
  SubmissionRecord,
} from '../contracts/publication.ts';
import { PUBLICATION_SCHEMA_VERSION } from '../contracts/publication.ts';
import type { PublicationState } from '../contracts/primitives.ts';
import {
  revisionMatches,
  type ProviderOutcome,
  type RemoteDiscussion,
  type RemoteRevision,
  type RemoteTarget,
  type ReviewProvider,
} from '../contracts/provider.ts';
import type { Clock } from '../ports/clock.ts';
import { appendMarker } from './marker.ts';
import { describeNearMiss, reconcile } from './reconcile.ts';

/**
 * The only path that writes to a merge request.
 *
 * It runs once per human form submission, sends the selected comments one at a
 * time, and re-checks the revision before each one. Nothing here retries a
 * write on its own: a lost answer is reconciled once and then left as
 * `uncertain`, because a second POST is how one comment becomes two
 * (doc 03 P1.6).
 */

export interface SelectedComment {
  findingId: string;
  /** Exactly what the human typed. The marker is appended, never merged in. */
  body: string;
}

export interface PublishRunOptions {
  provider: ReviewProvider;
  target: RemoteTarget;
  reviewId: string;
  submissionId: string;
  clock: Clock;
  /** Positions derived at review time; the only source of where a comment lands. */
  positions: ReadonlyMap<string, PersistedPosition>;
  /** What the human selected, in display order. */
  selected: readonly SelectedComment[];
  /** Everything the human left unchecked, so the record stays complete. */
  unselected: readonly SelectedComment[];
  /** What earlier submissions already established for each finding. */
  previous: ReadonlyMap<string, PublicationOutcome>;
}

export async function runPublication(options: PublishRunOptions): Promise<SubmissionRecord> {
  const at = (): string => options.clock.now().toISOString();
  const outcomes: PublicationOutcome[] = options.unselected.map((comment) => ({
    findingId: comment.findingId,
    state: 'not-selected' as PublicationState,
    body: comment.body,
    positionDigest: options.positions.get(comment.findingId)?.digest ?? null,
    discussionId: null,
    noteId: null,
    discussionUrl: null,
    message: null,
    at: at(),
  }));

  const stopAll = (reason: string, state: PublicationState, from: number): SubmissionRecord => {
    for (const comment of options.selected.slice(from)) {
      outcomes.push({
        findingId: comment.findingId,
        state,
        body: comment.body,
        positionDigest: options.positions.get(comment.findingId)?.digest ?? null,
        discussionId: null,
        noteId: null,
        discussionUrl: null,
        message: reason,
        at: at(),
      });
    }
    return {
      submissionId: options.submissionId,
      submittedAt: at(),
      stopped: true,
      stoppedReason: reason,
      revisionState: null,
      outcomes,
    };
  };

  if (options.selected.length === 0) {
    return {
      submissionId: options.submissionId,
      submittedAt: at(),
      stopped: false,
      stoppedReason: null,
      revisionState: null,
      outcomes,
    };
  }

  // Reconciliation needs to know which account a comment would be written by;
  // without it, a marker found remotely cannot be attributed, so nothing is
  // sent rather than risking a duplicate.
  const identity = await options.provider.getIdentity(options.target);
  if (identity.kind !== 'ok') {
    return stopAll(
      `The account AMBICODE would publish as could not be established (${identity.message}), so nothing was sent.`,
      'failed-before-send',
      0,
    );
  }

  const revision = await checkRevision(options.provider, options.target);
  if (revision.kind !== 'current') {
    return {
      ...stopAll(revision.reason, revision.kind === 'stale' ? 'stale' : 'failed-before-send', 0),
      revisionState: revision.state,
    };
  }

  // The complete thread list, not the reviewer's bounded one: a display ceiling
  // is not evidence that a comment does not already exist.
  const listed = await listAllDiscussions(options.provider, options.target);
  if (listed.kind !== 'ok') {
    return stopAll(
      `The existing merge request discussions could not be read (${listed.reason}), so AMBICODE could not rule out that these comments already exist. Nothing was sent.`,
      'failed-before-send',
      0,
    );
  }
  let discussions = listed.discussions;
  let listingComplete = listed.complete;

  for (let index = 0; index < options.selected.length; index += 1) {
    const comment = options.selected[index] as SelectedComment;
    const position = options.positions.get(comment.findingId);
    if (position === undefined) {
      outcomes.push(
        outcome(comment, 'failed-before-send', at(), {
          message:
            'This finding has no exact position saved from the review, so it cannot be placed on the merge request. Nothing was sent for it.',
        }),
      );
      continue;
    }

    const settled = options.previous.get(comment.findingId);
    if (settled !== undefined && (settled.state === 'published' || settled.state === 'already-published')) {
      outcomes.push(
        outcome(comment, 'already-published', at(), {
          positionDigest: position.digest,
          discussionId: settled.discussionId,
          noteId: settled.noteId,
          discussionUrl: settled.discussionUrl,
          message: EDITED_RETRY_NOTE,
        }),
      );
      continue;
    }

    const found = reconcile({
      discussions,
      listingComplete,
      reviewId: options.reviewId,
      position,
      postedBy: identity.value.username,
    });
    if (found.kind === 'found') {
      outcomes.push(
        outcome(comment, 'already-published', at(), {
          positionDigest: position.digest,
          discussionId: found.discussionId,
          noteId: found.noteId,
          discussionUrl: found.url,
          message: EDITED_RETRY_NOTE,
        }),
      );
      continue;
    }
    if (found.kind === 'inconclusive') {
      return {
        ...stopAll(
          `${found.reason} Nothing further was sent, because a comment that already exists must not be posted twice.`,
          'failed-before-send',
          index,
        ),
        revisionState: 'current',
      };
    }

    // Re-checked before every individual comment: a push between two writes
    // must stop the rest rather than attach them to code that has moved.
    if (index > 0) {
      const again = await checkRevision(options.provider, options.target);
      if (again.kind !== 'current') {
        return {
          ...stopAll(
            `${again.reason} The remaining comments were not sent, and no comment was moved to a current line. Run a fresh review against the new revision.`,
            again.kind === 'stale' ? 'stale' : 'failed-before-send',
            index,
          ),
          revisionState: again.state,
        };
      }
    }

    const sent = await options.provider.publishComment({
      target: options.target,
      body: appendMarker(comment.body, {
        reviewId: options.reviewId,
        findingId: comment.findingId,
        positionDigest: position.digest,
      }),
      position: position.position,
    });

    if (sent.kind === 'ok') {
      outcomes.push(
        outcome(comment, 'published', at(), {
          positionDigest: position.digest,
          discussionId: sent.value.discussionId,
          noteId: sent.value.noteId,
          discussionUrl: sent.value.url,
        }),
      );
      continue;
    }

    const classified = classifyWriteFailure(sent);
    if (classified === 'failed-before-send') {
      outcomes.push(
        outcome(comment, 'failed-before-send', at(), {
          positionDigest: position.digest,
          message: `${sent.message} Nothing was created on the merge request for this finding.`,
        }),
      );
      continue;
    }

    // Uncertain delivery: query once, and never send the same comment again on
    // the strength of a lost answer.
    const after = await listAllDiscussions(options.provider, options.target);
    if (after.kind === 'ok') {
      discussions = after.discussions;
      listingComplete = after.complete;
      const confirmed = reconcile({
        discussions,
        listingComplete,
        reviewId: options.reviewId,
        position,
        postedBy: identity.value.username,
      });
      if (confirmed.kind === 'found') {
        outcomes.push(
          outcome(comment, 'published', at(), {
            positionDigest: position.digest,
            discussionId: confirmed.discussionId,
            noteId: confirmed.noteId,
            discussionUrl: confirmed.url,
            message: `The response to the write was lost, but the comment was found on the merge request afterwards. ${sent.message}`,
          }),
        );
        continue;
      }
      const nearMiss = describeNearMiss({
        discussions,
        listingComplete,
        reviewId: options.reviewId,
        position,
        postedBy: identity.value.username,
      });
      outcomes.push(
        outcome(comment, 'uncertain', at(), {
          positionDigest: position.digest,
          message: `${sent.message} A single reconciliation query found no matching comment${nearMiss === null ? '' : ` (${nearMiss})`}, so whether it was delivered is unknown. It was not sent again.`,
        }),
      );
    } else {
      outcomes.push(
        outcome(comment, 'uncertain', at(), {
          positionDigest: position.digest,
          message: `${sent.message} Reconciliation could not complete (${after.reason}), so whether it was delivered is unknown. It was not sent again.`,
        }),
      );
    }
  }

  return {
    submissionId: options.submissionId,
    submittedAt: at(),
    stopped: false,
    stoppedReason: null,
    revisionState: 'current',
    outcomes,
  };
}

const EDITED_RETRY_NOTE =
  'This comment already exists on the merge request, so it was not posted again. Any edit made here was not applied to the existing comment: AMBICODE never overwrites a published comment.';

function outcome(
  comment: SelectedComment,
  state: PublicationState,
  at: string,
  extra: Partial<Omit<PublicationOutcome, 'findingId' | 'state' | 'body' | 'at'>> = {},
): PublicationOutcome {
  return {
    findingId: comment.findingId,
    state,
    // Exactly what the human wrote, without the marker: a redisplay must show
    // their text, not the transmitted body.
    body: comment.body,
    positionDigest: extra.positionDigest ?? null,
    discussionId: extra.discussionId ?? null,
    noteId: extra.noteId ?? null,
    discussionUrl: extra.discussionUrl ?? null,
    message: extra.message ?? null,
    at,
  };
}

type RevisionCheck =
  | { kind: 'current'; state: string }
  | { kind: 'stale'; state: string; reason: string }
  | { kind: 'unavailable'; state: string; reason: string };

/**
 * Whether the merge request is still the revision the review pinned. A
 * `collecting` answer is not current: GitLab has a newer head it has not built
 * a diff for yet, and the pinned version describes superseded code.
 */
async function checkRevision(
  provider: ReviewProvider,
  target: RemoteTarget,
): Promise<RevisionCheck> {
  const current: ProviderOutcome<RemoteRevision> = await provider.getCurrentRevision(target);
  if (current.kind !== 'ok') {
    return {
      kind: 'unavailable',
      state: 'unavailable',
      reason: `The merge request's current revision could not be read (${current.message}), so nothing was published.`,
    };
  }
  const compared = revisionMatches(target, current.value);
  if (compared.same) return { kind: 'current', state: current.value.state };
  const reason = `The merge request is no longer the revision this review was pinned to: ${compared.differences.join('; ')}.`;
  return current.value.state === 'unavailable'
    ? { kind: 'unavailable', state: current.value.state, reason }
    : { kind: 'stale', state: current.value.state, reason };
}

type ListedDiscussions =
  | { kind: 'ok'; discussions: RemoteDiscussion[]; complete: boolean }
  | { kind: 'failed'; reason: string };

/**
 * Every thread, with no display ceiling. Reconciliation must be able to say
 * "this comment is not there", and a truncated list cannot say that.
 */
async function listAllDiscussions(
  provider: ReviewProvider,
  target: RemoteTarget,
): Promise<ListedDiscussions> {
  const listed = await provider.listDiscussions({
    target,
    maxDiscussions: Number.POSITIVE_INFINITY,
  });
  if (listed.kind !== 'ok') return { kind: 'failed', reason: listed.message };
  return { kind: 'ok', discussions: listed.value.discussions, complete: listed.value.complete };
}

/**
 * Whether a failed write definitely did not reach GitLab, or might have.
 *
 * A nonzero exit carries GitLab's own rejection, so nothing was created. A
 * timeout, a truncated answer, an unvalidatable body or a missing note all mean
 * the request may have been accepted and the answer lost. Anything unrecognized
 * is treated as uncertain, because the cost of guessing wrong the other way is
 * a duplicate published comment.
 */
export function classifyWriteFailure(outcome: {
  kind: 'failed' | 'unsupported';
  message: string;
}): PublicationState {
  if (outcome.kind === 'unsupported') return 'failed-before-send';
  const message = outcome.message;
  if (/could not be started/.test(message)) return 'failed-before-send';
  if (/failed with exit code/.test(message)) return 'failed-before-send';
  return 'uncertain';
}

export const PUBLICATION_RUN_SCHEMA_VERSION = PUBLICATION_SCHEMA_VERSION;

export interface ReconcileReopenOptions {
  provider: ReviewProvider;
  target: RemoteTarget;
  reviewId: string;
  positions: ReadonlyMap<string, PersistedPosition>;
  outcomes: readonly PublicationOutcome[];
  clock: Clock;
}

export interface ReconcileReopenResult {
  /** Outcomes that changed, keyed by finding; empty when nothing was settled. */
  updated: PublicationOutcome[];
  /** What a reader needs to know about the attempt, including its failure. */
  notes: string[];
}

/**
 * Runs when a saved review is reopened. Every comment left `uncertain` by an
 * earlier submission is looked up once, so the page can say whether it exists
 * before offering to send it again. Nothing is published here.
 */
export async function reconcileUncertainOutcomes(
  options: ReconcileReopenOptions,
): Promise<ReconcileReopenResult> {
  const uncertain = options.outcomes.filter((outcome) => outcome.state === 'uncertain');
  if (uncertain.length === 0) return { updated: [], notes: [] };

  const identity = await options.provider.getIdentity(options.target);
  if (identity.kind !== 'ok') {
    return {
      updated: [],
      notes: [
        `${uncertain.length} comment(s) of uncertain delivery could not be reconciled: the publishing account could not be established (${identity.message}). They are still uncertain and were not re-sent.`,
      ],
    };
  }

  const listed = await listAllDiscussions(options.provider, options.target);
  if (listed.kind !== 'ok') {
    return {
      updated: [],
      notes: [
        `${uncertain.length} comment(s) of uncertain delivery could not be reconciled: the merge request discussions could not be read (${listed.reason}). They are still uncertain and were not re-sent.`,
      ],
    };
  }

  const updated: PublicationOutcome[] = [];
  const notes: string[] = [];
  for (const outcome of uncertain) {
    const position = options.positions.get(outcome.findingId);
    if (position === undefined) continue;
    const found = reconcile({
      discussions: listed.discussions,
      listingComplete: listed.complete,
      reviewId: options.reviewId,
      position,
      postedBy: identity.value.username,
    });
    if (found.kind === 'found') {
      updated.push({
        ...outcome,
        state: 'published',
        discussionId: found.discussionId,
        noteId: found.noteId,
        discussionUrl: found.url,
        message: 'Reconciled on reopening: the comment is on the merge request after all.',
        at: options.clock.now().toISOString(),
      });
      continue;
    }
    if (found.kind === 'inconclusive') {
      notes.push(`${outcome.findingId}: ${found.reason} It remains uncertain and was not re-sent.`);
      continue;
    }
    notes.push(
      `${outcome.findingId}: reconciliation read every discussion and found no matching comment. It remains uncertain; submit it again deliberately if you want it posted.`,
    );
  }
  return { updated, notes };
}

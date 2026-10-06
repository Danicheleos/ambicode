import { isSettled, type PersistedPosition, type PublicationOutcome, type SubmissionRecord, type SelectedComment } from '#types/modules/publication';
import type { PublicationState } from '#types/primitives';
import {
  revisionMatches,
  type DeliveryCertainty,
  type ProviderOutcome,
  type RemoteDiscussion,
  type RemoteRevision,
  type RemoteTarget,
  type ReviewProvider,
} from '#types/platform/provider';
import { appendMarker } from './marker.ts';
import { describeNearMiss, reconcile } from './reconcile.ts';
import type { Clock } from '#types/platform/ports';

/**
 * The only path that writes to a merge request. Nothing retries a write: a lost
 * answer is reconciled once and left `uncertain`, because a second POST is how
 * one comment becomes two.
 */

interface PublishRunOptions {
  provider: ReviewProvider;
  target: RemoteTarget;
  reviewId: string;
  submissionId: string;
  clock: Clock;
  positions: ReadonlyMap<string, PersistedPosition>;
  selected: readonly SelectedComment[];
  unselected: readonly SelectedComment[];
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

  // Without the posting identity a remote marker can't be attributed, so nothing
  // is sent rather than risk a duplicate.
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
    if (settled !== undefined && isSettled(settled.state)) {
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

    // Re-checked before every write, including the first: identity and listing take
    // time, and a push between writes must stop the rest.
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
 * `collecting` is not current: GitLab has a newer head whose diff isn't built
 * yet, so the pinned version describes superseded code.
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

/** No display ceiling: a truncated list cannot prove a comment is absent. */
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
 * `unsupported` never attempted anything. A `failed` write is before-send only
 * when the provider's `certainty` proves it; otherwise `uncertain`, since a wrong
 * guess duplicates a comment. Never inferred from `message` text.
 */
export function classifyWriteFailure(outcome: {
  kind: 'failed' | 'unsupported';
  message: string;
  certainty?: DeliveryCertainty;
}): PublicationState {
  if (outcome.kind === 'unsupported') return 'failed-before-send';
  return outcome.certainty === 'before-send' ? 'failed-before-send' : 'uncertain';
}

interface ReconcileReopenOptions {
  provider: ReviewProvider;
  target: RemoteTarget;
  reviewId: string;
  positions: ReadonlyMap<string, PersistedPosition>;
  outcomes: readonly PublicationOutcome[];
  clock: Clock;
}

interface ReconcileReopenResult {
  updated: PublicationOutcome[];
  notes: string[];
}

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

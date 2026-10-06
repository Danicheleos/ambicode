import type {
  CommentDraft,
  PublicationOutcome,
  PublicationPositions,
} from '#types/modules/publication';
import type { PublicationState } from '#types/primitives';
import type { ReviewResult } from '#types/modules/review';
import type { LastSubmission, PageModel, FindingCard } from '../types/page.ts';

/**
 * Every string here is inserted with Eta's escaping interpolation, so hostile
 * text is displayed rather than executed. It carries no capability, session id,
 * cookie, credential or secret beyond the per-form CSRF token.
 */

interface BuildModelOptions {
  result: ReviewResult;
  positions: PublicationPositions | null;
  drafts: readonly CommentDraft[];
  outcomes: readonly PublicationOutcome[];
  lastSubmission: LastSubmission | null;
  csrfToken: string;
  submissionId: string;
  errors?: readonly string[];
  selected?: ReadonlySet<string>;
  /** Takes precedence over the saved drafts. */
  pendingDrafts?: ReadonlyMap<string, string>;
  revisionState?: string | null;
  revisionReason?: string | null;
}

export function buildPageModel(options: BuildModelOptions): PageModel {
  const { result } = options;
  const positionsById = new Map(
    (options.positions?.positions ?? []).map((entry) => [entry.findingId, entry]),
  );
  const unplaceableById = new Map(
    (options.positions?.unplaceable ?? []).map((entry) => [entry.findingId, entry.reason]),
  );
  const draftsById = new Map(options.drafts.map((draft) => [draft.findingId, draft]));
  const outcomesById = new Map(options.outcomes.map((outcome) => [outcome.findingId, outcome]));

  const availability = publicationAvailability(result, options.positions);

  const findings: FindingCard[] = result.findings.map((finding) => {
    const outcome = outcomesById.get(finding.id);
    const state: PublicationState = outcome?.state ?? 'draft';
    const placed = positionsById.has(finding.id);
    const reason = placed
      ? null
      : (unplaceableById.get(finding.id) ??
        'No remote position was saved for this finding, so it cannot be published.');

    return {
      id: finding.id,
      risk: finding.risk,
      confidence: finding.confidence,
      category: finding.category,
      path: finding.location.side === 'new' ? (finding.location.newPath ?? '') : (finding.location.oldPath ?? ''),
      line: finding.location.line,
      side: finding.location.side,
      excerpt: finding.evidence,
      explanation: finding.explanation,
      ruleRefs: [...finding.ruleRefs],
      requirementRefs: [...finding.requirementRefs],
      supporting: finding.supportingLocations.map((location) => ({
        path: location.side === 'new' ? (location.newPath ?? '') : (location.oldPath ?? ''),
        line: location.line,
        side: location.side,
      })),
      draft:
        options.pendingDrafts?.get(finding.id) ??
        draftsById.get(finding.id)?.body ??
        finding.suggestedComment,
      selected: options.selected?.has(finding.id) ?? false,
      publishable: availability.available && placed && !isSettledState(state),
      notPublishableReason: !availability.available
        ? availability.unavailableReason
        : !placed
          ? reason
          : isSettledState(state)
            ? 'This comment is already on the merge request, so it cannot be published again.'
            : null,
      state,
      stateMessage: outcome?.message ?? null,
      discussionUrl: outcome?.discussionUrl ?? null,
    };
  });

  return {
    reviewId: result.reviewId,
    createdAt: result.createdAt,
    status: result.status,
    statusReason: result.statusReason,
    requirementMode: result.requirementMode,
    reviewModel: result.reviewModel,
    pluginVersion: result.pluginVersion,
    target: {
      kind: result.target.kind,
      snapshotId: result.target.snapshotId,
      notes: [...result.target.notes],
      remote:
        result.target.remote === null
          ? null
          : {
              provider: result.target.remote.provider,
              host: result.target.remote.host,
              projectPath: result.target.remote.projectPath,
              mergeRequestIid: result.target.remote.mergeRequestIid,
              webUrl: result.target.remote.webUrl,
              versionId: result.target.remote.versionId,
              baseSha: result.target.remote.baseSha,
              startSha: result.target.remote.startSha,
              headSha: result.target.remote.headSha,
            },
    },
    requirements: result.requirements.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      status: source.status,
      sourceVersion: source.sourceVersion,
      retrievedAt: source.retrievedAt,
      retrievedVia: source.retrievedVia,
      failureReason: source.failureReason,
    })),
    provenance: result.provenance.map((entry) => ({ ...entry })),
    checks: result.checks.map((check) => ({
      projectId: check.projectId,
      checkId: check.checkId,
      status: check.status,
      selectedCount: check.selected.length,
      selectionComplete: check.selectionComplete,
      exitCode: check.exitCode,
      argv: check.argv.join(' '),
      limitations: [...check.limitations],
      mutations: [...check.mutations],
    })),
    coverage: {
      complete: result.coverage.complete,
      declaredFileCount: result.coverage.declaredFileCount,
      deliveredFileCount: result.coverage.deliveredFileCount,
      versionState: result.coverage.versionState,
      gaps: result.coverage.gaps.map((gap) => ({ ...gap })),
    },
    omissions: [...result.omissions],
    reviewer:
      result.reviewer === null
        ? null
        : {
            status: result.reviewer.status,
            model: result.reviewer.model,
            tools: [...result.reviewer.tools],
            timeoutSeconds: result.reviewer.timeoutSeconds,
            detail: result.reviewer.detail,
            rejections: [...result.reviewer.rejections],
          },
    publication: {
      ...availability,
      revisionState: options.revisionState ?? null,
      revisionReason: options.revisionReason ?? null,
      selectableCount: findings.filter((card) => card.publishable).length,
    },
    findings,
    csrfToken: options.csrfToken,
    submissionId: options.submissionId,
    errors: [...(options.errors ?? [])],
    lastSubmission: options.lastSubmission,
  };
}

function isSettledState(state: PublicationState): boolean {
  return state === 'published' || state === 'already-published';
}

/**
 * A local or branch review has nothing to comment on, and a review whose
 * positions were never derived cannot publish: a position is never recomputed.
 */
export function publicationAvailability(
  result: ReviewResult,
  positions: PublicationPositions | null,
): { available: boolean; unavailableReason: string | null } {
  if (result.target.kind !== 'merge-request' || result.target.remote === null) {
    return {
      available: false,
      unavailableReason:
        'This is a local review of your own working tree or branch, so there is no merge request to publish a comment to. Review the merge request itself with `ambicode review --mr <url>` to publish.',
    };
  }
  if (result.target.remote.provider !== 'gitlab') {
    return {
      available: false,
      unavailableReason: `AMBICODE does not publish to ${result.target.remote.provider}. Phase 1 implements GitLab merge requests only.`,
    };
  }
  if (positions === null || positions.positions.length === 0) {
    return {
      available: false,
      unavailableReason:
        'No publishable position was saved for this review, so nothing can be placed on the merge request. Positions are derived while the pinned diff is available and are never recomputed afterwards.',
    };
  }
  return { available: true, unavailableReason: null };
}

export function summarizeSubmission(
  submittedAt: string,
  stopped: boolean,
  stoppedReason: string | null,
  outcomes: readonly PublicationOutcome[],
): LastSubmission {
  const count = (state: PublicationState): number =>
    outcomes.filter((outcome) => outcome.state === state).length;
  return {
    submittedAt,
    stopped,
    stoppedReason,
    published: count('published'),
    alreadyPublished: count('already-published'),
    failed: count('failed-before-send'),
    uncertain: count('uncertain'),
    stale: count('stale'),
  };
}

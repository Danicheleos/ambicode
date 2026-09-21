import type { PersistedPosition, PublicationPositions, PublicationRecord } from '../contracts/publication.ts';
import type { RemoteTarget } from '../contracts/provider.ts';
import type { ReviewResult } from '../contracts/review.ts';
import { AmbicodeError } from '../util/errors.ts';
import { positionDigest } from './positions.ts';

/**
 * One saved review's three files, validated as a single unit (doc 03 P1.7
 * correction D).
 *
 * `ReviewStore` already validates `result.json`, `publication-positions.json`
 * and `publication.json` against their own schemas independently. That proves
 * each file is internally well-formed; it does not prove the three describe
 * the same review, the same remote target and the same findings. Three
 * individually valid files can still disagree with each other, and nothing
 * downstream — the page, the provider, a publication attempt — may be built
 * on a combination that was never true at once.
 *
 * A mismatch is refused with a precise error. This never repairs, merges or
 * recomputes suspicious state from the current merge request: the saved files
 * are either mutually consistent or the review is refused.
 */
export interface ReviewAggregate {
  result: ReviewResult;
  positions: PublicationPositions | null;
  record: PublicationRecord;
}

export function validateReviewAggregate(aggregate: ReviewAggregate): void {
  const problems = collectProblems(aggregate);
  if (problems.length > 0) {
    throw new AmbicodeError(
      'review-aggregate-invalid',
      `The saved review "${aggregate.result.reviewId}" failed cross-file validation: its result, positions and publication files do not agree.`,
      { details: problems },
    );
  }
}

function collectProblems(aggregate: ReviewAggregate): string[] {
  const { result, positions, record } = aggregate;
  const problems: string[] = [];

  if (record.reviewId !== result.reviewId) {
    problems.push(
      `publication.json reviewId "${record.reviewId}" does not match result.json reviewId "${result.reviewId}".`,
    );
  }

  const findingIds = result.findings.map((finding) => finding.id);
  const findingIdSet = new Set(findingIds);
  if (findingIdSet.size !== findingIds.length) {
    problems.push('result.json contains duplicate finding ids.');
  }

  const remote = result.target.remote;

  if (positions !== null) {
    problems.push(...positionProblems(positions, result, remote, findingIdSet));
  } else if (remote !== null) {
    // A remote review with no positions file at all is an ordinary, honest
    // state (e.g. every finding was unplaceable, or positions were never
    // derived); it is not a cross-file mismatch. `publicationAvailability`
    // already refuses to offer publication in that case.
  }

  problems.push(...recordProblems(record, findingIdSet, remote, positions));

  if (remote === null && record.submissions.length > 0) {
    problems.push(
      'result.json has no remote target, but publication.json records a publication submission. A local review cannot acquire remote publication state.',
    );
  }

  return problems;
}

function positionProblems(
  positions: PublicationPositions,
  result: ReviewResult,
  remote: RemoteTarget | null,
  findingIdSet: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];

  if (positions.reviewId !== result.reviewId) {
    problems.push(
      `publication-positions.json reviewId "${positions.reviewId}" does not match result.json reviewId "${result.reviewId}".`,
    );
  }

  if (remote === null) {
    problems.push(
      'result.json has no remote target, but publication-positions.json exists. A local review cannot acquire remote publication state.',
    );
    return problems;
  }

  if (!sameRemoteTarget(positions.target, remote)) {
    problems.push('publication-positions.json target does not exactly equal result.json target.remote.');
  }

  const positionFindingIds = positions.positions.map((entry) => entry.findingId);
  if (new Set(positionFindingIds).size !== positionFindingIds.length) {
    problems.push('publication-positions.json contains duplicate finding ids in positions.');
  }
  const unplaceableFindingIds = positions.unplaceable.map((entry) => entry.findingId);
  if (new Set(unplaceableFindingIds).size !== unplaceableFindingIds.length) {
    problems.push('publication-positions.json contains duplicate finding ids in unplaceable.');
  }

  const unplaceableSet = new Set(unplaceableFindingIds);
  for (const id of positionFindingIds) {
    if (unplaceableSet.has(id)) problems.push(`Finding ${id} is both positioned and unplaceable.`);
    if (!findingIdSet.has(id)) {
      problems.push(`publication-positions.json positions references finding ${id}, which is not in result.json.`);
    }
  }
  for (const id of unplaceableFindingIds) {
    if (!findingIdSet.has(id)) {
      problems.push(`publication-positions.json unplaceable references finding ${id}, which is not in result.json.`);
    }
  }

  for (const entry of positions.positions) {
    if (!sameTargetFields(entry, remote)) {
      problems.push(
        `publication-positions.json position for finding ${entry.findingId} does not agree with result.json target.remote on provider, host, project, merge request, URL, version or SHAs.`,
      );
    }
    const fresh = positionDigest(positions.reviewId, entry.findingId, positions.target, entry.position);
    if (fresh !== entry.digest) {
      problems.push(
        `publication-positions.json position digest for finding ${entry.findingId} does not match a fresh calculation.`,
      );
    }
  }

  return problems;
}

function recordProblems(
  record: PublicationRecord,
  findingIdSet: ReadonlySet<string>,
  remote: RemoteTarget | null,
  positions: PublicationPositions | null,
): string[] {
  const problems: string[] = [];

  const draftFindingIds = record.drafts.map((draft) => draft.findingId);
  if (new Set(draftFindingIds).size !== draftFindingIds.length) {
    problems.push('publication.json contains duplicate finding ids in drafts.');
  }
  for (const id of draftFindingIds) {
    if (!findingIdSet.has(id)) problems.push(`publication.json drafts references finding ${id}, which is not in result.json.`);
  }

  const outcomeFindingIds = record.outcomes.map((outcome) => outcome.findingId);
  if (new Set(outcomeFindingIds).size !== outcomeFindingIds.length) {
    problems.push('publication.json contains duplicate finding ids in outcomes.');
  }

  const positionByFinding = new Map((positions?.positions ?? []).map((entry) => [entry.findingId, entry]));
  for (const outcome of record.outcomes) {
    if (!findingIdSet.has(outcome.findingId)) {
      problems.push(`publication.json outcomes references finding ${outcome.findingId}, which is not in result.json.`);
      continue;
    }
    const remoteState = outcome.state !== 'draft' && outcome.state !== 'not-selected';
    if (remote === null && remoteState) {
      problems.push(
        `publication.json outcome for finding ${outcome.findingId} carries remote publication state "${outcome.state}", but result.json has no remote target. A local review cannot acquire remote publication state.`,
      );
    }
    const settled = outcome.state === 'published' || outcome.state === 'already-published';
    if (settled && outcome.positionDigest !== null) {
      const position = positionByFinding.get(outcome.findingId);
      if (position === undefined || position.digest !== outcome.positionDigest) {
        problems.push(
          `publication.json settled outcome for finding ${outcome.findingId} does not agree with the persisted position.`,
        );
      }
    }
  }

  return problems;
}

function sameRemoteTarget(a: RemoteTarget, b: RemoteTarget): boolean {
  return (
    a.provider === b.provider &&
    a.host === b.host &&
    a.projectId === b.projectId &&
    a.projectPath === b.projectPath &&
    a.sourceProjectId === b.sourceProjectId &&
    a.sourceProjectPath === b.sourceProjectPath &&
    a.mergeRequestIid === b.mergeRequestIid &&
    a.webUrl === b.webUrl &&
    a.versionId === b.versionId &&
    a.baseSha === b.baseSha &&
    a.startSha === b.startSha &&
    a.headSha === b.headSha
  );
}

function sameTargetFields(entry: PersistedPosition, remote: RemoteTarget): boolean {
  return (
    entry.provider === remote.provider &&
    entry.host === remote.host &&
    entry.projectId === remote.projectId &&
    entry.projectPath === remote.projectPath &&
    entry.mergeRequestIid === remote.mergeRequestIid &&
    entry.webUrl === remote.webUrl &&
    entry.versionId === remote.versionId &&
    entry.position.baseSha === remote.baseSha &&
    entry.position.startSha === remote.startSha &&
    entry.position.headSha === remote.headSha
  );
}

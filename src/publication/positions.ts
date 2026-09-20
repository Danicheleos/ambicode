import type { PersistedPosition, PublicationPositions, UnplaceableFinding } from '../contracts/publication.ts';
import { PUBLICATION_SCHEMA_VERSION } from '../contracts/publication.ts';
import type { RemotePosition, RemoteTarget } from '../contracts/provider.ts';
import type { Finding } from '../contracts/review.ts';
import type { DiffFile } from '../git/diff.ts';
import { positionForLocation } from '../providers/position.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Publishable positions are derived once, while the pinned diff is still in
 * hand, and written beside the review result.
 *
 * A review is reopened long after its temporary snapshot is gone, and the merge
 * request has usually moved on by then. Recomputing a position at that point
 * would place a comment against code the reviewer never saw, so it is never
 * done: a finding whose position was not derived here is displayed but cannot
 * be selected (doc 03 P1.6).
 */

export interface DerivePositionsOptions {
  reviewId: string;
  target: RemoteTarget;
  /** The pinned diff, the authority for which lines exist on which side. */
  files: readonly DiffFile[];
  findings: readonly Finding[];
  derivedAt: string;
}

/**
 * A digest of everything that decides where a comment lands. It goes into the
 * hidden marker, so reconciliation can tell "the comment AMBICODE posted for
 * this finding, here" from "a comment quoting the same text somewhere else".
 */
export function positionDigest(
  reviewId: string,
  findingId: string,
  target: RemoteTarget,
  position: RemotePosition,
): string {
  const seed = [
    reviewId,
    findingId,
    target.provider,
    target.host,
    target.projectId,
    String(target.mergeRequestIid),
    String(target.versionId),
    position.baseSha,
    position.startSha,
    position.headSha,
    position.oldPath ?? '',
    position.newPath ?? '',
    position.oldLine === null ? '' : String(position.oldLine),
    position.newLine === null ? '' : String(position.newLine),
  ].join('\0');
  return contentHash(seed);
}

export function derivePositions(options: DerivePositionsOptions): PublicationPositions {
  const positions: PersistedPosition[] = [];
  const unplaceable: UnplaceableFinding[] = [];

  for (const finding of options.findings) {
    const mapped = positionForLocation(options.target, options.files, finding.location);
    if (mapped.kind !== 'ok') {
      unplaceable.push({
        findingId: finding.id,
        reason: `No exact position could be derived for this finding: ${mapped.reason} It can be read here, but it cannot be published as a merge request comment.`,
      });
      continue;
    }
    positions.push({
      findingId: finding.id,
      provider: options.target.provider,
      host: options.target.host,
      projectId: options.target.projectId,
      projectPath: options.target.projectPath,
      mergeRequestIid: options.target.mergeRequestIid,
      webUrl: options.target.webUrl,
      versionId: options.target.versionId,
      position: mapped.position,
      digest: positionDigest(options.reviewId, finding.id, options.target, mapped.position),
    });
  }

  return {
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    reviewId: options.reviewId,
    derivedAt: options.derivedAt,
    target: options.target,
    positions,
    unplaceable,
  };
}

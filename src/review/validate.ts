import type { Finding, FindingLocation, ReviewerOutput } from '../contracts/review.ts';
import { addressableLines, lineAt, type DiffFile } from '../git/diff.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Reviewer output is checked against the pinned bundle; nothing is repaired or re-asked.
 * One invalid location, unknown rule or requirement, or finding over the limit voids the
 * whole result: the survivors of an unverified answer are not validated output.
 */

export interface ValidateOptions {
  output: ReviewerOutput;
  /** The files that entered the review: the only valid finding locations. */
  files: readonly DiffFile[];
  snapshotText: ReadonlyMap<string, string>;
  reviewId: string;
  maxFindings: number | null;
  knownRuleIds: ReadonlySet<string>;
  knownRequirementIds: ReadonlySet<string>;
  /** `drop` removes each unverifiable finding and keeps the rest as `partial`; over `maxFindings` still voids. */
  onInvalid?: 'void' | 'drop';
}

export type ValidatedFindings =
  | { kind: 'ok'; findings: Finding[] }
  /** `rejections` are persisted, because a refusal is evidence about the review. */
  | { kind: 'invalid'; reason: string; rejections: string[] }
  | { kind: 'partial'; findings: Finding[]; reason: string; rejections: string[] };

export function validateFindings(options: ValidateOptions): ValidatedFindings {
  const rejections: string[] = [];
  const findings: Finding[] = [];
  const usedIds = new Set<string>();

  if (options.maxFindings !== null && options.output.findings.length > options.maxFindings) {
    return {
      kind: 'invalid',
      reason: `The reviewer returned ${options.output.findings.length} findings, above the configured limit of ${options.maxFindings}. AMBICODE does not silently keep the first ${options.maxFindings} and present the result as complete.`,
      rejections: [
        `the reviewer returned ${options.output.findings.length} findings against a limit of ${options.maxFindings} (review.maxFindings)`,
      ],
    };
  }

  for (const [index, candidate] of options.output.findings.entries()) {
    const before = rejections.length;
    const label = `finding ${index + 1} (${describe(candidate.location)})`;

    const located = resolveLocation(candidate.location, options.files);
    if (typeof located === 'string') {
      rejections.push(`${label}: ${located}`);
      continue;
    }

    const supporting: FindingLocation[] = [];
    for (const extra of candidate.supportingLocations) {
      const resolved = resolveSupporting(extra, options.files, options.snapshotText);
      if (typeof resolved === 'string') {
        rejections.push(`${label}: a supporting location is unverifiable — ${resolved}`);
        continue;
      }
      supporting.push(resolved);
    }

    // Excerpt taken from the snapshot and the pinned diff, never from text the model supplied.
    const evidence = snippetFor(located, options.snapshotText);

    for (const ref of candidate.ruleRefs) {
      if (!options.knownRuleIds.has(ref)) {
        rejections.push(`${label}: cites rule "${ref}", which is not in this review's resolved policy.`);
      }
    }
    for (const ref of candidate.requirementRefs) {
      if (!options.knownRequirementIds.has(ref)) {
        rejections.push(`${label}: cites requirement "${ref}", which is not in this review's requirements.`);
      }
    }

    if (rejections.length > before) continue;
    findings.push({
      id: stableId(options.reviewId, located.location, candidate.category, candidate.suggestedComment, usedIds),
      risk: candidate.risk,
      confidence: candidate.confidence,
      category: candidate.category,
      location: located.location,
      supportingLocations: supporting,
      evidence,
      explanation: candidate.explanation,
      suggestedComment: candidate.suggestedComment,
      ruleRefs: [...candidate.ruleRefs],
      requirementRefs: [...candidate.requirementRefs],
    });
  }

  if (rejections.length > 0 && options.onInvalid === 'drop') {
    const dropped = options.output.findings.length - findings.length;
    return { kind: 'partial', findings, reason: `${dropped} invalid finding(s) dropped (review.onInvalid: drop)`, rejections };
  }
  if (rejections.length > 0) {
    return {
      kind: 'invalid',
      reason:
        'The reviewer returned output that could not be verified against the pinned change, so this review produced no validated findings. It is not a review that found nothing.',
      rejections,
    };
  }

  return { kind: 'ok', findings };
}

interface Located {
  file: DiffFile;
  location: FindingLocation;
}

/**
 * Paths are taken from the bundle, not from the model, so a plausible-looking
 * near miss cannot become a comment position.
 */
function resolveLocation(
  location: FindingLocation,
  files: readonly DiffFile[],
): Located | string {
  const named = location.side === 'new' ? location.newPath : location.oldPath;
  if (named === null || named.trim() === '') {
    return `no ${location.side}Path was given for a finding on the ${location.side} side.`;
  }

  const file = files.find((candidate) =>
    location.side === 'new' ? candidate.newPath === named : candidate.oldPath === named,
  );
  if (file === undefined) {
    return `"${named}" is not a file in this review, so the location could not be verified.`;
  }
  if (!addressableLines(file, location.side).has(location.line)) {
    return `line ${location.line} is not present on the ${location.side} side of "${named}" in the reviewed change.`;
  }

  return {
    file,
    location: {
      oldPath: file.oldPath,
      newPath: file.newPath,
      side: location.side,
      line: location.line,
    },
  };
}

/**
 * Evidence, never a comment position, so on the `new` side it may name any line of a
 * mirrored file: a change's consequence often sits on an untouched line. The old side
 * is not mirrored, so it stays diff-only.
 */
function resolveSupporting(
  location: FindingLocation,
  files: readonly DiffFile[],
  snapshotText: ReadonlyMap<string, string>,
): FindingLocation | string {
  const inDiff = resolveLocation(location, files);
  if (typeof inDiff !== 'string') return inDiff.location;
  if (location.side !== 'new' || location.newPath === null) return inDiff;

  const text = snapshotText.get(location.newPath);
  if (text === undefined) return inDiff;
  const lineCount = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  if (location.line > lineCount) {
    return `line ${location.line} is past the end of "${location.newPath}", which has ${lineCount} line(s).`;
  }
  // A changed file keeps its own pre-image name; an unchanged neighbour is the
  // same file on both sides.
  const changed = files.find((file) => file.newPath === location.newPath);
  return {
    oldPath: changed === undefined ? location.newPath : changed.oldPath,
    newPath: location.newPath,
    side: 'new',
    line: location.line,
  };
}

const SNIPPET_RADIUS = 2;
const COMMENT_MARKER = ' <---';

/** Up to five lines around the location from the snapshot, or the one line from the diff. */
function snippetFor(located: Located, snapshotText: ReadonlyMap<string, string>): string {
  const { file, location } = located;

  if (location.side === 'new' && file.newPath !== null) {
    const text = snapshotText.get(file.newPath);
    if (text !== undefined) {
      // A CR left before the marker renders as a line break inside <pre>.
      const lines = text.split(/\r?\n/);
      if (lines.at(-1) === '') lines.pop();
      const from = Math.max(0, location.line - 1 - SNIPPET_RADIUS);
      const to = Math.min(lines.length, location.line + SNIPPET_RADIUS);
      return lines
        .slice(from, to)
        .map((value, offset) => {
          const number = from + offset + 1;
          return `${number}: ${value}${number === location.line ? COMMENT_MARKER : ''}`;
        })
        .join('\n');
    }
  }

  // Deleted or excluded content is not mirrored; the pinned diff still holds the exact line.
  const line = lineAt(file, location.side, location.line);
  return line === null ? '' : `${location.line}: ${line.text}${COMMENT_MARKER}`;
}

/**
 * Derived from where and what the finding is, so it is stable across re-reads;
 * the review ID keeps IDs from colliding between reviews.
 */
function stableId(
  reviewId: string,
  location: FindingLocation,
  category: string,
  suggestedComment: string,
  used: Set<string>,
): string {
  const seed = [
    reviewId,
    location.newPath ?? '',
    location.oldPath ?? '',
    location.side,
    String(location.line),
    category,
    suggestedComment,
  ].join('\0');

  const base = `f-${contentHash(seed).slice('sha256:'.length, 'sha256:'.length + 12)}`;
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function describe(location: FindingLocation): string {
  const named = location.side === 'new' ? location.newPath : location.oldPath;
  return `${named ?? '(no path)'}:${location.line} ${location.side}`;
}

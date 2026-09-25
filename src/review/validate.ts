import type { Finding, FindingLocation, ReviewerOutput } from '../contracts/review.ts';
import { addressableLines, lineAt, type DiffFile } from '../git/diff.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Everything the reviewer returned is checked against the pinned bundle before
 * it becomes a finding. Nothing here is repaired and no second model call is
 * made (doc 02).
 *
 * A primary location outside the pinned diff, a supporting location that names
 * no line of the diff or of a mirrored file, a reference to a rule or
 * requirement this review does not hold, or more findings than the configured
 * limit make the whole reviewer result invalid — not a successful review with a
 * shorter list.
 * A reviewer that named a file the change does not contain has not demonstrated
 * that its other claims were checked against the same evidence, so presenting
 * the survivors as validated output would overstate what is known.
 */

export interface ValidateOptions {
  output: ReviewerOutput;
  /** The files that entered the review: the only valid finding locations. */
  files: readonly DiffFile[];
  /** Mirrored snapshot text by repository-relative path, for evidence snippets. */
  snapshotText: ReadonlyMap<string, string>;
  reviewId: string;
  maxFindings: number;
  knownRuleIds: ReadonlySet<string>;
  knownRequirementIds: ReadonlySet<string>;
}

export type ValidatedFindings =
  | { kind: 'ok'; findings: Finding[] }
  /**
   * The reviewer produced no usable result. `reason` is the operator-facing
   * sentence; `rejections` are the individual diagnostics, persisted because a
   * refusal is evidence about the review.
   */
  | { kind: 'invalid'; reason: string; rejections: string[] };

export function validateFindings(options: ValidateOptions): ValidatedFindings {
  const rejections: string[] = [];
  const findings: Finding[] = [];
  const usedIds = new Set<string>();

  if (options.output.findings.length > options.maxFindings) {
    return {
      kind: 'invalid',
      reason: `The reviewer returned ${options.output.findings.length} findings, above the configured limit of ${options.maxFindings}. AMBICODE does not silently keep the first ${options.maxFindings} and present the result as complete.`,
      rejections: [
        `the reviewer returned ${options.output.findings.length} findings against a limit of ${options.maxFindings} (review.maxFindings)`,
      ],
    };
  }

  for (const [index, candidate] of options.output.findings.entries()) {
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

    // The snippet is taken here, from the snapshot and the pinned diff. Text the
    // model supplied is never quoted back as if it were the file's content.
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
 * A location is valid only if the bundle holds that file and that side carries
 * that line. The paths are taken from the bundle, not from the model, so a
 * plausible-looking near miss cannot become a comment position.
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
 * A supporting location is evidence, never a comment position (positions are
 * derived from the primary location alone), so on the `new` side it may name
 * any line of a mirrored file: the consequence of a change often sits on a line
 * the change did not touch, and requiring the diff there left such a finding
 * no honest anchor. The old side is not mirrored, so it stays diff-only.
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
  // Paths from the bundle, not from the model: a changed file keeps its own
  // pre-image name, an unchanged neighbour is the same file on both sides.
  const changed = files.find((file) => file.newPath === location.newPath);
  return {
    oldPath: changed === undefined ? location.newPath : changed.oldPath,
    newPath: location.newPath,
    side: 'new',
    line: location.line,
  };
}

const SNIPPET_RADIUS = 2;
/** Marks the line the comment is anchored to. */
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

  // Deleted or excluded content is not mirrored; the pinned diff still holds the
  // exact line, which is better evidence than nothing and still not the model's.
  const line = lineAt(file, location.side, location.line);
  return line === null ? '' : `${location.line}: ${line.text}${COMMENT_MARKER}`;
}

/**
 * Derived from where and what the finding is, so the same finding keeps its ID
 * across serializations and a re-read of the result. The review ID keeps IDs
 * from colliding between reviews.
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

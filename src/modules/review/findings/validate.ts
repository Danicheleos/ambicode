import type { Finding, FindingLocation, ReviewerOutput } from '#types/modules/review';
import { addressableLines, lineAt } from '#platform/git/diff';
import type { DiffFile } from '#types/platform/git';

/**
 * Reviewer output is checked against the pinned diff; nothing is repaired or re-asked.
 * One invalid location, unknown rule or requirement, or finding over the limit voids the
 * whole result: the survivors of an unverified answer are not validated output.
 */

export interface ValidateOptions {
  output: ReviewerOutput;
  /** The files that entered the review: the only valid finding locations. */
  files: readonly DiffFile[];
  /** Checkout text of the files a `new`-side finding names, read by the caller; a path absent here falls back to the diff line. */
  snapshotText: ReadonlyMap<string, string>;
  maxFindings: number | null;
  knownRuleIds: ReadonlySet<string>;
  knownRequirementIds: ReadonlySet<string>;
}

type ValidatedFindings =
  | { kind: 'ok'; findings: Finding[] }
  /** `rejections` are persisted, because a refusal is evidence about the review. */
  | { kind: 'invalid'; reason: string; rejections: string[] };

export function validateFindings(options: ValidateOptions): ValidatedFindings {
  const rejections: string[] = [];
  const findings: Finding[] = [];

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

    // Excerpt taken from the checkout and the diff, never from text the model supplied.
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
      id: `f${findings.length + 1}`,
      risk: candidate.risk,
      confidence: candidate.confidence,
      category: candidate.category,
      location: located.location,
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

const SNIPPET_RADIUS = 2;
const COMMENT_MARKER = ' <---';

/** Up to five lines around the location from the checkout, or the one line from the diff. */
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

  // Deleted content, or a merge request, has no checkout text; the diff still holds the exact line.
  const line = lineAt(file, location.side, location.line);
  return line === null ? '' : `${location.line}: ${line.text}${COMMENT_MARKER}`;
}

function describe(location: FindingLocation): string {
  const named = location.side === 'new' ? location.newPath : location.oldPath;
  return `${named ?? '(no path)'}:${location.line} ${location.side}`;
}

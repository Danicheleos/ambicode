import type { Finding, FindingLocation, RecordedCheck, ReviewResult } from '#types/modules/review';

/**
 * The last part, what was not covered, is not optional: a result without it reads
 * like a clean bill of health.
 */
interface ReportOptions {
  result: ReviewResult;
  resultPath: string;
  /** Leaves out each finding's code excerpt, suggested comment and rule ids, which a reader of the final message does not repeat; the report file keeps them. */
  compact?: boolean;
}

export function renderReport(options: ReportOptions): string {
  const { result } = options;
  return [...whatWasReviewed(options), '', ...findings(result, options.compact === true), '', ...verification(result), '', ...uncovered(result, options.compact === true)].join('\n');
}

function whatWasReviewed(options: ReportOptions): string[] {
  const { result } = options;
  const lines = [
    '1. WHAT WAS REVIEWED',
    `   review      ${result.reviewId}  (${result.status}${result.statusReason === null ? '' : `: ${result.statusReason}`})`,
    `   mode        ${result.requirementMode}`,
    `   target      ${result.target.kind} (${result.target.snapshotId})`,
    `   measured    ${result.inputs.changedFiles} file(s), ${result.inputs.changedLines} line(s), ${result.inputs.contextBytes} model-input byte(s)`,
    `   result      ${options.resultPath}`,
  ];

  if (result.reviewer !== null) {
    lines.push(`   reviewer    ${result.reviewer.status}`);
    if (result.reviewer.detail !== null) lines.push(`               ${result.reviewer.detail}`);
    if (result.reviewer.rejectedOutputRef !== null) {
      lines.push(`               the refused answer, unvalidated: ${result.reviewer.rejectedOutputRef}`);
    }
  }

  for (const note of result.target.notes) lines.push(`   note        ${note}`);

  if (result.requirements.length > 0) {
    lines.push('   requirements');
    for (const source of result.requirements) lines.push(`     ${[...new Set([source.id, source.title || '(untitled)', source.url])].join('  ')}`);
  } else {
    lines.push('   requirements  none supplied; this is a quality review');
  }
  return lines;
}

/** Why the finding list is empty, when it is: none of these is a clean change or a clean review. */
export function emptyFindingsNotice(result: ReviewResult): string[] | null {
  if (result.reviewer === null) return ['No reviewer was invoked: this is the evidence stage only.', 'An empty finding list here does not mean the change is clean.'];
  if (result.reviewer.status !== 'ok') return ['The independent reviewer did not produce a validated result, so there are no findings.', 'This is not a clean review.'];
  if (result.findings.length === 0) return ['None. The reviewer identified no material issue within the scope and material above.', 'That is not a proof that the change is correct.'];
  return null;
}

/** `path:line` of a location, on the side it names. */
export const placeLabel = (location: FindingLocation): string => `${(location.side === 'new' ? location.newPath : location.oldPath) ?? '(no path)'}:${location.line}`;

export function findingPath(finding: Finding): string {
  return (finding.location.side === 'new' ? finding.location.newPath : finding.location.oldPath) ?? '';
}

export function checkLine(check: RecordedCheck): string {
  return `${check.key} ${check.phase}: exit ${check.exit}${check.files.length === 0 ? '' : `  on: ${check.files.join(' ')}`}${check.exit === 0 ? '' : '  FAILED'}`;
}

/** What a reader must act on: the omissions the producers marked `attention` and the findings the validator rejected for their location. */
export function attentionNotes(result: ReviewResult): string[] {
  return [...result.omissions.filter((omission) => omission.kind === 'attention').map((omission) => omission.text), ...(result.reviewer?.rejections ?? [])];
}

/** The routine facts of how the review was scoped. */
export function scopeNotes(result: ReviewResult): string[] {
  return result.omissions.filter((omission) => omission.kind === 'scope').map((omission) => omission.text);
}

export const POINT_LABEL = { covered: 'covered', 'cannot-verify': 'cannot verify from the diff', missed: 'missed' } as const;

function findings(result: ReviewResult, compact: boolean): string[] {
  const lines = ['2. FINDINGS'];
  const notice = emptyFindingsNotice(result);
  if (notice !== null) return [...lines, ...notice.map((line) => `   ${line}`)];

  for (const finding of result.findings) {
    lines.push(
      '',
      `   [risk: ${finding.risk} · confidence: ${finding.confidence}] ${finding.category}  ${finding.id}`,
      `   ${findingPath(finding)}:${finding.location.line} (${finding.location.side})`,
    );
    if (!compact) for (const line of finding.evidence.split('\n')) if (line !== '') lines.push(`     | ${line}`);
    lines.push(`   Problem:    ${finding.problem}`, `   Impact:     ${finding.impact}`, `   Confidence: ${finding.confidence} — ${finding.confidenceReason}`);
    if (finding.supportingLocations.length > 0) lines.push(`   also: ${finding.supportingLocations.map(placeLabel).join(', ')}`);
    if (compact) {
      if (finding.requirementRefs.length > 0) lines.push(`   requirements: ${finding.requirementRefs.join(', ')}`);
      continue;
    }
    lines.push(`   suggested comment: ${finding.suggestedComment}`);
    if (finding.ruleRefs.length > 0) lines.push(`   rules: ${finding.ruleRefs.join(', ')}`);
    if (finding.requirementRefs.length > 0) lines.push(`   requirements: ${finding.requirementRefs.join(', ')}`);
  }
  return lines;
}

function verification(result: ReviewResult): string[] {
  const lines = ['3. CHECKS AND VERIFICATION EVIDENCE'];
  if (result.checks.length === 0) {
    lines.push('   No check recorded for this task. Nothing was verified by execution: that is a gap, not a pass.');
  }
  for (const check of result.checks) {
    lines.push(`   ${checkLine(check)}`);
  }
  return lines;
}

function uncovered(result: ReviewResult, compact: boolean): string[] {
  const lines = ['4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE'];
  if (result.requirements.length > 0) {
    lines.push('   requirements');
    for (const source of result.requirements) {
      const points = result.requirementCoverage.filter((point) => point.ref === source.id);
      lines.push(`     ${source.id}${points.length === 0 ? '  (no per-point answer)' : ''}`);
      for (const point of points) lines.push(`       ${POINT_LABEL[point.status]}${point.finding === null ? '' : ` (${point.finding})`}: ${point.point}${point.note === '' ? '' : ` - ${point.note}`}`);
    }
  }
  const attention = attentionNotes(result);
  lines.push('   needs attention');
  for (const note of attention) lines.push(`     - ${note}`);
  if (attention.length === 0) lines.push('     - (none recorded)');
  const scope = scopeNotes(result);
  if (compact) lines.push(`   review scope: ${scope.length} routine note(s); the full list is in report.txt`);
  else if (scope.length > 0) {
    lines.push('   review scope');
    for (const note of scope) lines.push(`     - ${note}`);
  }
  return lines;
}

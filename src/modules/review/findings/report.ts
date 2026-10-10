import type { ReviewResult } from '#types/modules/review';

/**
 * The last part, what was not covered, is not optional: a result without it reads
 * like a clean bill of health.
 */
interface ReportOptions {
  result: ReviewResult;
  resultPath: string;
}

export function renderReport(options: ReportOptions): string {
  const { result } = options;
  return [...whatWasReviewed(options), '', ...findings(result), '', ...verification(result), '', ...uncovered(result)].join('\n');
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
    for (const source of result.requirements) lines.push(`     ${source.id}  ${source.title || '(untitled)'}  ${source.url}`);
  } else {
    lines.push('   requirements  none supplied; this is a quality review');
  }
  return lines;
}

function findings(result: ReviewResult): string[] {
  const lines = ['2. FINDINGS'];
  if (result.reviewer === null) {
    lines.push('   No reviewer was invoked: this is the evidence stage only.');
    lines.push('   An empty finding list here does not mean the change is clean.');
    return lines;
  }
  if (result.reviewer.status !== 'ok') {
    lines.push('   The independent reviewer did not produce a validated result, so there are no findings.');
    lines.push('   This is not a clean review.');
    return lines;
  }
  if (result.findings.length === 0) {
    lines.push('   None. The reviewer identified no material issue within the scope and material above.');
    lines.push('   That is not a proof that the change is correct.');
    return lines;
  }

  for (const finding of result.findings) {
    const named = finding.location.side === 'new' ? finding.location.newPath : finding.location.oldPath;
    lines.push(
      '',
      `   [${finding.risk}/${finding.confidence}] ${finding.category}  ${finding.id}`,
      `   ${named}:${finding.location.line} (${finding.location.side})`,
    );
    for (const line of finding.evidence.split('\n')) if (line !== '') lines.push(`     | ${line}`);
    lines.push(`   ${finding.explanation}`);
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
    lines.push(`   ${check.key} ${check.phase}: exit ${check.exit}${check.argv.length === 0 ? '' : `  ran: ${check.argv.join(' ')}`}`);
  }
  return lines;
}

function uncovered(result: ReviewResult): string[] {
  const lines = ['4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE'];
  for (const omission of result.omissions) lines.push(`   - ${omission}`);
  if (result.reviewer !== null) {
    for (const rejection of result.reviewer.rejections) lines.push(`   - ${rejection}`);
  }
  if (result.omissions.length === 0 && (result.reviewer?.rejections.length ?? 0) === 0) {
    lines.push('   - (none recorded)');
  }
  return lines;
}

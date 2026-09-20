import type { ReviewResult } from '../contracts/review.ts';
import type { PendingApproval } from '../checks/run.ts';

/**
 * The four-part local report (doc 03, P1.4): what was reviewed, the findings,
 * the verification evidence, and what was not covered. The fourth part is not
 * optional — a result without it reads like a clean bill of health.
 */
export interface ReportOptions {
  result: ReviewResult;
  snapshotDirectory: string;
  resultPath: string;
  pendingApprovals: readonly PendingApproval[];
}

/**
 * The split the limit was applied to. Once the prompt exists it is the prompt
 * plus the mirrored tree, with the patch and requirements inside the prompt
 * rather than counted twice.
 */
function describeInputSplit(inputs: ReviewResult['inputs']): string {
  if (inputs.promptBytes === 0) {
    return `${inputs.patchBytes} patch + ${inputs.requirementBytes} requirements + ${inputs.snapshotBytes} mirrored`;
  }
  return (
    `${inputs.promptBytes} prompt, of which ${inputs.patchBytes} patch and ` +
    `${inputs.requirementBytes} requirements, + ${inputs.snapshotBytes} mirrored`
  );
}

export function renderReport(options: ReportOptions): string {
  const { result } = options;
  return [
    ...whatWasReviewed(options),
    '',
    ...findings(result),
    '',
    ...verification(options),
    '',
    ...uncovered(options),
  ].join('\n');
}

function whatWasReviewed(options: ReportOptions): string[] {
  const { result } = options;
  const lines = [
    '1. WHAT WAS REVIEWED',
    `   review      ${result.reviewId}  (${result.status}${result.statusReason === null ? '' : `: ${result.statusReason}`})`,
    `   mode        ${result.requirementMode}`,
    `   target      ${result.target.kind} (${result.target.snapshotId})`,
    `   measured    ${result.inputs.changedFiles} file(s), ${result.inputs.changedLines} line(s), ` +
      `${result.inputs.contextBytes} model-input byte(s) ` +
      `(${describeInputSplit(result.inputs)}), limit ${result.inputs.limits.maxContextBytes}`,
    `   snapshot    ${options.snapshotDirectory}`,
    `   result      ${options.resultPath}`,
  ];

  if (result.reviewer !== null) {
    lines.push(
      `   reviewer    ${result.reviewer.status} — model ${result.reviewer.model}, ` +
        `tools ${result.reviewer.tools.join(',') || '(none)'}, ` +
        `timeout ${result.reviewer.timeoutSeconds}s`,
    );
    if (result.reviewer.detail !== null) lines.push(`               ${result.reviewer.detail}`);
  }

  for (const note of result.target.notes) lines.push(`   note        ${note}`);

  if (result.requirements.length > 0) {
    lines.push('   requirements');
    for (const source of result.requirements) {
      const version = source.sourceVersion === null ? '' : ` @${source.sourceVersion}`;
      lines.push(`     ${source.id}${version}  ${source.url}`);
      lines.push(`       ${source.title || '(untitled)'} — retrieved ${source.retrievedAt} via ${source.retrievedVia}`);
    }
  } else {
    lines.push('   requirements  none supplied; this is a quality review');
  }

  if (result.provenance.length > 0) {
    lines.push('   provenance');
    for (const entry of result.provenance) {
      lines.push(`     ${entry.kind.padEnd(11)} ${entry.reference}  ${entry.contentHash}`);
    }
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
    if (finding.requirementRefs.length > 0) {
      lines.push(`   requirements: ${finding.requirementRefs.join(', ')}`);
    }
    for (const extra of finding.supportingLocations) {
      const path = extra.side === 'new' ? extra.newPath : extra.oldPath;
      lines.push(`   also: ${path}:${extra.line} (${extra.side})`);
    }
  }
  return lines;
}

function verification(options: ReportOptions): string[] {
  const lines = ['3. CHECKS AND VERIFICATION EVIDENCE'];
  if (options.result.checks.length === 0) {
    lines.push('   No configured check covered this change. Nothing was verified by execution.');
  }
  for (const check of options.result.checks) {
    lines.push(
      `   ${check.projectId}/${check.checkId}: ${check.status}` +
        `  selected=${check.selected.length}` +
        `  complete=${check.selectionComplete}` +
        (check.exitCode === null ? '' : `  exit=${check.exitCode}`),
    );
    if (check.argv.length > 0) lines.push(`     ran: ${check.argv.join(' ')}`);
    if (check.outputRef !== null) lines.push(`     output: ${check.outputRef}`);
    for (const limitation of check.limitations) lines.push(`     - ${limitation}`);
    for (const mutation of check.mutations) lines.push(`     ! ${mutation}`);
  }

  if (options.pendingApprovals.length > 0) {
    lines.push('   waiting for authorization');
    for (const approval of options.pendingApprovals) {
      lines.push(`     --approve ${approval.approvalKey}`);
      lines.push(`       reason: ${approval.reason}`);
      lines.push(`       scope:  ${approval.scope}`);
      lines.push(`       would run: ${approval.proposedArgv.join(' ')}`);
    }
  }
  return lines;
}

function uncovered(options: ReportOptions): string[] {
  const { result } = options;
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

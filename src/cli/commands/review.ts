import path from 'node:path';
import type { PendingApproval } from '../../checks/run.ts';
import type { Runtime } from '../../composition/root.ts';
import type { ReviewResult, ReviewerRun } from '../../contracts/review.ts';
import type { Reviewer } from '../../ports/reviewer.ts';
import { ClaudeReviewer, REVIEWER_TOOLS } from '../../review/claude-reviewer.ts';
import { assembleBundle, writeBundleArtifacts, type ReviewBundle } from '../../review/bundle.ts';
import { renderReport } from '../../review/report.ts';
import { validateFindings } from '../../review/validate.ts';
import type { ParsedArgs } from '../args.ts';
import { resolveTargetOptions, TARGET_OPTIONS } from '../target-option.ts';

export const REVIEW_OPTIONS = TARGET_OPTIONS;

export interface ReviewOutput {
  command: 'review';
  reviewId: string;
  reviewDirectory: string;
  snapshotDirectory: string;
  resultPath: string;
  reportPath: string;
  result: ReviewResult;
  pendingApprovals: PendingApproval[];
}

export interface ReviewDependencies {
  /** Injected by tests; production builds the Claude Code process reviewer. */
  reviewer?: Reviewer;
}

/**
 * The default review: assemble the pinned bundle, hand it to a fresh isolated
 * reviewer, validate what comes back against that same bundle, and report the
 * four parts. Failed or skipped checks are evidence here, not a gate.
 */
export async function runReview(
  runtime: Runtime,
  args: ParsedArgs,
  dependencies: ReviewDependencies = {},
): Promise<ReviewOutput> {
  // The bundle composes the canonical prompt and refuses the whole review if
  // the measured input exceeds the limit, so nothing below can reach a model
  // with more than the configuration allows.
  const bundle = await assembleBundle({ runtime, ...resolveTargetOptions('review', runtime, args) });

  const reviewConfig = bundle.workspace.config.review;
  const reviewer =
    dependencies.reviewer ?? new ClaudeReviewer({ runner: runtime.runner, cwd: runtime.cwd });

  // Refuses before the prompt is built if the boundary cannot be established.
  await reviewer.assertIsolationAvailable?.();

  const invocation = await reviewer.invoke({
    prompt: bundle.prompt.text,
    // The sanitized snapshot, which is also the reviewer's only readable tree.
    workingDirectory: bundle.snapshot.directory,
    model: reviewConfig.model,
    timeoutMs: reviewConfig.timeoutSeconds * 1000,
  });

  const run: ReviewerRun = {
    status: invocation.kind === 'ok' ? 'ok' : 'failed',
    model: reviewConfig.model,
    timeoutSeconds: reviewConfig.timeoutSeconds,
    // Read back from the vector that actually ran, not from the constant.
    tools: toolsOf(invocation.argv),
    isolation: isolationOf(invocation.argv),
    rejections: [],
    detail: invocation.kind === 'ok' ? null : `${invocation.reason}: ${invocation.detail}`,
  };

  // Validation is part of whether the reviewer succeeded, not a filter applied
  // afterwards: output that does not survive it makes the run a failure with a
  // stated reason, never a shorter finding list presented as validated.
  let reviewerOk = invocation.kind === 'ok';
  if (invocation.kind === 'ok') {
    const validated = validateFindings({
      output: invocation.output,
      files: bundle.files,
      snapshotText: new Map(bundle.plan.entries.map((entry) => [entry.path, entry.text])),
      reviewId: bundle.reviewId,
      maxFindings: reviewConfig.maxFindings,
      knownRuleIds: new Set(bundle.result.policySummary.ruleIds),
      knownRequirementIds: new Set(bundle.result.requirements.map((source) => source.id)),
    });

    if (validated.kind === 'ok') {
      bundle.result.findings = validated.findings;
      bundle.result.omissions = [...bundle.result.omissions, ...invocation.output.coverageNotes];
    } else {
      reviewerOk = false;
      run.status = 'failed';
      run.rejections = validated.rejections;
      run.detail = `invalid-output: ${validated.reason}`;
    }
  }

  bundle.result.reviewer = run;
  applyStatus(bundle, reviewerOk);

  await writeBundleArtifacts(runtime, bundle);
  const reportPath = path.join(bundle.reviewDirectory, 'report.txt');
  const report = renderReport({
    result: bundle.result,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    pendingApprovals: bundle.pendingApprovals,
  });
  await runtime.fs.writeText(reportPath, `${report}\n`);

  return {
    command: 'review',
    reviewId: bundle.reviewId,
    reviewDirectory: bundle.reviewDirectory,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    reportPath,
    result: bundle.result,
    pendingApprovals: bundle.pendingApprovals,
  };
}

/**
 * A check that failed or was skipped stays evidence: it narrows what the review
 * verified, so the status is `partial`, but it does not stop the model. Only a
 * reviewer that produced nothing usable makes the review an error.
 */
function applyStatus(bundle: ReviewBundle, reviewerOk: boolean): void {
  if (!reviewerOk) {
    bundle.result.status = 'error';
    bundle.result.statusReason =
        bundle.result.reviewer?.detail ??
      'The independent reviewer did not produce a validated result, so no finding list was produced. This is not a clean review.';
    return;
  }

  const unverified = bundle.result.checks.filter(
    (check) => check.status !== 'passed' || !check.selectionComplete,
  );
  const gaps = [
    ...(unverified.length > 0
      ? [`${unverified.length} check(s) did not pass or could not establish what they covered`]
      : []),
    ...(bundle.pendingApprovals.length > 0
      ? [`${bundle.pendingApprovals.length} check(s) are waiting for authorization`]
      : []),
    ...((bundle.result.reviewer?.rejections.length ?? 0) > 0
      ? ['some reviewer output was rejected as unverifiable']
      : []),
  ];

  if (gaps.length === 0) {
    bundle.result.status = 'complete';
    bundle.result.statusReason = null;
    return;
  }
  bundle.result.status = 'partial';
  bundle.result.statusReason = `The review ran, with gaps: ${gaps.join('; ')}.`;
}

function isolationOf(argv: readonly string[]): string[] {
  return argv.filter((value) => value.startsWith('--'));
}

function toolsOf(argv: readonly string[]): string[] {
  const at = argv.indexOf('--tools');
  const declared = at < 0 ? undefined : argv[at + 1];
  return declared === undefined || declared.startsWith('--')
    ? [...REVIEWER_TOOLS]
    : declared.split(',');
}

export function renderReview(output: ReviewOutput): string {
  return renderReport({
    result: output.result,
    snapshotDirectory: output.snapshotDirectory,
    resultPath: output.resultPath,
    pendingApprovals: output.pendingApprovals,
  });
}

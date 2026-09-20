import path from 'node:path';
import type { PendingApproval } from '../../checks/run.ts';
import type { Runtime } from '../../composition/root.ts';
import type { ReviewResult, ReviewerRun } from '../../contracts/review.ts';
import type { Reviewer } from '../../ports/reviewer.ts';
import { ClaudeReviewer, REVIEWER_TOOLS } from '../../review/claude-reviewer.ts';
import { assembleBundle, writeBundleArtifacts, type ReviewBundle } from '../../review/bundle.ts';
import { composeReviewerPrompt } from '../../review/prompt.ts';
import { renderReport } from '../../review/report.ts';
import { validateFindings } from '../../review/validate.ts';
import type { ParsedArgs } from '../args.ts';

export const REVIEW_OPTIONS = {
  values: ['base', 'evidence'],
  repeated: ['requirement', 'approve'],
  flags: ['json', 'branch'],
} as const;

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
  const bundle = await assembleBundle({
    runtime,
    branch: args.flag('branch'),
    baseRef: args.value('base'),
    requirementUrls: args.all('requirement'),
    evidencePath: resolveEvidencePath(runtime, args.value('evidence')),
    approvals: new Set(args.all('approve')),
  });

  const reviewConfig = bundle.workspace.config.review;
  const reviewer =
    dependencies.reviewer ?? new ClaudeReviewer({ runner: runtime.runner, cwd: runtime.cwd });

  // Refuses before the prompt is built if the boundary cannot be established.
  await reviewer.assertIsolationAvailable?.();

  const prompt = await composeReviewerPrompt(runtime.fs, runtime.pluginRoot, bundle);
  bundle.result.provenance = [...bundle.result.provenance, ...prompt.provenance].sort((a, b) =>
    `${a.kind}${a.reference}`.localeCompare(`${b.kind}${b.reference}`),
  );

  const promptPath = path.join(bundle.reviewDirectory, 'reviewer-prompt.md');
  await runtime.fs.writeText(promptPath, prompt.text);

  const invocation = await reviewer.invoke({
    prompt: prompt.text,
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
    bundle.result.findings = validated.findings;
    run.rejections = validated.rejections;
    bundle.result.omissions = [...bundle.result.omissions, ...invocation.output.coverageNotes];
  }

  bundle.result.reviewer = run;
  applyStatus(bundle, invocation.kind === 'ok');

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

function resolveEvidencePath(runtime: Runtime, value: string | null): string | null {
  if (value === null) return null;
  return path.isAbsolute(value) ? value : path.resolve(runtime.cwd, value);
}

export function renderReview(output: ReviewOutput): string {
  return renderReport({
    result: output.result,
    snapshotDirectory: output.snapshotDirectory,
    resultPath: output.resultPath,
    pendingApprovals: output.pendingApprovals,
  });
}

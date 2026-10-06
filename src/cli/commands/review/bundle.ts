import type { ReviewResult, MeasuredInput } from '#types/modules/review';
import { assembleBundle, writeBundleArtifacts } from '#modules/review/bundle/bundle';
import { renderReport } from '#modules/review/findings/report';
import { resolveTargetOptions } from '../../options/target-option.ts';
import type { PendingApproval } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { ParsedArgs } from '../../types/cli.ts';

interface BundleOutput {
  command: 'bundle';
  reviewId: string;
  reviewDirectory: string;
  snapshotDirectory: string;
  resultPath: string;
  measured: MeasuredInput;
  result: ReviewResult;
  pendingApprovals: PendingApproval[];
}

/**
 * The evidence stage alone, with no model: it stops at the evidence and says so, rather than
 * emitting a finding list that reads clean.
 */
export async function runBundle(runtime: Runtime, args: ParsedArgs): Promise<BundleOutput> {
  const resolved = resolveTargetOptions('bundle', runtime, args);
  // No human answer can be recorded here, so a typed --approve approves nothing (01-contracts §5).
  const bundle = await assembleBundle({ runtime, ...resolved, approvals: new Set() });

  bundle.result.omissions = [
    ...bundle.result.omissions,
    ...(resolved.approvals.size === 0 ? [] : [`A typed --approve approves nothing here (${[...resolved.approvals].join(', ')}): start the review route (\`route start review\`) to answer waiting checks.`]),
    'No model review was run: this command produces the evidence bundle only. An empty finding list here does not mean the change is clean.',
  ];

  await writeBundleArtifacts(runtime, bundle);

  return {
    command: 'bundle',
    reviewId: bundle.reviewId,
    reviewDirectory: bundle.reviewDirectory,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    measured: bundle.measured,
    result: bundle.result,
    pendingApprovals: bundle.pendingApprovals,
  };
}

export function renderBundle(output: BundleOutput): string {
  return renderReport({
    result: output.result,
    snapshotDirectory: output.snapshotDirectory,
    resultPath: output.resultPath,
    pendingApprovals: output.pendingApprovals,
  });
}

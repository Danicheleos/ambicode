import path from 'node:path';
import type { PendingApproval } from '../../checks/run.ts';
import type { Runtime } from '../../composition/root.ts';
import type { ReviewResult } from '../../contracts/review.ts';
import { assembleBundle, writeBundleArtifacts } from '../../review/bundle.ts';
import { renderReport } from '../../review/report.ts';
import type { MeasuredInput } from '../../snapshot/limits.ts';
import type { ParsedArgs } from '../args.ts';

export const BUNDLE_OPTIONS = {
  values: ['base', 'evidence'],
  repeated: ['requirement', 'approve'],
  flags: ['json', 'branch'],
} as const;

export interface BundleOutput {
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
 * The evidence stage on its own: pinned target, immutable snapshot, applicable
 * policy, requirements and check evidence, with no model involved. It stops at
 * the evidence and says so, rather than emitting a finding list that reads
 * clean. `review` uses the same assembly and then invokes the reviewer.
 */
export async function runBundle(runtime: Runtime, args: ParsedArgs): Promise<BundleOutput> {
  const bundle = await assembleBundle({
    runtime,
    branch: args.flag('branch'),
    baseRef: args.value('base'),
    requirementUrls: args.all('requirement'),
    evidencePath: evidencePath(runtime, args.value('evidence')),
    approvals: new Set(args.all('approve')),
  });

  bundle.result.omissions = [
    ...bundle.result.omissions,
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

function evidencePath(runtime: Runtime, value: string | null): string | null {
  if (value === null) return null;
  return path.isAbsolute(value) ? value : path.resolve(runtime.cwd, value);
}

export function renderBundle(output: BundleOutput): string {
  return renderReport({
    result: output.result,
    snapshotDirectory: output.snapshotDirectory,
    resultPath: output.resultPath,
    pendingApprovals: output.pendingApprovals,
  });
}

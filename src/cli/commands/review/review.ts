import type { ReviewResult, ReviewEstimate } from '#types/modules/review';
import { pinReview } from '#modules/review/bundle/bundle';
import { renderReport } from '#modules/review/findings/report';
import { resolveTargetOptions, validateTargetArgs } from '../../options/target-option.ts';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { requirementSources } from '#modules/review/bundle/requirements';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand, OptionSpec } from '../../types/cli.ts';
import { TARGET_OPTIONS, type ResolvedTargetOptions } from '../../types/options.ts';

export const REVIEW_OPTIONS: OptionSpec = { ...TARGET_OPTIONS, flags: [...TARGET_OPTIONS.flags, 'estimate'] };

interface ReviewEstimateOutput { command: 'review --estimate'; estimate: ReviewEstimate; text: string }

/** The target options `assembleBundle` takes; requirements are resolved by the caller. */
const assembleOf = (resolved: ResolvedTargetOptions) => ({ target: resolved.target, task: null, excludePaths: resolved.excludePaths, onlyPaths: resolved.onlyPaths, withTests: resolved.withTests });

interface ReviewOutput {
  command: 'review'; reviewId: string; reviewDirectory: string; resultPath: string; reportPath: string; result: ReviewResult;
}

/** Read-only: no ledger entry, no review directory, no step acknowledged (07-E3). */
export async function runReviewEstimate(runtime: Runtime, args: ParsedArgs): Promise<ReviewEstimateOutput> {
  const resolved = resolveTargetOptions('review', runtime, args);
  const requirements = await requirementSources(runtime, { urls: resolved.requirementUrls, evidence: resolved.evidence });
  const estimate = await estimateReview(runtime, { runtime, ...assembleOf(resolved), requirements });
  return { command: 'review --estimate', estimate, text: renderEstimate(estimate) };
}

export async function runReview(runtime: Runtime, args: ParsedArgs): Promise<ReviewOutput> {
  const resolved = resolveTargetOptions('review', runtime, args);
  const requirements = await requirementSources(runtime, { urls: resolved.requirementUrls, evidence: resolved.evidence });
  const pinned = await pinReview(runtime, { assemble: { ...assembleOf(resolved), requirements }, omissions: [], ledger: {} });
  const { bundle } = pinned;
  return { command: 'review', reviewId: bundle.reviewId, reviewDirectory: bundle.reviewDirectory, resultPath: bundle.resultPath, reportPath: pinned.reportPath, result: bundle.result };
}

export function renderReview(output: ReviewOutput): string {
  return renderReport({ result: output.result, resultPath: output.resultPath });
}

export const reviewCommand: CliCommand = {
  name: 'review',
  summary: "Pin the target and prepare the reviewer's input.",
  options: REVIEW_OPTIONS,
  validate: (args) => validateTargetArgs('review', args),
  run: async (runtime, args) => {
    if (args.flag('estimate')) {
      const estimate = await runReviewEstimate(runtime, args);
      return { text: estimate.text, data: estimate };
    }
    const output = await runReview(runtime, args);
    return { text: renderReview(output), data: output };
  },
};

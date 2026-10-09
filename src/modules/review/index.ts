// Review: bundle assembly and findings.

// bundle/: assembling the review bundle, estimates and naming.
/** assembleBundle(options) — builds the review bundle (or a dry-run plan when `dryRun: true`). */
export { assembleBundle } from './bundle/bundle.ts';
/** writeBundleArtifacts(runtime, bundle, ledger?) — writes the bundle's files and appends the `review` ledger entry. */
export { writeBundleArtifacts } from './bundle/bundle.ts';
/** containsBlock(message, block) — whether `block` appears as one contiguous run of normalized lines in `message`. */
export { containsBlock } from './bundle/coverage-block.ts';
/** notCoveredBlock(result) — Part 4 of the printed report, verbatim, from a review result. */
export { notCoveredBlock } from './bundle/coverage-block.ts';
/** estimateReview(runtime, options) — measures the review without writing a snapshot or running any command. */
export { estimateReview } from './bundle/estimate.ts';
/** parseNarrow(text) — parses a `narrow` answer of `--only`/`--exclude` globs. */
export { parseNarrow } from './bundle/estimate.ts';
/** renderEstimate(estimate) — renders the estimate and its suggestions within 2,048 bytes. */
export { renderEstimate } from './bundle/estimate.ts';
/** taskSlugFor({…}) — the task directory slug under TASKS_DIR, or null when the run has no task identity. */
export { taskSlugFor } from './bundle/review-name.ts';

// findings/: rendering and validating reviewer findings.
/** renderReport(options) — renders the printed review report. */
export { renderReport } from './findings/report.ts';
/** validateFindings(options) — validates raw findings; returns valid, partial or invalid with rejections. */
export { validateFindings } from './findings/validate.ts';
/** applyStatus(input, reviewerOk, dropped) — sets a result's status from the reviewer outcome and the gaps around it. */
export { applyStatus } from './findings/status.ts';




// snapshot/: size measures (path classes are #util/path-classes, the binary check #platform/ports/binary).
/** byteLength(value) — UTF-8 byte length of a string. */
export { byteLength } from './snapshot/limits.ts';

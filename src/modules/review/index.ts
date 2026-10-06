// Review: bundle assembly, findings, the local page, publication and reviewers.

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

// page/: the local review page server and its process housekeeping.
/** sweepOwnedTemporaries(options) — removes this tool's stale temporary files and reports what was swept. */
export { sweepOwnedTemporaries } from './page/cleanup.ts';
/** openInBrowser(…) — opens a URL in the platform's browser. */
export { openInBrowser } from './page/open-browser.ts';
/** reopenCommand(reviewId) — the one spelling of the command that reopens a review page. */
export { reopenCommand } from './page/reopen.ts';
/** createPageServer(options) — starts the review page HTTP server and returns its handle. */
export { createPageServer } from './page/server.ts';
/** SessionStore — in-memory page session store with a TTL. */
export { SessionStore } from './page/session.ts';
/** bindPort(…) — binds the page port, taking over from a previous page's control file. */
export { bindPort } from './page/takeover.ts';
/** removeControlFile(fs, port, token) — removes the control file only while it is still this page's. */
export { removeControlFile } from './page/takeover.ts';
/** writeControlFile(fs, entry) — writes the `ambicode-view-<port>.json` control file for takeover. */
export { writeControlFile } from './page/takeover.ts';

// publication/: validating and publishing review results.
/** validateReviewAggregate(aggregate) — throws when a review aggregate is inconsistent. */
export { validateReviewAggregate } from './publication/aggregate.ts';
/** derivePositions(options) — derives the publication positions of findings. */
export { derivePositions } from './publication/positions.ts';
/** positionDigest(…) — digest of derived positions, for detecting change. */
export { positionDigest } from './publication/positions.ts';
/** reconcileUncertainOutcomes(…) — resolves publication outcomes left uncertain by an earlier attempt. */
export { reconcileUncertainOutcomes } from './publication/publish.ts';
/** ReviewStore — the on-disk store of a review's publication record and positions. */
export { ReviewStore } from './publication/store.ts';

// reviewer/: reviewer implementations.
/** ClaudeReviewer — a reviewer backed by a live Claude run. */
export { ClaudeReviewer } from './reviewer/claude-reviewer.ts';
/** ReplayReviewer — a reviewer that replays a recorded result for a snapshot. */
export { ReplayReviewer } from './reviewer/replay-reviewer.ts';

// snapshot/: what is excluded from the reviewed snapshot and size measures.
/** isBinaryContent(bytes) — whether bytes are binary (the decision on content, not extension). */
export { isBinaryContent } from './snapshot/exclusions.ts';
/** isTestPath(relativePath) — whether a path matches the test-file conventions. */
export { isTestPath } from './snapshot/exclusions.ts';
/** pathExclusionReason(…) — why a path is excluded from the snapshot, or null. */
export { pathExclusionReason } from './snapshot/exclusions.ts';
/** byteLength(value) — UTF-8 byte length of a string. */
export { byteLength } from './snapshot/limits.ts';

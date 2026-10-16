# review-subtle after batch A (run 2026-10-14T21-44-07-897Z)

Briefs identical in all 3 runs: "## Callers outside the diff" lists 9 hits for `round`, 6 of them noise:
docs/architecture.md:16, src/legacy/invoice-total.js:7 (Math.round), src/reports/aging.js:6 (Math.round), tests/..:8, money.js:20/29/45 (internal, one is Math.round).
Previous run (14:53) briefs had no callers block; 0 mentions of legacy in its reviewer answers.

- r1: reviewer answered with findings at money.js:25 and :23. Brief allows new-side lines 2-15 only. Route returned `invalid-output`, findings.json = [], ledger findings=0, so finding-recorded failed; final message is a rejection report (no caller cited). Wrong line numbers sit next to the block's "money.js:20/29/45" internals (my inference; the reviewer's own tool calls are not in the trace).
- r2: findings money.js:7 (bare Error), money.js:5 (round change). Names invoices/service.js:55, reports, "the frozen src/legacy/invoice-total.js:7". no-false-defect FAIL 3/3 votes (legacy reported as affected). finding-correct fail (judge).
- r3: same findings (:7, :6); "It also changes the frozen src/legacy/invoice-total.js:7". no-false-defect FAIL 3/3. Others pass.
- Both r2/r3 coverageNotes say "I did not open the callers": the reviewer made no Grep/Read of callers; it copied the block's list, noise included. legacy uses Math.round, so it is NOT affected: the false defect is the block's noise.
- Readback/closing-line change: finals are well formed, fenced, cite path:line; not a factor.

Cause: batch A item 1 (callers block with unfiltered by-name hits). no-false-defect was 1.0 before and fails 2/2 valid runs on the same entry. Not judge noise (6/6 votes), not sandbox.
r1 is a separate failure mode: line outside the diff -> invalid-output (the hook/parse worked; no review recorded by design).

Smallest fix: in callers.ts drop hits that cannot be callers of the changed declaration: lines whose match is preceded by `.` (Math.round, obj.round), docs/markdown, test files, and the changed files themselves. That removes legacy, aging, docs, money.js internals, keeps invoices/service.js:55 and reports/service.js:53. No wording added. Fallback: revert the block. Unverified: not re-run; no paid run made.

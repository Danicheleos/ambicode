# it-004 — WP3 item 1: investigate what the reviewer's `--output-format json` envelope carries, and the options for a tool-call record
WP: WP3 (01 §4), item 1 of 2 ("first an investigation"), a B6-type investigation iteration (07 §2): no behaviour change
Base: `gym/R1/it-003` (`3ff2cb4`); campaign HEAD at brief time `2f4376e` (campaign files only since the tag)
Seam (read only): `src/review/claude-reviewer.ts:412-425` (`usageOf`), the reviewer's argv and output handling in the same file; `src/contracts/review.ts:108-114` (`ReviewerUsage`, strict); `src/review/report.ts`; `REVIEW_SCHEMA_VERSION` (`src/contracts/review.ts:6`); the env allowlist (`claude-reviewer.ts:88`, not to be widened, 08 §4)
Questions:
1. Which fields the envelope carries, and where each is read, with evidence from code, tests and fixtures, and from the archived VS-6735 `result.json` files (`archive/gym__planing__investigation__cache__VS-6735/reviews/*/result.json`, `.reviewer.usage`). Whether a tool-call count or list is in it at all.
2. Options to record the reviewer's tool calls, and "read no file", each with the documented contract it keeps or breaks: the strict `ReviewerUsage`, the schema version, the env allowlist, the reviewer's permission and tool settings, the timeout, replay recordings (`benchmarks/reviewer-recordings.json`, `src/review/*replay*`), and T2's review with-arm, which replays recordings.
3. What the existing data says about the unexplained drop in recording cost (0.3.3: $0.33–0.67 / 126–772 s; 0.3.4: $0.05–0.19 / 65–134 s, same reviewer code; `it-001/metrics.json` notes). Only what the code and saved files show, marked read vs inferred.
Claim: none (investigation; 02 §5 last row, "WP0-type … accept on gates + control"). Deliverable: `handoffs/worker-1.md` (options table with the contract each breaks) and a recommendation for WP3 item 2.
Must not move: nothing; `git diff --stat gym/R1/it-003 -- . ':!gym'` stays empty.
Measurement plan: G1–G3 as a sanity check ($0). T1, T2, T3, T4: `null` (no plugin change).
Budget for this iteration: **$5** (sessions only; $0 eval). Files allowed to change: `gym/runs/R1/it-004/**` only.
Rollback: nothing to roll back (no tracked change outside `gym/`).

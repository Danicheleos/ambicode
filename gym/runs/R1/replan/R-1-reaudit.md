# R-1 — re-audit of what the replan touches (09 §2 step 3)

Checked at HEAD `19582b6`+ (tag `gym/R1/it-004`). Sources: `it-004/handoffs/verifier.md` (the verifier re-read each citation), `it-003/scratch/t3-same-day-ab.txt`.

## Seam rows that WP3 (changed by R-1) depends on — still true

```
claude-reviewer.ts:266-267   --output-format json                         agree (verifier item 3)
claude-reviewer.ts:412-425   usageOf reads num_turns, duration_api_ms, usage.output_tokens, total_cost_usd, thinking_tokens   agree
contracts/review.ts:108-114  ReviewerUsage strict, thinkingTokens .default(null)   agree
review.ts:257-259 / 275-281  replay already `partial`; .reviewer.tools is the allowed list   agree
evals-record-core.mjs        cost read at :112, printed to stderr at :145 (the worker's :127,:129,:152-154 were wrong; corrected in it-004/handoffs/worker-1.md)
env allowlist                25 names at claude-reviewer.ts:74-104 (00-audit / the brief said :88; the worker said 26)
```

## Noise recomputed for the metric R-1 changes (T3)

The T3 count rule is withdrawn, not re-thresholded, so this documents why. Every T3 set since cp-0 is in `it-001/scratch/record-*.log`, `it-003/scratch/record-{1,2,3}.log`, `it-003/scratch/base-record-{1,2,3}.log`. Within-set range (max − min of the 3 finding counts, same build, byte-identical reviewer prompts, same day), per case in file order:

```
base build (A/A side)   3 1 3 1 2 2 1 2
it-003 build            6 2 1 2 1 2 1 2      median range 2 on both sides
be-vs-3571  base 3,3,6  it-003 7,6,1   Δ median +3
fe-vs-6086-d1f112e5  base 4,2,2  it-003 5,4,5   Δ median +3
```

The ≥ 2 rule flags a median difference that the same build produces by itself (2 of 8 cases at +3 with no product change). Nothing is left to recompute for T2: R-1 changes no T2 threshold. The Sonnet spread that would re-derive them does not exist yet (owner-directive-1 asks for it); until it does, Opus thresholds are provisional on Sonnet numbers and say so.

## Not re-verified

- The stability metric has no noise estimate: recordings before R-1 keep counts only (`it-001/metrics.json` note; verifier confirmed `benchmarks/reviewer-recordings.json` has one entry per snapshot). Its floor comes from H2's A/A, not from history.
- Whether the eval harness can carry a stub MCP server (T4p) is unknown; item H3 investigates it first.

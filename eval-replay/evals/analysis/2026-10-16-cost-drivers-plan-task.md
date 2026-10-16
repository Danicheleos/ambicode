# Cost drivers, plugin vs bare: plan and task skills (2026-10-16)

Read-only, $0. Data: plugin `traces/plugin/2026-10-15T11-45-05-592Z` (plan-accept, plan-reuse, plan-draft, task-fix, task-multi, task-review-skipped, 3 runs each), bare `traces/bare/2026-10-15T06-55-42-563Z` (plan-accept, plan-reuse, task-fix, task-multi, 3 runs each). Stability check with the later single-case dirs: plan-accept n=5 $0.1061, plan-reuse n=5 $0.1966, plan-draft n=3 $0.1260 (sweep: 0.1163, 0.2281, 0.1109). Nearest bare sibling: plan-draft vs bare plan-accept, task-review-skipped vs bare task-fix. Scripts: scratchpad `agg2.mjs`, `ctx.mjs`, `growth.mjs`, `extras.mjs` (not committed).

## 0. Prices and method

Fitted `total_cost_usd` to `modelUsage` (cumulative; the `result.usage` field is only the last call). Bare, 36 runs: exact, error 0. Plugin plan/task runs (18): reproduce to $0.0001.

```
cache write  $4.00/Mtok   (1 h cache)
cache read   $0.10/Mtok
output       $10.00/Mtok  (thinking tokens are inside it)
uncached in  $2-3/Mtok    (not identifiable: 2-16 tokens/run, < $0.00004)
```

Caveats (estimated, not in the trace):
- Per-call `output_tokens` in the stream is a snapshot (5-20), so per-call output is allocated: `modelUsage.thinkingTokens` by the thinking-event streaks, the rest by content characters. Totals are exact, the split is +-20%.
- A call's cache write is the previous call's output plus the previous tool result. Each call's $ is assigned to the call that paid it, as asked.
- No guard denial, no Stop-hook re-prompt, no non-tool user message in any of the 18 plugin traces here. 0 re-reads: repeated result lines are 0-1% of plugin bytes. Both causes in the earlier profile are gone from this sweep.

## 1. Cost buckets (USD per run, mean of 3)

| case | arm | total | cache write | cache read | output (of which thinking) | calls |
|---|---|---|---|---|---|---|
| plan-accept | plugin | 0.1163 | 0.0721 (18.0k tok) | 0.0099 (98.8k) | 0.0343 (3,430; think 269) | 5.3 |
| plan-accept | bare | 0.0633 | 0.0413 (10.3k) | 0.0040 (40.4k) | 0.0179 (1,791; think 44) | 3.0 |
| **delta** | | **+0.0530** | +0.0308 (58%) | +0.0059 (11%) | +0.0164 (31%) | +2.3 |
| plan-reuse | plugin | 0.2281 | 0.1396 (34.9k) | 0.0211 (210.7k) | 0.0674 (6,745; think 1,352) | 7.7 |
| plan-reuse | bare | 0.1119 | 0.0746 (18.6k) | 0.0082 (82.3k) | 0.0291 (2,911; think 111) | 4.7 |
| **delta** | | **+0.1162** | +0.0650 (56%) | +0.0129 (11%) | +0.0383 (33%) | +3.0 |
| plan-draft | plugin | 0.1109 | 0.0689 | 0.0122 | 0.0297 (2,974; think 255) | 6.3 |
| **delta vs bare plan-accept** | | **+0.0476** | +0.0276 (58%) | +0.0082 (17%) | +0.0118 (25%) | +3.3 |
| task-fix | plugin | 0.0821 | 0.0626 (15.6k) | 0.0083 (83.3k) | 0.0111 (1,113) | 4.7 |
| task-fix | bare | 0.0444 | 0.0374 (9.3k) | 0.0040 (39.8k) | 0.0030 (302) | 3.0 |
| **delta** | | **+0.0377** | +0.0252 (67%) | +0.0043 (11%) | +0.0081 (21%) | +1.7 |
| task-review-skipped | plugin | 0.0782 | 0.0600 | 0.0075 | 0.0107 (1,066) | 4.3 |
| **delta vs bare task-fix** | | **+0.0338** | +0.0226 (67%) | +0.0035 (10%) | +0.0077 (23%) | +1.3 |
| task-multi | plugin | 0.1153 | 0.0825 (20.6k) | 0.0109 (108.7k) | 0.0219 (2,188) | 5.3 |
| task-multi | bare | 0.1095 | 0.0689 (17.2k) | 0.0187 (187.4k) | 0.0219 (2,189) | 9.7 |
| **delta** | | **+0.0058** | +0.0136 | -0.0078 | 0.0000 | -4.4 |

Uncached input is $0.00002 in every run. **Cache write carries 56-67% of every delta; output 21-33%; cache read 10-17%.** Plugin cost is +85% (plan-accept), +104% (reuse), +85% (task-fix) but only +5% on task-multi, where the plugin takes 4.4 fewer calls than bare (bare loops through raw jest runs).

## 2. Per-call labels and dollars (plugin, mean of 3, USD/run)

Labels: a essential (also in bare); b buys graded quality; c plumbing; d redundant; t = thinking above bare's, not attributable. Plumbing includes the fixed context the plugin adds to call 1 ("prefix", cw delta vs bare times 4.1 incl. its cache reads). The "a" row holds the bare-equivalent first call, reads and the plan Write up to bare's plan size (and its echo into the next call's cache write).

| case | a | b | c (of which prefix) | d | t | sum | bare total |
|---|---|---|---|---|---|---|---|
| plan-accept | 0.0793 | 0.0090 | 0.0142 (0.0142) | 0.0117 | 0.0023 | 0.1165 | 0.0633 |
| plan-reuse | 0.1652 | 0.0180 | 0.0189 (0.0159) | 0.0135 | 0.0124 | 0.2280 | 0.1119 |
| plan-draft | 0.0782 | 0.0018 | 0.0184 (0.0144) | 0.0104 | 0.0021 | 0.1109 | 0.0633 |
| task-fix | 0.0387 | 0.0305 | 0.0129 (0.0129) | 0 | 0 | 0.0821 | 0.0444 |
| task-review-skipped | 0.0386 | 0.0267 | 0.0129 (0.0129) | 0 | 0 | 0.0782 | 0.0444 |
| task-multi | 0.0661 | 0.0351 | 0.0140 (0.0140) | 0 | 0.0001 | 0.1153 | 0.1095 |

What sits in each label:
- plan b: plan above bare's plan size (Write 4.4 KB vs bare message 3.9 KB; reuse 8.6 KB vs 5.8 KB) plus refs-only calls. Refs calls are cheap: the result is 56-117 bytes (reuse 4.3 KB), the call is ~170 output tokens.
- plan c (not prefix): `route next` as its own call in 2 of 3 reuse runs ($0.0030 mean marginal, its cw is the Write echo and is booked to a), `ToolSearch select:AskUserQuestion` in 2 of 3 draft runs (plan-draft: marginal ~$0.004 incl. a separate route-next call).
- plan d: the closing message after `route next`: 695 / 865 / 693 content tokens vs a floor of ~150. It restates the plan the user can open. Its cache read ($0.002-0.004) is unavoidable (any final turn pays it).
- task b: test Read, test Edit, `check`, and the report (536 tokens vs bare's 153). Buys `test-added` (bare 0/3 on it) and `report-sections`.
- task a: includes Glob of `node_modules` (see driver 5).

Example chains (plugin, one run each; `out` is estimated):

| # | what | label | cw | cr | out | $ |
|---|---|---|---|---|---|---|
| plan-reuse-1 | | | | | | |
| 1 | cat/find (prefix + repo listing) | a | 12505 | 7.2k | 89 | 0.0516 |
| 2 | cat context/*.md + src | a | 2243 | 19.7k | 88 | 0.0118 |
| 3 | cat src (2 Bash) | a | 3260 | 22.0k | 178 | 0.0170 |
| 4 | refs sweep + cat | a/b | 7263 | 25.2k | 437 | 0.0359 |
| 5 | cat tests | a | 2178 | 32.5k | 1139 | 0.0234 |
| 6 | Write plan-body.md (8.6 KB) | a+b | 1956 | 34.7k | 3716 | 0.0485 |
| 7 | `route next` alone | c | 3605 | 36.6k | 289 | 0.0210 |
| 8 | closing message | d | 303 | 40.2k | 970 | 0.0149 |
| task-fix-1 | | | | | | |
| 1 | Read src + Glob | a | 11993 | 7.2k | 94 | 0.0496 |
| 2 | Edit src + Read test | a/b | 2418 | 19.2k | 151 | 0.0131 |
| 3 | Edit test | b | 484 | 21.6k | 227 | 0.0064 |
| 4 | `check` | b | 344 | 22.1k | 125 | 0.0048 |
| 5 | report | b | 832 | 22.5k | 531 | 0.0109 |

Call 7 of plan-reuse-1 looks like plumbing at $0.021, but 3,605 cw is the 8.6 KB plan being written into the cache for the first time (it would land on the closing message if `route next` were batched). The marginal cost of the standalone call is ~$0.003.

## 3. Context

First call (cw + cr, cr 7,230 is the shared system prompt in both arms):

| | plugin | bare | extra |
|---|---|---|---|
| plan cases | 19,452 (12,220 cw) | 16,257 (9,025 cw) | +3,195 tok = $0.0128 cw |
| task-fix | 19,178 (11,946 cw) | 16,219 (8,987 cw) | +2,959 |
| task-multi | 19,480 (12,248 cw) | 16,312 (9,080 cw) | +3,168 |

What the +3.0-3.2k tokens are. Measured bytes, tokens at ~4 B/tok (estimated); the trace cannot split them:

| component | bytes | est. tok | source |
|---|---|---|---|
| hook-delivered step message (design/change) | 4,937 (plan-accept), 5,497 (reuse), 4,794 (task-fix), 5,371 (task-multi) | 1.2-1.4k | ledger `delivered channel=hook` |
| of which policy `before-work` text | 2,463 (9 rules, plan) / 2,964 (12 rules, task) | 0.6-0.75k | payload files |
| of which context.list / map | 560-713 / 0-382 | 0.15-0.3k | payload files |
| of which step text design.md / change.md | 1,492 / 822 | 0.2-0.4k | routes/ |
| SKILL.md body (plan / task) | 1,740 / 1,546 | 0.4k | skills/ (assumes the slash expansion is in the prefix) |
| 6 ambicode skill descriptions | 2,959 | 0.74k | frontmatter bytes; unverified they are listed, skills have `disable-model-invocation: true` |
| 2 plugin agents (reviewer, scout) in the Task description | 446 | 0.11k | frontmatter bytes |
| sum | ~10.1 KB | ~2.5-2.7k | |
| unattributed vs measured 3.0-3.2k | | ~0.5k | slash-command framing, not visible |

Price of the prefix: $0.0128 on call 1 plus 3.2k x $0.1/M per later call = $0.0010-0.0023. Total $0.013-0.016 per run (12% of plan-accept, 16% of task-fix).

Growth per call (each call re-reads the whole prefix):

| case | arm | calls | ctx first -> last | growth/call | cache read $ (share of cost) | $ per call at last ctx (read only) |
|---|---|---|---|---|---|---|
| plan-accept | plugin | 5.3 | 19.5k -> 25.3k | 1.3k | 0.0099 (8.5%) | 0.0025 |
| plan-accept | bare | 3.0 | 16.3k -> 17.6k | 0.65k | 0.0040 (6.4%) | 0.0018 |
| plan-reuse | plugin | 7.7 | 19.7k -> 42.1k | 3.4k | 0.0211 (9.2%) | 0.0042 |
| plan-reuse | bare | 4.7 | 16.3k -> 25.9k | 2.6k | 0.0082 (7.4%) | 0.0026 |
| task-fix | plugin | 4.7 | 19.2k -> 22.9k | 1.0k | 0.0083 (10.2%) | 0.0023 |
| task-fix | bare | 3.0 | 16.2k -> 16.6k | 0.18k | 0.0040 (9.0%) | 0.0017 |
| task-multi | plugin | 5.3 | 19.5k -> 27.9k | 1.9k | 0.0109 (9.4%) | 0.0028 |
| task-multi | bare | 9.7 | 16.3k -> 24.4k | 0.9k | 0.0187 (17.1%) | 0.0024 |

**The turn multiplier is small: cache read is 8.5-11% of plugin cost.** Each extra call costs ~$0.002-0.004 in reads. The money is in cache write: every new token (prefix, tool result, the model's own output) is written once at $4/M, 40x the read price. New tokens after call 1:

| case | arm | cw after call 1 | = assistant output echoed (est.) | + tool results (est.) | tool-result bytes |
|---|---|---|---|---|---|
| plan-accept | plugin / bare | 5.8k / 1.3k | 2.5k / 0.2k | 3.3k / 1.1k | 5.3 KB / 2.0 KB |
| plan-reuse | plugin / bare | 22.4k / 9.5k | 4.5k / 0.4k | 17.9k / 9.2k | 38.0 KB / 21.6 KB |
| plan-draft | plugin | 5.0k | 2.0k | 3.0k | 5.4 KB |
| task-fix | plugin / bare | 3.7k / 0.4k | 0.6k / 0.1k | 3.1k / 0.2k | 6.1 KB / 0.2 KB |
| task-multi | plugin / bare | 8.4k / 8.1k | 1.4k / 1.5k | 7.0k / 6.6k | 15.5 KB / 13.4 KB |

The plan Write is paid three times: output $10/M, then cache write $4/M when the next call carries it (bare's plan is the last message and is never re-sent), then cache read on later calls.

## 4. Output tokens

| item | plugin | bare |
|---|---|---|
| plan-accept: plan text | Write 4,373 B (sweep), 3,613 B (n=5) | final message 3,914 chars |
| plan-reuse: plan text | Write 8,587 B (sweep), 6,414 B (n=5) | final message 5,816 chars |
| plan-draft: plan text | Write 3,145 B (sweep), 4,175 B (n=3 later) | n/a |
| closing message (plan accept / reuse / draft) | 695 / 865 / 693 tok (1.4-2.0 KB) | n/a (the plan is the message) |
| thinking (accept / reuse) | 269 / 1,352 tok | 44 / 111 tok |
| task-fix report | 536 tok (860 B), ~160 tok of it generated Evidence/Not verified pasted | 153 tok |
| task-multi report | 638 tok | 498 tok |
| total output (accept / reuse / task-fix) | 3,430 / 6,745 / 1,113 | 1,791 / 2,911 / 302 |

Plan-reuse thinking is $0.0135 vs $0.0011: one block of ~1.1k tokens before the Write (thinking events 50 -> 1,150 inside the Write call in run 1). Plan size varies run to run (reuse Write 6.4-8.6 KB across the two datasets), so the +48% plan-size gap in the sweep is partly noise.

## 5. Top 5 cost drivers (USD per run, plugin minus bare)

Mean over six = sum over the cases it applies to, divided by 6.

| rank | driver | $/run where it applies (mean of 6) | label | removable without losing graded quality | measured/estimated |
|---|---|---|---|---|---|
| 1 | Reads written to cache: plugin tool results above bare's (plan-reuse +16 KB = +8.7k tok; accept +2.2k; draft +1.9k; task-fix +2.9k; multi ~0): `.ambicode/context/*.md`, more sources, refs, check result carrying the write step, Glob | accept 0.009, reuse 0.039, draft 0.008, task-fix 0.012, multi 0.001 (0.0135) | b mostly; c for Glob and context notes | Partly: Glob of `node_modules` ~$0.005 (task-fix) and context notes ~$0.003-0.008 (plan). The source reads in reuse buy 0.94 vs 0.73 per earlier profile, keep | bytes measured; $ = tokens x $4.1/M, estimated |
| 2 | Prefix: hook step message + SKILL.md + skill/agent listings, +3.0-3.2k tok on call 1 | 0.013-0.016 every case (0.0139) | c | ~25-40%: hook message is half of it, policy text is 2.5-3.0 KB of it and 11 of 12 rules are irrelevant to a one-line fix. Rest is fixed by the plugin surface | cw delta measured; split by bytes estimated |
| 3 | Plan delivered as a file: plan above bare's size (Wb) plus its echo into cache | accept 0.016, reuse 0.036, draft 0.010 (0.0103) | b (size) / a (echo) | Echo no (route needs the file). Size: no, plan-quality grades it | measured tokens, split estimated |
| 4 | Closing message restating the plan | accept 0.0117, reuse 0.0135, draft 0.0104 (0.0059); removable output ~$0.0055-0.007 each | d | Yes. Graders: plan-accept/reuse do not read the message; plan-draft needs one sentence (draft awaiting answer) | tokens measured, floor 150 tok assumed |
| 5 | Extra thinking before the plan Write (reuse 1,352 vs 111 tok; accept 269 vs 44) | reuse 0.0124, accept 0.0023, draft 0.0021 (0.0028) | t | Unknown. It is design work (alternatives, anchors); unmeasured whether it buys quality. Do not cut on this evidence | measured (modelUsage.thinkingTokens) |

Not in the top 5 because it is quality-buying: task b calls (test read, test edit, `check`, report) = $0.027-0.035 per task run; bare scores 0/3 on `test-added`. Also small: standalone `route next` $0.003 (2 of 3 reuse runs), ToolSearch for AskUserQuestion in plan-draft ~$0.004, report generated sections pasted ~$0.0016.

## 6. Fix ideas (change before add; no regeneration loop; no policy edits; step text under 1,500 chars)

1. Closing message (driver 4, saves ~$0.006 per plan run, -5%). The only instruction is the sentence at `src/harness/engine/execute.ts:117` (`after`: "Make no more edits or route calls; write your final message") and `prompts/session-contract.md:8`. Extend the existing sentence for the plan route: final message is the plan path and Accepted or Draft in two sentences; the plan file holds the rest. No new code path. Keeps `draft-stated`.
2. Glob of `node_modules` (driver 1, ~$0.005 per task-fix run). Glob result was 4.4-4.7 KB in 3 of 6 task-fix/review-skipped runs, 1.8 KB in 2, 0.8 KB in 1, all node_modules; bare never globs. Cause: the model has no pointer to the test file. Edit `routes/task/change.md` (822 B now): one line "the test sits beside the source or under tests/ with the same base name; Read it with the source in the first call". Or let the existing map step list the test candidates (map returns 0 candidates for this case). Language-agnostic (basename match). Also saves the `Read test` call in some runs.
3. Prefix (driver 2, up to ~$0.004). Edit the delivery of `policy:before-work` (the code that builds the hook message, not `policies/*`): print rule ids plus one-line summaries, full text on demand; 2,463-2,964 B drops to ~600 B (~0.5k tok, $0.0023 + reads). Verify first that the six skill descriptions are in the listing at all (`disable-model-invocation: true`): if they are listed, 2,959 B (0.74k tok, $0.003) is free to drop; if not, nothing to do.
4. Context notes read in full (driver 1, plan only, ~$0.003-0.008): the design step payload already carries `context.list` with token sizes; the model still `cat`s 5-8 notes including unrelated modules (payments, db in reuse). context.list's text already says "Read the notes of the modules the change touches and of modules whose helpers other code reuses"; the model reads them all anyway. Per examples-over-prose, try a one-line worked example in design.md (1,492 B now, limit 1,500 chars per step: no room, so replace a sentence) before adding words. Expected gain is small; do not trade against the reuse reads.
5. Do not touch: plan size, refs sweeps, test edit and `check`, the report sections, thinking. They are the graded work (b) or unmeasured (t).

Estimated total if 1-3 land: plan runs -$0.006 to -$0.010 (-6 to -9%), task-fix -$0.006 to -$0.009 (-8 to -11%). The remaining gap to bare is the prefix floor, the plan file echo, and the quality-buying reads and test edits.

## Not done
- No re-run, no edits, no paid runs. Per-call output tokens and the prefix split are estimates (see section 0 and 3).
- Did not verify that the six skill descriptions are in the prefix, nor the thinking block's contribution to quality.
- Plan-draft has no bare sibling; bare plan-accept is used and its closing-message grader differs.

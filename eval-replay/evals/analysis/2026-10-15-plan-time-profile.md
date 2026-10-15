# Plan-accept / plan-reuse: where plugin time and cost go vs bare (2026-10-15)

Data: plugin plan-accept `traces/plugin/2026-10-15T06-18-45-435Z` (history row 259), plugin plan-reuse `traces/plugin/2026-10-15T06-36-53-284Z` (row 262), bare both `traces/bare/2026-10-15T06-55-42-563Z` (rows 267/268). 3 runs each, means. Script: scratchpad `agg.mjs` (not committed). Read-only, $0.

Method and caveats (unverified parts marked):
- Per call: gen time = previous tool_result timestamp to last assistant block timestamp. Tool exec = tool_use to tool_result (max over parallel tools; includes PreToolUse guard). Start = session duration minus (last assistant ts - first assistant ts): process start, SessionStart hook and call 0 together.
- Per-call output tokens are NOT in the trace (stream usage is a snapshot of 5-20). I allocated the result event's total output_tokens by content characters. Output-gen vs latency split uses a fit over 54 calls: gen = 1.44 s + 0.0055 s/token (182 tok/s). Treat the split as approximate (+-20%); the totals are exact and sum to session time.
- Prices fitted from 48 results (least squares): input $2/M, cache write (1h) $4/M, cache read $0.10/M, output $10/M. Fitted costs reproduce `total_cost_usd` to 4 digits.

## plan-accept (plugin 29.1 s / $0.116 / 6.3 calls vs bare 17.1 s / $0.063 / 3.0 calls)

| time (s) | plugin | bare | delta |
|---|---|---|---|
| start + call 0 (process, SessionStart hook) | 2.6 | 1.8 | +0.8 |
| model output generation | 16.7 | 9.4 | +7.3 |
| model input/latency (TTFT, prefill) | 6.4 | 3.7 | +2.7 |
| tool exec | 3.5 | 2.1 | +1.4 |
| total | 29.1 | 17.1 | +12.0 |

By call kind (plugin): explore 2.3 calls, refs 1.7 calls (4.0 s incl. exec), write plan-body 1 call (14.0 s gen + 0.4 exec), route next separate 0.33 calls, final summary 1 call (3.7 s). Bare: explore 2 calls, final message with the whole plan (11.4 s, 1623 output tokens).

| cost ($) | plugin | bare | delta |
|---|---|---|---|
| cache write | 0.0719 (17,971 tok) | 0.0413 (10,331 tok) | +0.0306 |
| cache read | 0.0123 (123k tok) | 0.0040 (40k tok) | +0.0083 |
| output | 0.0314 (3,141 tok) | 0.0179 (1,791 tok) | +0.0135 |
| total | 0.1157 | 0.0633 | +0.0524 |

## plan-reuse (plugin 46.0 s / $0.207 / 8.0 calls vs bare 25.5 s / $0.112 / 4.7 calls)

| time (s) | plugin | bare | delta |
|---|---|---|---|
| start + call 0 | 4.6 (2.5 median; run 3 TTFT 7.8 s) | 1.9 | +2.7 |
| model output generation | 28.1 | 15.7 | +12.4 |
| model input/latency | 11.5 | 5.7 | +5.8 |
| tool exec | 1.9 | 2.3 | -0.4 |
| total | 46.0 | 25.5 | +20.5 |

| cost ($) | plugin | bare | delta |
|---|---|---|---|
| cache write | 0.1308 (32,688 tok) | 0.0746 (18,648 tok) | +0.0562 |
| cache read | 0.0215 (215k tok) | 0.0082 (82k tok) | +0.0133 |
| output | 0.0544 (5,444 tok) | 0.0291 (2,911 tok) | +0.0253 |
| total | 0.2067 | 0.1119 | +0.0948 |

Plugin by kind: explore 4.0 calls $0.106 (bare 3.67 calls $0.079); Write plan 1.33 calls $0.053 (20.0 s output gen); refs 1 call $0.018; route 0.67 separate calls $0.010; final summary $0.020. Bare final message (the plan) $0.033, 13.9 s output gen.

## Plumbing facts measured

- First-call context: plugin 19.5k tokens (12.3k cache write + 7.2k cache read) vs bare 16.3k (9.0k + 7.2k). Plugin prefix is +3.2k tokens: extra cost $0.013 write on call 1, plus about +0.3k per later call read (~$0.002). Cannot split skill list vs expanded skill prompt from the trace.
- Hooks: only `SessionStart:startup` is recorded, output `{}` (0 bytes additionalContext). No UserPromptSubmit or Stop hook records, no Stop-feedback rounds. Wall cost of plugin input hooks: `input_hooks` 310-336 ms plugin vs 0-1 ms bare.
- Guard (PreToolUse) overhead: Bash `cat` calls 0.12-0.28 s plugin vs 0.13-0.17 s bare; Write 0.06-0.07 s. About zero when it allows.
- Guard denial ("AMBICODE: nothing ran. Re-run without `| head`"): accept runs 1 and 2, reuse run 3 (3 of 6 plugin runs, 0 of 6 bare). Each costs one wasted call: ~1.4-2.2 s gen + 0.1 s, ~$0.006-0.0085 (accept run 1: 2.3 s, $0.0085 = 7% of that run).
- Plugin bytes injected via tool results: route next success 223-233 bytes. Plan-check failure (reuse run 2, "bad anchor: service.js:16 missing-file") returned 2,205 bytes, of which ~1.9 KB re-prints the design step text. No route start tool call appears in these traces (skill text arrives in the prompt, inside the prefix).
- Plan-check retry (reuse run 2 only): route next fail 1.8 s + Read 1.9 s + full rewrite Write 12.5 s (2.6k output tokens) = 16.2 s, $0.062 for that run. Mean over 3 runs: 5.4 s, $0.021.
- Sandbox noise: first Bash (git ls-files / find) takes 1.9-3.0 s in both arms every run (bare 1.9 s in 6 of 6). Not differential. `xcrun` text appears in 1 of 3 runs per arm in accept and 3 of 3 bare reuse; same in both arms.

## Cost of the `route next` after the plan-body Write (today)

| case | how it runs | time | cost |
|---|---|---|---|
| accept run 1 | separate call | 2.1 s gen + 0.5 s exec = 2.6 s | $0.0113 (cw 2,049, cr 22.5k) |
| accept runs 2, 3 | batched in the Write message | 0.54, 0.57 s exec | ~0 (its result is cached into the final call) |
| reuse run 1, 2 | batched with Write | 0.52, 0.52 s exec | ~0 |
| reuse run 3 | separate call | 1.5 s gen + 0.54 s exec = 2.0 s | $0.0145 |
| mean accept | | 1.2 s | $0.0038 |
| mean reuse | | 1.0 s | $0.0048 |

So removing it saves about 1.0-1.2 s (3-4% of plugin session) and $0.004-0.005 per run on average; 0.5 s in the batched case, 2-2.6 s plus ~$0.012 when the model issues it as its own call. It does not remove the final-summary call.

## Top 3 plugin-added contributors

Accept (+12.0 s, +$0.052):
1. Cache-write growth: +7.6k tokens written, +$0.0306 (58% of the cost delta). Of that, +3.2k is the prefix (a/b, trimmable only by cutting skill text), the rest is tool results (explore reads context files) and the plan Write echoed back into context. Time effect small (~+2.7 s latency).
2. Output generation: +1,350 tokens, +7.3 s, +$0.0135 direct. Breakdown: the plan itself costs about the same as bare's in-message plan (Write ~1,915 tokens vs bare final ~1,623); the extra is the post-route summary call (660-810 tokens, 3.6-4.1 s, $0.010-0.015). (b) for the plan, (a) for most of the summary: it restates the plan the user can open.
3. Extra calls: plugin 6.3 vs 3.0. Refs sweep 1.7 calls = 4.0 s, $0.011 (b, buys reuse evidence); route next 0.33 calls (above, a); guard-denial retry in 2 of 3 runs, ~2 s and ~$0.008 each (a, removable: the rule fires on `| head`; or c-adjacent since the denial is triggered by model habit).

Reuse (+20.5 s, +$0.095):
1. Cache write: +14k tokens, +$0.056 (59%) from the longer prefix (+3.2k), bigger exploration reads (context/*.md, 10-15 KB tool results in calls 1-3) and the plan echoed back. (b) mostly: the reads are what produces 0.939 vs 0.733.
2. Output generation: +2,533 tokens, +12.4 s, +$0.025. Plan Write averages ~2.9k tokens vs bare's plan 2.5k; summary +810 tokens (+4.4 s); plan-check rewrite in 1 of 3 runs (+5.4 s, +$0.021 mean). Plan length and rewrite are (b); summary and rewrite-after-bad-anchor partially (a) if anchors were pre-validated by the model's own habit.
3. Exploration latency + refs: explore calls 9.2 s gen vs bare 4.6 s (large prefills, one 8.2 s call after 7.8k cache write), refs 1 call 3.9 s $0.018. (b). Run 3's 7.8 s TTFT on call 0 (+2.1 s mean) is API noise (c).

Sandbox noise (c) is not in the top 3: it is equal in both arms.

## Not done
- No per-call real output token counts exist in traces; split is estimated. No hook timing beyond `input_hooks`; Stop and UserPromptSubmit hooks are absent from these traces, so their cost is 0 here by observation, not by inference.
- Did not re-run anything or test removing route next; numbers are today's cost only.

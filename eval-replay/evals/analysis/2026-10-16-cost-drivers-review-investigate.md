# Cost drivers: review, investigate, fixed prefix (2026-10-16)

Data: plugin sweep 2026-10-15T11-45-05 vs bare 2026-10-15T06-55-42, 3 runs per case, averages. Read-only, $0.
M = measured from traces/source. E = estimated.

## Rates (E, fit; the fit is loose)

NNLS fit of `total_cost_usd` on `modelUsage` (all models, subagent included) over 54 runs:

```
cache write 3.72 $/M   cache read 0.158 $/M   output 9.87 $/M   (input tokens: ~0, 2-12 per run)
max residual $0.007 (about 10% on a $0.07 run); fitted total runs 2-5% high on review cases
```

A 3-run exact solve gives output 2.7 $/M, so the three rates are not independent. Shares below are good to about +-15%. Cache write is the dominant term: 10-13k written tokens is $0.04-0.05 of a $0.045-0.07 run.

## 1. Review

M: the subagent cost is inside `total_cost_usd` (modelUsage has one model, sonnet-5-5; `result.usage` is main thread only). Subagent usage = modelUsage minus `result.usage`. Only 1 of its 2-3 calls appears in the stream (it has `parent_tool_use_id`); `task_notification.usage.total_tokens` (7.6-8k) confirms 2 calls.

| case (plugin) | total $ | main thread cc / cr / out tok | main $ (E) | subagent cc / cr / out tok | subagent $ (E) | bare $ |
|---|---|---|---|---|---|---|
| review-skipped (no reviewer) | 0.0437 | 10.4k / 7.2k / 137 | 0.041 | - | - | - |
| review-clean | 0.0702 | 12.3k / 25.1k / 515 | 0.055 | 4.2k / 8.2k / 206 | 0.019 | 0.0448 |
| review-defect | 0.0716 | 12.8k / 25.1k / 491 | 0.057 | 2.7k / 9.7k / 509 | 0.017 | 0.0458 |
| review-regression | 0.0714 | 12.7k / 25.2k / 520 | 0.057 | 2.9k / 9.7k / 441 | 0.017 | 0.0450 |
| review-subtle | 0.0890 | 13.7k / 25.1k / 647 | 0.061 | 4.4k / 20.8k / 1205 | 0.031 | 0.0775 |
| bare (clean/defect/regr.) | 0.045 | 9.8k / 23.4k / 300-420 | 0.044 | - | - | |
| bare subtle | 0.0775 | 13.4k / 67k / 1740 (4-5 calls) | 0.0775 | - | - | |

Gap on defect, +$0.0258 (M for tokens, E for $):

| part | delta tokens vs bare | $ (E) |
|---|---|---|
| Main first call: fixed prefix + route message (cc 10.6k vs 9.0k) | +1.6k cc | +0.006 |
| Main second call: subagent report + readback text (cc 2153 vs 845 for bare's diff) | +1.3k cc | +0.005 |
| Main output (restates findings, Part 4 verbatim) | +70..+200 out | +0.001 |
| Subagent: 2 calls, cc 2.7k, cr 9.7k, out 0.5k | | +0.017 |

Subagent is ~60% of the review gap (clean 0.019, defect 0.017, subtle 0.031). Within it: cache write $0.010, output $0.005, read $0.002.

What the reviewer receives (M, bytes from the trace dir):

| item | bytes | tokens (E, ~3.6 B/tok) |
|---|---|---|
| agents/reviewer.md (its system prompt) | 5184 | ~1.4k |
| spawn prompt (names brief path) | ~230 | ~60 |
| brief.md read via Read, second call | 5268 | ~1.4k |
| of the brief: policy rules (19 rules, 6 packs, `policy-before-work.txt`) | 4237 (80%) | ~1.1k |
| of the brief: the diff (1-file, 2-line case) | ~700 | ~200 |

Subagent contexts: call 1 about 5.2k tokens (cc 768, cr 4460), call 2 about 7.2k. Its low cc on call 1 means the reviewer prefix was cache-hit from an earlier run, so a cold session pays more (not measurable here).

Duplication: the main thread never sees the diff or the rules (the payload is a path), so there is no diff duplication. The duplication is on the output side: the findings are written twice. The subagent writes ~500 tokens of JSON; the report then sits in the main context twice (the Agent tool_result, ~1.4 KB plus the harness hand-back wrapper, and the hook-printed readback, 1538 B); the main thread then writes them a third time in its final message. Output is the dearest token (9.9 vs 3.7 $/M).

Bare does the review in its thread: 2 calls, ~33k tokens processed (16.2k + 17k), $0.045. Plugin processes ~50k tokens (main 17.9k + 20.0k, subagent 5.2k + 7.2k).
Subtle: bare grows to 4-5 calls and 80k cache reads, so plugin is only +$0.012 there.

Net: the subagent is the largest single driver. The quality (1.0 vs 0.48-0.8) comes from the brief (diff with addressable lines + rules + dependents grep) and from a clean context; the cost is the second context plus the second copy of the answer.

Cuts that keep the reviewer (no regeneration loop, no policy edit):
- Spend the policy bytes only where they matter. 4.2 KB of rules ride on every review, even for a 2-line change. Selection already exists in code (packs by path glob and activity); narrowing which common packs go to `review` is code, not a policy edit. About $0.004/run (E). Quality risk: unmeasured; run review-* x3 to check ruleRefs use first.
- Stop the third copy: the readback step makes the main thread rewrite the report (Part 4 verbatim in a code fence). Have the hook print only what the main thread must emit, or let the final message be Part 1-3 plus a pointer. About $0.003-0.005 (E, 300-500 output tokens). Check the grader reads the final message before touching this.
- Not worth it: putting the brief in the spawn prompt. The main thread would emit 1.4k tokens of output (~$0.014) to save one cheap cache-read call (~$0.001).

## 2. Investigate (plugin about equals bare)

M, averages per case:

| case | plugin $ / turns | bare $ / turns | cc delta | cr delta | injected payload |
|---|---|---|---|---|---|
| files | 0.0636 / 2-7 | 0.0538 / 5-6 | +2.5k | -18.8k | read step 3363 B + map 1937 B + context-list 560 B |
| how | 0.0662 / 2-3 | 0.0506 / 2-6 | +2.8k | -1.8k | 3512 B + map 2088 B |
| nomatch | 0.0493 / 2 | 0.0530 / 4 | +0.5k | -32k | map empty |
| trace | 0.1149 / 4-14 | 0.1038 / 5-14 | +3.5k | -23.6k | 7457 B + map 5878 B |

Plugin makes fewer turns (the map answers what bare greps for, so cache reads fall by 19-32k, which is -$0.003 to -$0.005), but it pays the cache write of everything injected (+0.5k to +3.5k tokens at 3.72 $/M, +$0.002 to +$0.013). The two nearly cancel; the net delta is the injected text.

Map payload anatomy (M, JSON bytes; files / how / trace): `terms` 210/222/252, `candidates` 720/598/4208, `symbols` 905/1166/1264. Each symbol entry carries `"declarations":1,"collides":false` (~34 B), and symbols are repeated under every term key (8 entries, 4 unique, in files-1). Waste is ~270-340 B of boilerplate plus ~400 B of duplicate entries plus the 210-250 B `terms` block: ~0.2-0.3k tokens, ~$0.001/run (E). Small. Trace candidates (4.2 KB) is the lift on that case; do not cut it without a run.

## 3. Fixed prefix (plugin first call 17.6-18k vs bare 16.1-16.3k)

M: in both arms `cache_read` = 7230 on the first call (shared system prompt). The whole gap is cache creation: 10390 vs 9031 (+1.36k tokens, +$0.005/run). The stream-json trace does not contain the first user message or any UserPromptSubmit hook output (only the SessionStart hook shows, with output `{}`). The init message lists tools identical to bare (11, with `Task`); it adds agents `ambicode:reviewer`, `ambicode:scout` and skills `ambicode:*` (6). So the split below is from source, not from the trace.

| component | bytes | tokens (E) | evidence |
|---|---|---|---|
| `prompts/session-contract.md`, injected by UserPromptSubmit once per session (`deliverSharedContract`) | 950 | ~230 | source |
| SKILL.md body expanded by the typed `/ambicode:<skill>` (review 793 B file, ~560 B body; 600-1800 B for others) | ~560 | ~150 | source |
| Agent tool listing of `ambicode:reviewer` + `ambicode:scout` (descriptions ~330 + ~140 B, plus format) | ~600 | ~150 | source, assumes agents are listed |
| Route start message (hook-delivered; for review-skipped the short exit text) | ~600-1000 | ~200 | unmeasured |
| Prompt `/ambicode:review --task ... --headless ...` vs bare's one-line prompt | ~90 | ~25 | prompts |
| Skill-tool listing of 6 `ambicode:*` skills, if shown despite `disable-model-invocation: true` | 1.5-2 KB if shown | 0-500 | unverifiable here |
| Sum of attributable | | ~750-800 | |
| Unattributed remainder | | ~550-650 | likely the skill listing or tool-description text; the trace cannot show it |

Regression across cases (first call vs delivered step bytes: files 3363 B -> 18852; trace 7457 B -> 20515) gives ~0.4 tokens/byte and an intercept near 17.4k with no route text, so the fixed plugin overhead is ~1.2k tokens, in line with the table.

Cost: ~1.3k cc tokens is ~$0.005 per plugin run, paid on every case. That is 10% of review-skipped (0.0437 vs bare 0.045: it still comes out equal only because bare spends a second call on `git diff`).

Cheap probe to close the gap (the user decides; one call each, under $0.05): run a bare-arm prompt with `--plugin-dir` pointing at a plugin holding only the six skills (no agents, no hooks), and read first-call cc. Compare with the empty plugin (9031) for the skill-listing cost; repeat with only the agents for theirs.

## 4. Ranking

| # | driver | $/run | basis | fix | quality risk |
|---|---|---|---|---|---|
| 1 | Reviewer subagent: second context (rules 4.2 KB + agent prompt 5.2 KB + brief 1.4k tok), 2-3 calls, 0.5k output | 0.017 (clean 0.019, subtle 0.031) | E from M tokens | send fewer rule bytes by relevance (code selection, not a policy edit); keep the rest | low if rule use is checked on review-* x3 |
| 2 | Cache-write dominates everything: 10-13k written tokens per run, because the cwd/env text early in the system prompt differs per run | 0.04-0.05 of every run (both arms) | M tokens, E rates | not a plugin cost; only added written tokens count | - |
| 3 | Findings written 3 times (subagent JSON, readback hook text in main context, main final message) | 0.005 + 0.005 | E | shorten readback output and the hook-printed report; check the grader reads the final message | medium, final message is graded |
| 4 | Fixed prefix: contract + SKILL body + agent list + unidentified ~0.6k | 0.005 (every plugin run) | M tokens, source split E | probe the skill listing; drop or shorten agent descriptions; keep the contract (it is authoritative) | low |
| 5 | Investigate injected text (read step 3.4-7.5 KB + map 2-6 KB): +0.5k to +3.5k cc | 0.002-0.013, offset by -0.003 to -0.005 from fewer turns | M | trim map boilerplate/duplicate symbols (~0.3k tokens, ~$0.001); not the candidates | low for trimming, unmeasured for candidates |
| 6 | Main output: restating report in the final message | 0.001-0.002 | E | with #3 | see #3 |

Not done: no run was made; no code or policy was changed; the first user message and the Skill/Agent tool descriptions could not be read from the trace, so #4's split below ~0.8k attributed tokens is a bound, not a measurement.

# AMBICODE suite comparison for runs 24 25 26 and 27

The four suites pass all 108 attempts across the six shared cases; the bare baseline passes 17 of 18. Run 26 is the cheapest of the prompted suites, while run 25 is the cheapest and fastest plugin suite overall but has no captured task ledgers or UserPromptSubmit workflow payloads. Run 27 costs more and takes longer than run 26 despite identical recorded grounding content. The comparison uses the latest bare suite, run 22, restricted to the same six cases, and reports per-attempt metrics so the extra repetitions in runs 26 and 27 do not inflate the results.

## Scope and evidence

| Run | Variant | Cases | Attempts | All ledgers | Supplied glob | Ledgers with exit | Wall seconds | Suite cost USD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 22 | bare | 6 | 18 | 0 | 0 | 0 | 640 | 10.7722 |
| 24 | plugin with prompt | 6 | 18 | 18 | 6 | 16 | 224 | 3.1099 |
| 25 | plugin without prompt | 6 | 18 | 0 | 0 | 0 | 183 | 3.0668 |
| 26 | plugin with prompt | 6 | 36 | 36 | 12 | 34 | 394 | 6.1624 |
| 27 | plugin with prompt | 6 | 36 | 36 | 12 | 33 | 443 | 6.4891 |

Run 22 contains 21 cases and 63 attempts in total; only 18 attempts enter the matched comparison. Its wall time and suite cost above refer to the full 21-case suite. The shared cases are `be-vs-5075`, `be-vs-5766`, `be-vs-5903`, `fe-vs-438`, `fe-vs-6181`, `fe-vs-6269`. Each has 3 repetitions in runs 22, 24 and 25, and 6 in runs 26 and 27. All suites use `claude-sonnet-5-5`, Claude Code 2.1.292, concurrency 4 and threshold 1. The AMBICODE suites report plugin version 0.5.1. Identical version strings do not establish identical plugin source or configuration; saved artifacts do not include a complete plugin revision snapshot.

The supplied ledger glob matches the two cases without ticket-specific task directory names. All 90 saved ledgers are collected, including task directories ENG-16, REBA-11, US-04 and IM-17. The glob itself matches 30 ledgers. Run 25 contributes 0 ledgers; its live hooks remain visible in session logs. Raw aggregates, traces and session logs for all five suites are retained under `raw/`, and ledgers are also collected under `ledgers/`. `manifest.json` records source paths, sizes and SHA-256 hashes.

## Matched suite metrics

Evaluator costUsd includes judging: total cost equals model execution cost plus judgeCostUsd in every attempt. Model execution cost below uses trace total_cost_usd, and judging is listed separately. Token totals use cumulative modelUsage; per-request context uses the parent session log.

| Metric per attempt | 22 | 24 | 25 | 26 | 27 |
| --- | --- | --- | --- | --- | --- |
| Harness turns | 8.33 | 9.39 | 8.94 | 9.39 | 9.44 |
| Model requests | 7.94 | 7.61 | 7.89 | 7.67 | 7.61 |
| Tool calls | 7.33 | 8.39 | 7.94 | 8.39 | 8.42 |
| Model cost USD | 0.1608 | 0.1685 | 0.1669 | 0.1672 | 0.1751 |
| Judge cost USD | 0.0029 | 0.0043 | 0.0035 | 0.0040 | 0.0052 |
| Duration seconds | 34.61 | 42.72 | 36.89 | 40.06 | 46.17 |
| Reported API duration ms | 23,421 | 26,994 | 25,690 | 25,878 | 30,431 |
| Fresh input tokens | 16 | 15 | 16 | 15 | 15 |
| Cache created tokens | 25,560 | 26,360 | 26,369 | 26,101 | 27,682 |
| Cache read tokens | 177,404 | 171,713 | 182,958 | 172,444 | 177,612 |
| All input tokens across requests | 202,980 | 198,089 | 209,342 | 198,561 | 205,309 |
| New input tokens | 25,576 | 26,376 | 26,384 | 26,117 | 27,697 |
| Output tokens | 2,310 | 2,866 | 2,481 | 2,825 | 2,881 |
| First request context tokens | 16,219 | 18,524 | 16,929 | 18,522 | 18,530 |
| Peak request context tokens | 32,254 | 33,054 | 33,063 | 32,795 | 34,376 |
| Tool result bytes | 33,244 | 29,742 | 33,468 | 29,172 | 32,970 |
| Direct Read attempts | 0.44 | 0.61 | 0.72 | 1.03 | 1.00 |
| Inferred Bash read operands | 4.61 | 6.11 | 3.56 | 5.14 | 5.11 |
| Unique read target paths | 4.11 | 5.67 | 3.39 | 4.92 | 5.36 |
| Observed hook time ms | 0 | 533 | 374 | 491 | 623 |
| Path error calls | 0.39 | 0.28 | 0.72 | 0.44 | 0.36 |

All four AMBICODE suites score 1.0 on every attempt. The bare suite passes 17/18 matched attempts with mean score 0.9815. Across the full bare suite it passes 59/63 attempts with mean score 0.9788. Case pass counts and overall attempt pass rates have different denominators; see the original aggregate metadata in `metrics.json`.

## Differences from bare and between suites

| Comparison | Turns | Tools | Model cost | Duration | Peak context | All input |
| --- | --- | --- | --- | --- | --- | --- |
| 22 to 24 | 12.67% | 14.39% | 4.74% | 23.43% | 2.48% | -2.41% |
| 22 to 25 | 7.33% | 8.33% | 3.77% | 6.58% | 2.51% | 3.13% |
| 22 to 26 | 12.67% | 14.39% | 3.93% | 15.73% | 1.68% | -2.18% |
| 22 to 27 | 13.33% | 14.77% | 8.85% | 33.39% | 6.58% | 1.15% |
| 24 to 25 | -4.73% | -5.30% | -0.93% | -13.65% | 0.02% | 5.68% |
| 24 to 26 | 0.00% | 0.00% | -0.77% | -6.24% | -0.78% | 0.24% |
| 24 to 27 | 0.59% | 0.33% | 3.93% | 8.06% | 4.00% | 3.64% |
| 25 to 26 | 4.97% | 5.59% | 0.16% | 8.58% | -0.81% | -5.15% |
| 25 to 27 | 5.59% | 5.94% | 4.90% | 25.15% | 3.97% | -1.93% |
| 26 to 27 | 0.59% | 0.33% | 4.73% | 15.26% | 4.82% | 3.40% |

Percentages compare the mean of the six case means, giving every case equal weight. Negative means the later run uses less. These are observed differences, not a causal estimate: executions occurred at different times, prompts and plugin behavior differ, and there are only six matched tasks. Pairwise per-case deltas are in `comparisons.csv`; totals and mean, median, p95, min, max and standard deviation are in `metrics.json`. Suite wall times cannot be compared directly across different suite sizes.

Compared with bare, run 26 adds 3.93% model cost and 15.73% attempt duration, while mean peak context rises 1.68%. Run 27 adds 8.85% cost and 33.39% duration over bare. Relative to run 26, run 27 increases model cost 4.73%, duration 15.26% and peak context 4.82%, with unchanged pass rate. The largest added cost and context come from fe-vs-6269: its mean model cost rises $0.0316 and peak context rises 5,331 tokens. The largest duration increase is fe-vs-438 at 17.67 seconds per attempt. Reported mean API time also rises from 25.88 to 30.43 seconds between runs 26 and 27. Mean grounding time rises from 2.80 to 3.25 seconds and observed hooks from 0.49 to 0.62 seconds, so the recorded slowdown extends beyond hooks and grounding. These phase measurements are not an exact additive decomposition of attempt duration. The case contributions show where to investigate; they do not establish the cause.

## Case results and variability

| Case | Run | Passes | Mean turns | Mean tools | Model USD | Seconds | Peak context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| be-vs-5075 | 22 | 3/3 | 8.33 | 7.33 | 0.2017 | 32.00 | 39,270 |
| be-vs-5075 | 24 | 3/3 | 14.33 | 13.33 | 0.2097 | 41.67 | 40,571 |
| be-vs-5075 | 25 | 3/3 | 9.33 | 8.33 | 0.2177 | 38.67 | 41,257 |
| be-vs-5075 | 26 | 6/6 | 14.33 | 13.33 | 0.2186 | 39.33 | 41,964 |
| be-vs-5075 | 27 | 6/6 | 13.50 | 12.50 | 0.2080 | 39.17 | 39,923 |
| be-vs-5766 | 22 | 3/3 | 11.33 | 10.33 | 0.1945 | 39.67 | 35,561 |
| be-vs-5766 | 24 | 3/3 | 6.33 | 5.33 | 0.1432 | 31.00 | 30,067 |
| be-vs-5766 | 25 | 3/3 | 11.67 | 10.67 | 0.1838 | 39.00 | 34,638 |
| be-vs-5766 | 26 | 6/6 | 7.50 | 6.50 | 0.1565 | 33.33 | 31,491 |
| be-vs-5766 | 27 | 6/6 | 7.33 | 6.33 | 0.1655 | 31.67 | 35,128 |
| be-vs-5903 | 22 | 2/3 | 8.00 | 7.00 | 0.1618 | 27.33 | 33,067 |
| be-vs-5903 | 24 | 3/3 | 8.00 | 7.00 | 0.1421 | 34.67 | 28,427 |
| be-vs-5903 | 25 | 3/3 | 7.67 | 6.67 | 0.1612 | 28.67 | 33,487 |
| be-vs-5903 | 26 | 6/6 | 7.17 | 6.17 | 0.1370 | 29.50 | 28,217 |
| be-vs-5903 | 27 | 6/6 | 8.17 | 7.17 | 0.1465 | 39.17 | 29,117 |
| fe-vs-438 | 22 | 3/3 | 6.00 | 5.00 | 0.1253 | 37.67 | 27,866 |
| fe-vs-438 | 24 | 3/3 | 8.67 | 7.67 | 0.1559 | 48.67 | 29,856 |
| fe-vs-438 | 25 | 3/3 | 9.33 | 8.33 | 0.1426 | 39.00 | 28,468 |
| fe-vs-438 | 26 | 6/6 | 8.33 | 7.33 | 0.1501 | 44.17 | 29,337 |
| fe-vs-438 | 27 | 6/6 | 7.67 | 6.67 | 0.1557 | 61.83 | 30,150 |
| fe-vs-6181 | 22 | 3/3 | 9.33 | 8.33 | 0.1306 | 35.33 | 26,219 |
| fe-vs-6181 | 24 | 3/3 | 6.67 | 5.67 | 0.1429 | 42.00 | 31,024 |
| fe-vs-6181 | 25 | 3/3 | 8.33 | 7.33 | 0.1277 | 34.33 | 26,908 |
| fe-vs-6181 | 26 | 6/6 | 8.33 | 7.33 | 0.1397 | 42.83 | 28,579 |
| fe-vs-6181 | 27 | 6/6 | 7.33 | 6.33 | 0.1420 | 44.50 | 29,423 |
| fe-vs-6269 | 22 | 3/3 | 7.00 | 6.00 | 0.1512 | 35.67 | 31,539 |
| fe-vs-6269 | 24 | 3/3 | 12.33 | 11.33 | 0.2171 | 58.33 | 38,382 |
| fe-vs-6269 | 25 | 3/3 | 7.33 | 6.33 | 0.1684 | 41.67 | 33,618 |
| fe-vs-6269 | 26 | 6/6 | 10.67 | 9.67 | 0.2012 | 51.17 | 37,184 |
| fe-vs-6269 | 27 | 6/6 | 12.67 | 11.50 | 0.2328 | 60.67 | 42,514 |

| Run | Turn median | Turn p95 | Turn max | Duration p95 | Peak context p95 | Peak context max | Cost p95 USD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 22 | 8.00 | 13.00 | 13 | 43.75 | 40,479 | 41,583 | 0.2135 |
| 24 | 8.00 | 15.60 | 19 | 59.30 | 42,842 | 54,747 | 0.2380 |
| 25 | 8.50 | 12.15 | 13 | 43.30 | 41,207 | 43,539 | 0.2160 |
| 26 | 8.50 | 15.25 | 17 | 51.00 | 44,397 | 47,697 | 0.2364 |
| 27 | 8.00 | 16.00 | 19 | 75.25 | 50,095 | 50,686 | 0.2587 |

## Turns tools and files read

| Tool total | 22 | 24 | 25 | 26 | 27 |
| --- | --- | --- | --- | --- | --- |
| Bash | 115 | 107 | 100 | 206 | 195 |
| Glob | 2 | 2 | 4 | 5 | 4 |
| Grep | 7 | 31 | 26 | 54 | 68 |
| Read | 8 | 11 | 13 | 37 | 36 |

A turn is the evaluator count, checked against trace num_turns. In the matched attempts this counts tool executions plus final responses, so parallel tool calls can make it larger than the number of model requests. API messages are grouped by message ID so streamed text, thinking and tool blocks are not counted as extra requests. Tool calls are deduplicated by tool-use ID. A ledger turn event summarizes a segment at a hook boundary, sometimes the whole investigation; it is not an API turn. turns.csv retains per-request context and usage, and toolcalls.csv retains exact inputs, result size, errors and source line references. The full bare suite contains one subagent execution outside the matched cases; its cumulative modelUsage includes the subagent, but its session context and per-request table cover the parent session.

`files_read.csv` lists direct Read attempts and explicit operands of Bash cat, sed, head, tail, awk and related reading commands. Bash operands are inferred attempts, with unresolved globs preserved; shell conditionals, failed cd commands, dynamic expressions and shell state can make an inferred path inaccurate. Search commands are recorded in `toolcalls.csv` but excluded from read counts because they do not reliably identify all files scanned. Hidden reads inside AMBICODE grounding, grep/rg traversals and subprocesses cannot be enumerated from these artifacts. Map candidates are suggestions, not confirmed reads. Direct Read success follows its returned error flag; Bash operand success is unknown.

| Run | Most repeated read targets |
| --- | --- |
| 22 | src/controllers/AnalyticsController.ts (7); src/models/Organization.ts (6); main/components/tables/user-table/user-table.component.ts (6); main/features/score-types/nom/shared/wizards/nom-general-data/services/nom-general-data-form.service.ts (5); src/utils/ReportHelper.ts (4) |
| 24 | main/features/score-types/nom/shared/wizards/nom-general-data/services/nom-general-data-form.service.ts (8); src/controllers/AnalyticsController.ts (7); src/models/Organization.ts (6); src/features/score-types/reba-rula/reba/reba.controller.ts (4); repo/src/models/Organization.ts (4) |
| 25 | src/controllers/AnalyticsController.ts (8); src/controllers/ReportController.ts (5); main/components/tables/user-table/user-table.component.ts (5); main/components/tables/user-table/user-table.component.html (5); main/features/score-types/nom/shared/wizards/nom-general-data/services/nom-general-data-form.service.ts (5) |
| 26 | src/controllers/AnalyticsController.ts (12); main/components/tables/user-table/user-table.component.ts (12); main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html (12); main/components/inputs/employee-select/employee-select.component.ts (11); main/features/score-types/nom/shared/wizards/nom-general-data/services/nom-general-data-form.service.ts (11) |
| 27 | main/features/score-types/nom/shared/wizards/nom-general-data/services/nom-general-data-form.service.ts (13); main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html (10); src/controllers/AnalyticsController.ts (8); main/components/inputs/employee-select/employee-select.component.ts (8); main/components/tables/user-table/user-table.component.ts (8) |

## Hooks guards and citation correction

| Hook evidence | 22 | 24 | 25 | 26 | 27 |
| --- | --- | --- | --- | --- | --- |
| SessionStart | 0 | 18 | 18 | 36 | 36 |
| PreToolUse | 0 | 35 | 29 | 46 | 61 |
| Stop | 0 | 18 | 18 | 36 | 36 |
| Blocking Stop errors | 0 | 0 | 0 | 0 | 1 |

Hook execution counts above are successful session attachments. UserPromptSubmit is separately visible as additional-context payloads: 18 in run 24, 36 in run 26 and 36 in run 27; run 25 and bare have none. Payload attachments do not count as additional executions. Stop summaries capture 18, 18, 36 and 37 Stop attempts respectively in runs 24–27; run 27 includes one blocked attempt and its successful retry. PreToolUse hooks that return no observable attachment may be absent from these counts. Observed hook time sums non-Stop success durations and Stop summary durations without double-counting successful Stop attachments. It excludes grounding time and is not complete end-to-end instrumentation.

Recorded hook blocks or permission denials: 1. Evaluation safety graders check no Edit/Write under repo/src and no benchmark peeking through Bash/Glob/Grep/Read. They all pass in the matched attempts. These narrow graders are not proof that every possible shell write, out-of-scope read or citation is safe. `guards.csv` separates grader outcomes, hook blocks and harness permission denials.

Run 27, case `fe-vs-6269`, repetition 6, trace `e-u8Wcra`: the Stop citation guard rejected a reference to line 76 of nom-general-data-detail.component.ts because the file has 70 lines. The model made one further Grep call and rewrote the answer; the second Stop attempt succeeded. Evidence: `raw/27_0733_curated-ambicode-with-prompt-sonnet-5-5/traces/sessions/e-u8Wcra/38625276-0b05-4327-9198-a306cb714b74.jsonl` line 80.

## Grounding payloads and context size

| Run | Ground ms per attempt | Map bytes | Delivered bytes | Delivered tokens | Map candidates | Map limitations | Ledger turn events |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 24 | 3,069 | 6,014 | 2,172 | 543 | 27 | 12 | 16 |
| 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 26 | 2,799 | 6,014 | 2,172 | 543 | 27 | 12 | 34 |
| 27 | 3,245 | 6,014 | 2,172 | 543 | 27 | 12 | 34 |

Zeros for runs without ledgers mean no recorded ledger events, not measured zero runtime or zero grounding cost. Ledger `map.bytes` describes the map artifact; only delivered step `payloadBytes`/`payloadTokens` describe the workflow payload. They must not be added as though both were delivered to the model. Peak context is the maximum per-message sum of fresh input, cache-created input and cache-read input. It excludes output tokens and is comparable across suites. All-input totals sum across requests and include repeated cached prefixes, so they measure request volume rather than a single context window. New input equals fresh plus cache-created tokens. `prompt_context.csv` records system snapshot sizes and hashes; snapshot bytes are not tokenizer measurements and repeated snapshots are not cumulative context growth.

Map limitations, candidate paths, passes, terms, collisions, index mode and timing layers are retained in `maps.jsonl`. Policy ledgers have 0 rules applied in total and 2700 rules omitted in total; these policy records should not be interpreted as executed guard checks.

| Case | Maps | Candidate count | Listed paths | Map bytes | Limitations | Content variants |
| --- | --- | --- | --- | --- | --- | --- |
| be-vs-5075 | 15 | 22 | 20 | 6074 | 9 | 1 |
| be-vs-5766 | 15 | 22 | 20 | 5886 | 13 | 1 |
| be-vs-5903 | 15 | 26 | 20 | 6069 | 7 | 1 |
| fe-vs-438 | 15 | 28 | 20 | 6069 | 13 | 1 |
| fe-vs-6181 | 15 | 34 | 20 | 6101 | 15 | 1 |
| fe-vs-6269 | 15 | 28 | 20 | 5884 | 12 | 1 |

For every case, all 15 maps across runs 24, 26 and 27 have identical candidate paths, terms, limitations, decisions, tuning and map byte size. Every map uses tuning hash 3bd1fbc43250, index=none, default layers and no profile. Each executes shortlist, harvest and a second shortlist, listing 20 paths. The grounding content cannot explain the changes in model behavior between these prompted suites. Startup workflow payload bytes and estimated tokens are also identical per case. Timing differs, and changes outside these recorded fields remain possible.

| Run | Layer | Mean ms | Median ms | P95 ms |
| --- | --- | --- | --- | --- |
| 24 | shortlist pass 1 | 1,451 | 1,466 | 2,915 |
| 24 | harvest | 5 | 5 | 9 |
| 24 | shortlist pass 2 | 1,288 | 1,166 | 2,682 |
| 26 | shortlist pass 1 | 1,324 | 1,279 | 2,214 |
| 26 | harvest | 5 | 4 | 8 |
| 26 | shortlist pass 2 | 1,177 | 1,148 | 2,092 |
| 27 | shortlist pass 1 | 1,567 | 1,483 | 2,804 |
| 27 | harvest | 8 | 5 | 25 |
| 27 | shortlist pass 2 | 1,337 | 1,198 | 2,442 |

The map limitations repeatedly report capped ranking at 200 matches for broad terms, omitted tests/styles/markup/data outside the configured shortlist, and little co-change evidence because only one repository commit is available. Both candidate inclusion and exclusion matter to completeness. All 90 routes are trusted headless investigate routes delivered through the hook channel. Each records template skipped, fetch skipped, ground completed, scope skipped and read delivered; only the read step is delivered to the model, with a workflow budget of 1 model step out of 6 allowed. This workflow step count is distinct from the harness turns and model requests above.

## File identification quality beyond the grader

The names-a-true-file grader only requires at least one merged file, and has weight 3 of a total 9. A perfect score does not imply the entire proposed file list is necessary, complete or precise. The lexical proxy below compares paths in the final Files section to the grader’s merged-file list. It measures overlap with that historical list; plausible additional files can reduce precision, and formatting can reduce measured recall. It is supplementary, not a replacement for the grader.

| Run | Mean merged file recall proxy | Mean merged file precision proxy |
| --- | --- | --- |
| 22 | 55.56% | 56.05% |
| 24 | 79.30% | 67.27% |
| 25 | 63.16% | 54.92% |
| 26 | 64.75% | 63.57% |
| 27 | 64.02% | 62.49% |

Exact proposed paths, expected paths and overlaps are retained in `samples.json` and `samples.csv`.

The lone matched bare failure is be-vs-5903 repetition 1, trace e-icQzjQ, with three FAIL judge votes and score 2/3. Its answer emphasizes upload enforcement rather than the historically merged organization settings files; its Files section still conditionally names Organization.ts, so a lexical path hit and a judge PASS are different measures. Conversely, run 26 trace e-Ez78YY passes the judge while listing employee-select paths without their main/ prefix, which produces zero exact lexical overlap. These cases show why grader pass rate alone should not be treated as exact file-list accuracy.

## Ledger gaps and verification

| Run | Case | Rep | Trace | Ledger |
| --- | --- | --- | --- | --- |
| 24 | fe-vs-438 | 2 | e-4WSBOv | raw/24_0648_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-4WSBOv/home/cwd/repo/.ambicode/task/repository-at-repo-ticket-below/ledger.jsonl |
| 24 | fe-vs-6269 | 1 | e-rt8VD0 | raw/24_0648_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-rt8VD0/home/cwd/repo/.ambicode/task/IM-17/ledger.jsonl |
| 26 | be-vs-5903 | 3 | e-buOl1k | raw/26_0720_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-buOl1k/home/cwd/repo/.ambicode/task/US-04/ledger.jsonl |
| 26 | fe-vs-438 | 2 | e-Ez78YY | raw/26_0720_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-Ez78YY/home/cwd/repo/.ambicode/task/repository-at-repo-ticket-below/ledger.jsonl |
| 27 | be-vs-5075 | 5 | e-aCDRkO | raw/27_0733_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-aCDRkO/home/cwd/repo/.ambicode/task/ENG-16/ledger.jsonl |
| 27 | be-vs-5903 | 5 | e-ypRse4 | raw/27_0733_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-ypRse4/home/cwd/repo/.ambicode/task/US-04/ledger.jsonl |
| 27 | fe-vs-6181 | 6 | e-UvHjWj | raw/27_0733_curated-ambicode-with-prompt-sonnet-5-5/traces/ledgers/e-UvHjWj/home/cwd/repo/.ambicode/task/repository-at-repo-ticket-below/ledger.jsonl |

Missing exit events affect ledger completion and segment-level usage summaries, but the aggregate and trace results remain available. The citation-corrected run 27 trace does close with complete=true and reason=done, but retains unverified=1. Its ledger has one stop-block limit event and two segment turns. The suite pass and a complete exit therefore do not establish that every evidence item was verified.

447 evidence files were copied with matching SHA-256 hashes. 171/171 attempts pass all cross-artifact checks. Checks cover trace presence, session count, turns, model cost, usage totals and ledger peak context when recorded. See `validation.json` for every check and exception.

## Interpretation and next measurements

On these six tasks, run 22 has the lowest mean model cost, run 22 the shortest mean attempt duration, and run 22 the lowest mean peak context. All AMBICODE variants achieve the same full score, so this sample primarily distinguishes execution cost and workflow behavior. Run 25 demonstrates that loading the plugin alone does not guarantee an investigation workflow was routed. Prompted runs show task routing and grounding in every attempt; incomplete closing records make ledger-only operational comparisons unreliable. Among the prompted suites, run 26 is cheaper and faster than run 24 with lower mean peak context, and run 27 does not improve the scored outcome. The richer workflow improves observed file-list overlap relative to bare, especially in run 24, while retaining a measurable cost and latency overhead.

For a stronger comparison, use the same case repetitions, preserve plugin commit and config hashes, capture hook execution start/end and hidden grounding file reads, and evaluate file-list precision and recall alongside the current one-hit grader. Interleave variants to reduce timing effects. These results do not isolate which plugin change caused a difference between runs 24, 26 and 27.

## Output files

| File | Contents |
| --- | --- |
| report.md | Full analysis |
| report.html | Standalone readable report |
| metrics.json | Suite and case statistics plus all pairwise comparisons |
| samples.csv and samples.json | One record per evaluation attempt including bare full suite |
| case_metrics.csv | Comparable per-case means |
| comparisons.csv | All ten suite pairs and metric deltas |
| turns.csv | Per-request usage and context |
| toolcalls.csv | Tool inputs, errors, result bytes and evidence locations |
| files_read.csv | Direct reads and inferred shell operands |
| hooks.csv | Session hook evidence and Stop summaries |
| guards.csv and graders.csv | Guard evidence and graded outcomes |
| maps.jsonl | Grounding maps and limitations |
| map_analysis.csv | Per-case stability and map characteristics |
| grounding_layers.csv | Layer timing statistics |
| ledger_events.jsonl | Combined ledger stream with suite and case identity |
| prompt_context.csv | System prompt snapshot size and hashes |
| findings.jsonl | Capture gaps and tool error signals |
| manifest.json | Copied source paths and SHA-256 hashes |
| validation.json | Cross-artifact reconciliation |
| raw and ledgers | Collected original evidence |
| analyze.py | Reproducible analysis script |

Reproduce with `python3 analyze.py --source /Users/KillBill/Documents/projects/mine/ai/ambicode-evals-assets/outputs/core/2026-10-07 --output /Users/KillBill/Documents/projects/mine/ai/ambicode/eval-replay/evals/24-25-26-27`. All reported timestamps in raw artifacts retain their source UTC representation; suite labels and the report date correspond to 7 October 2026 in Europe/Warsaw.

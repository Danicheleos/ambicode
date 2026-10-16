# task-fix time profile: plugin vs bare (2026-10-15)

Sources: plugin traces `evals/cases/results/traces/plugin/2026-10-14T23-04-41-104Z/task-fix-{1,2,3}.jsonl` (+ `.ambicode` ledgers), bare traces `.../bare/2026-10-15T06-55-42-563Z/task-fix-{1,2,3}.jsonl`. Times are trace timestamps; "output gen" is an estimate (see notes).

## Result
Plugin 14.5 s (11.2 / 14.7 / 17.5), bare 4.7 s (3.7 / 6.1 / 4.3), ratio 3.07. Calls 5.7 vs 3.0. Plugin has no route start/next/plumbing model calls: the route is hook-driven and format, review-offer gate, report all run inside the `check` call (ledger: 0.31-0.36 s). The extra time is real work (check, test edit, report) plus one retry round in 2 of 3 runs.

## Per-run call table (plugin)
Call types in order; gap = seconds from previous tool result to the call's first event.

| run | calls | sequence (gap s) | check bash wall / jest ms |
|---|---|---|---|
| 1 | 6 | Read+Glob(node_modules, 4.7 KB) 1.4 / Edit src+Read test 1.5 / Edit test 1.4 / check **FAILED** (paths `repo/...`) 1.2 / re-check 1.2 / report (382 out tok) 2.4 | 1.23 s + 1.30 s / 685 + 482 ms |
| 2 | 5 | Read 0 / Edit src+Glob 1.3 / Read test 0.9 / Edit test+check 0.8 / report (346 tok) 2.3 | 1.86 s / 805 ms |
| 3 | 6 | Read+Glob(4.6 KB) / Edit+Read 1.7 / Edit 2.0 / check FAILED 1.5 / re-check 2.8 / report (387 tok) 2.9 | 1.12 s + 1.55 s / 572 + 698 ms |

Bare (all 3 runs): Read src (1.2-2.6 s) / Edit (1.0-1.4) / final text of 96-106 tokens. No test read, no test run. Run 3 used sed via Bash.

Tokens per call (plugin run 1, uncached / cache-write / cache-read): 2/11999/7230, 2/2519/19229, 2/484/21748, 2/344/22232, 2/482/22576, 2/871/23058. Bare run 1: 2/8858/7230, 2/143/16088, 2/245/16231.
Result-usage output tokens: plugin 1293 / 1075 / 1267 (mean 1212), bare 312 / 322 / 272 (mean 302).

## Time split (mean per run, seconds)

| bucket | plugin | bare | delta |
|---|---|---|---|
| session total | 14.5 | 4.7 | +9.8 |
| model output generation (est. 1212 vs 302 tok at ~290 tok/s) | 4.2 | 1.0 | +3.2 |
| model latency / input (calls x ~1.2 s; 5.7 vs 3.0 calls, incl. call-1 startup) | 7.2 | 3.4 | +3.8 |
| tool exec: Read/Edit/Glob/sed | 0.3 | 0.3 | 0 |
| tool exec: `check` Bash call (jest 1.08 s + ~0.25 s node boot + ~0.3 s in-process format/gate/report) | 2.35 | 0 | +2.35 |
| hooks: UserPromptSubmit (route start, baseline, map, policy; ledger 0.21-0.23 s) | 0.2 | 0 | +0.2 |
| hooks: Stop (last assistant -> exit record, 0.17-0.22 s) | 0.2 | 0 | +0.2 |
| plumbing model calls (route next/start, context, etc.) | 0 | 0 | 0 |

Notes: model total = session minus measured tool/hook time (plugin 11.4, bare 4.4). The split of model time into generation vs latency is a fit: with ~16-token calls the gap is 0.8-1.7 s; report calls (~370 tok) take 2.3-2.9 s, so ~1.2-1.5 s per ~350 tokens. Unverified beyond that. SessionStart hook returns `{}`; PreToolUse guard is not visible on Read/Edit/Glob (0.04-0.14 s each). `check` runs only `jest --findRelatedTests` on the given files (0.48-0.81 s), not the suite and not lint.

## Cost split (USD per run, from result usage at 2/10/0.1/4 per Mtok; matches total_cost_usd)

| bucket | plugin | bare | delta |
|---|---|---|---|
| cache write (15.8k vs 9.3k tok) | 0.0631 | 0.0374 | +0.0257 |
| cache read (105.7k vs 39.8k tok) | 0.0106 | 0.0040 | +0.0066 |
| output (1212 vs 302 tok) | 0.0121 | 0.0030 | +0.0091 |
| uncached input | ~0 | ~0 | 0 |
| total | 0.0858 | 0.0444 | +0.0414 |

Plugin-injected bytes: first-call prefix is +3.1k tokens over bare (cache-write 11.9-12.0k vs 8.9-9.1k, ~$0.012). Known parts: `change` step message 4794 B (hook-delivered) of which `policy:before-work` 2964 B (12 rules, 11 irrelevant to a one-line fix: comments, async, naming, callers...), brief 74 B, runnable checks 56 B, context.list 144 B ("no context: run /ambicode:init"); SKILL.md 1546 B; six ambicode skill descriptions in the skill list ~1.7 KB. Later steps: `write` step message 1576 B (CLI reply) incl. generated Evidence/Not verified. Second call adds +2.5k cache-write in runs 1 and 3 from the Glob of node_modules (4.6-4.7 KB result, ~$0.009 plus re-reads, ~$0.011 total).

## What bare fails
Bare 0.667: grader `test-added` = 0 in all three runs (no regression test; bare run 2's final text says "I haven't run it"). It passes fix-correct, existing-tests-kept, no-git-mutation. The plugin also passes format-recorded, report-sections, route-done (not scored for bare). The plugin's quality gain on shared graders is exactly the test added and run.

## Top 3 contributors the plugin adds

| # | contributor | numbers | class |
|---|---|---|---|
| 1 | extra model calls for test read/edit/check/report (+2.7 calls) plus check wall | +3.8 s latency, +2.35 s check bash, +$0.02 | (b) buys test-added; part (a) below |
| 2 | longer output: test edit, check commands, ~370-token report | +910 tokens, +3.2 s gen (est.), +$0.0091 | (b) report/test; paste of generated sections is (a)-ish |
| 3 | failed first `check` round (paths `repo/tests/...` with app root `repo/` -> "No tests found", exit 1) | runs 1 and 3 only: 1 model call + 1 check ~= 3.5-4 s each, mean ~2.4 s, ~$0.004; also adds a green-unproven limit to the record | (c) in the eval layout (repo nested under cwd), but (a) in design: any monorepo/subdir user can hit it |

Prefix growth (+3.1k tok, $0.012, ~0 s) is the biggest cost item but not a time item.

## Proposals for class (a), language-agnostic

1. `check` accepts `--file` paths relative to the invoking cwd as well as the project root (strip the project-root prefix before handing to the runner; fall back to the other base if the file does not exist). Removes the failed round: mean -2.4 s per run (-17%), ~-$0.004, and the false green-unproven limit. Highest value, small code change in the check path resolver.
2. Have the map/ground step name the test files that sit beside or mirror the changed source (basename match, any language) and print them in the `change` payload, and tell the model to Read source and test in the same first call. Removes the separate test Read call and the exploratory Glob that dumped node_modules in 2 of 3 runs: ~-1.2 s, ~-$0.011 (2.3k tokens of Glob result written once and re-read 4 times). Currently map returns 0 candidates for this case.
3. Filter `policy:before-work` text to rules relevant to the stated activity/diff size (or list rule ids and fetch text on demand): 2964 B -> ~600 B for a one-line fix. Saves ~0.6k tokens of cache write: ~-$0.003 (-4%), ~0 s. Small; do it only if cost matters.
4. Report: the model pastes the generated Evidence and Not verified sections (~560 B, ~150 tokens, ~0.5 s). If a mechanism existed to append them without the model (a Stop hook cannot edit the last message, so this needs a different route, unverified) it would save ~0.5 s and ~$0.0015. Do not shorten Done/Remaining: the report-sections grader and the honesty value depend on them.

Combined expected: proposals 1+2 take the mean from 14.5 s to roughly 11 s (3.1x -> ~2.3x), cost $0.086 -> ~$0.07. The remaining gap is the test edit, check and report, which buy `test-added`. No route step merge is warranted: the route steps (format, gate, report-step) already cost 0.3 s inside the check call and 0 model calls.

## Not done
No paid runs, no edits to src/routes. Output-gen vs latency split and the prefix breakdown are estimates from token counts and byte sizes, not measured per phase (trace has no per-token timing).

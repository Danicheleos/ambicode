# auditor handoff — it-010 (cp-S0 pre-tag audit, last three decisions it-008..it-010) — b80bd72

Verdict: **cp-S0: go with notes.** Every cp-S0 go criterion in 03 §1 holds against the files. Nothing blocks the tag. Three should-fix items should land in the same commit as `cp-S0.md` (F1, F2, F3). The headline finding is not a defect but a limit: on this reference T2 review does not exercise the plugin (0 of 24), and the decision's stated cause ("Sonnet") is untested and contradicted by the campaign's own preflight data (F2).

## Ran
Wall times: every command below finished in under a few seconds; none was individually timed.
- `git status --short` → exit 0; output: ` M gym/plan/supervisor/policy.mjs`, ` M gym/plan/supervisor/test/policy.test.mjs`, `?? gym/runs/R1/supervisor.out`; nothing else dirty
- `cd gym/runs/R1 && shasum -a 256 -c archive/MANIFEST.txt | grep -vc ': OK$'` → prints `0`; same with `grep -c ': OK$'` → `318`
- `git diff --stat gym/R1/it-003 HEAD -- . ':!gym'` → exit 0, **not empty**: 5 files (see F5). `git diff --quiet gym/R1/it-003 HEAD -- src skills prompts policies hooks` → exit 0 (product surfaces identical)
- `git diff --name-only gym/R1/it-009 HEAD -- . ':!gym'` → empty
- `sha256sum gym/plan/*.md | sha256sum` → `c2c756c67bbaf32eb70c26ccff900b8711c74e2af6b29de965411c4eed66dd64`
- `git tag -l 'gym/R1/*'`; `git rev-parse gym/R1/it-010 HEAD` → both `b80bd72de7fa5b6b2896143b580af3567a02d57f`; `git log --format=... --date=iso -14`; `git worktree list`; `git stash list`
- `node --input-type=module -e '<own re-implementation of scoreAnswer/namedFiles and per-run-index medians, reading it-010/scratch/t2-sonnet.json and the case truth files>'` → exit 0 (first attempt was denied by the guard, write-outside-roots false positive on a regex literal after `=>`; rewrote the same read-only script without that token, did not touch anything else)
- `node -e` over the 108 trace files named by the result (init rows, assistant-message models, Skill tool_use and tool_result, `ambicode` Bash sub-commands) → exit 0
- `node -e` over `it-006/scratch/aa-1`, `aa-2` (medium+ finding paths per run, own stability, set agreement) → exit 0
- `jq` over `it-006/scratch/triggers/2026-09-29T10-26-31-324Z/aggregate-result.json`, `it-*/metrics.json`, `baseline/metrics*.json`, `labels/labels.json`, `supervisor/state.json`
- `find evals/evals-core/cases -type f | sort | xargs sha256sum | sha256sum` → `2f7470fd...8212` (equals `it-010/scratch/cases.sha256`)
- `shasum -a 256 benchmarks/reviewer-recordings.json` → prefix `b4d778c9ab0e3a6d8264dc0a` (the owner-restored value, `baseline/metrics-R-1.json:50`)
- Reads: 01, 02, 03, 04 plan files; it-008/009/010 brief, decision, metrics, diff.patch, handoffs; STATE.md, cp-budget-50/200.md, CAMPAIGN.md, OWNER-INBOX.md, labels/pending.md, labels.json

## Numbers
### cp-S0 go criteria (03 §1 row cp-S0)
| criterion | value | verdict | from |
|---|---|---|---|
| G1 exit 0 | exit 0 at it-009 (804 tests, 803 pass, 0 fail, 1 skipped); it-010 did not rerun, product tree unchanged since (`git diff it-009 HEAD` outside gym is empty) | met, but the file's own G1 block is stale and its log pointer is wrong (F1) | `it-009/verify.log:1113-1116`, `it-009/metrics.json` G1; `baseline/metrics-R-1.json:15-21` |
| T1 once, every scored case recorded | 8 cases: 7 scored at 1.0, `url-bare` 0.4 (diagnostic); `partial: false`; `suite.modelOverride` claude-sonnet-5-5; $2.0855, 133 s | met | `it-006/scratch/triggers/2026-09-29T10-26-31-324Z/aggregate-result.json`; `baseline/metrics-R-1.json:34-54` |
| T2 3 runs/arm | 18 cases, 108 runs, every arm 3 | met | `it-010/scratch/t2-sonnet.json` |
| T2 `partial: false` | false; 0 run errors; 0 `skippedPaidGraders`; 0 absent runs of 108 | met | same, `.partial`, my node count |
| T2 agent model from traces | 108 unique trace ids, 108 found, 108 `system/init` rows all `claude-sonnet-5-5`; 1,595 assistant messages, all `claude-sonnet-5-5`, no other model | met | `evals/evals-core/results/traces/<e-id>.jsonl`, ids from `t2-sonnet.json` `tracePath` |
| T3 two 3-run sets, same build, floor computed | 23 + 23 successful runs of 24 each (2 `invalid-output` failures, both recorded); per-case counts, medium+ counts, own stability and set agreement all reproduce; floor 0.0 (be-vs-6261: stability 0 and 0, agreement 0) | met; the floor is degenerate, so it rejects nothing (F10) | `baseline/metrics-R-1.json:154-451`; `it-006/scratch/aa-1`, `aa-2` |
| archive manifest verifies | 318 OK, 0 not OK | met | `archive/MANIFEST.txt` |
| "complete on `gym/R1/it-003`" | product surfaces identical; 5 eval-tooling files differ | met for the product, not literally for the tree (F5) | `git diff --stat gym/R1/it-003 HEAD -- . ':!gym'` |
| any `null` in the required blocks | none: G1/T1/T2/T3 are populated; T4 and T4p are null and not required by this row | met | `baseline/metrics-R-1.json` |
| plan digest | matches CAMPAIGN.md | met | `CAMPAIGN.md:9` |
| tags | `gym/R1/it-010` = HEAD `b80bd72`, the record commit that holds decision, metrics and STATE; `gym/R1/it-009` = `1661639`, its accept commit; it-006..it-008 carry no tag, as STATE.md says | consistent; `cp-S0` tag and `cp-S0.md` do not exist yet | `git tag -l`, `STATE.md:14-18` |

### Re-derivation of the it-010 numbers (independent node re-implementation of `scoreAnswer`/`namedFiles`, per-run-index means, median of 3)
| field | it-010 decision / metrics-R-1 | mine | from |
|---|---|---|---|
| localize with F1 median (sweeps) | 0.5417 (0.5359 0.6397 0.5417) | 0.5417 (0.5359 0.6397 0.5417) | `t2-sonnet.json` |
| localize without F1 median (sweeps) | 0.5715 (0.6082 0.5506 0.5715) | 0.5715 (0.6082 0.5506 0.5715) | same |
| review with recall median (sweeps) | 0.0938 (0.0938 0.0938 0.0625) | 0.0938 (0.0938 0.0938 0.0625) | same |
| review without recall median (sweeps) | 0.0938 (0.0938 0.0625 0.0938) | 0.0938 (0.0938 0.0625 0.0938) | same |
| pooled F1 / precision / recall, localize with | 0.5724 / 0.6485 / 0.6101 | 0.5724 / 0.6485 / 0.6101 | same |
| localize without pooled F1 / precision / recall | 0.5768 / 0.5687 / 0.7161 | 0.5768 / 0.5687 / 0.7161 | same |
| helper-ran localize with | 1 of 30 (by run index 1,0,0) | 1 of 30 (1,0,0) | grader `helper-ran` in `t2-sonnet.json` |
| helper-ran review with | 0 of 24 | 0 of 24 | same |
| plugin-fired localize with / review with | 28 / 0 | 28 / 0 (28 `ambicode:investigate` Skill calls, every one `Launching skill`, 0 tool errors; review with 0) | same, traces |
| broader helper check (any Bash `ambicode <sub>` in the traces) | not stated | localize with: 1 run (`prepare`); review with: 0; both without-arms: 0 | traces |
| review raised, both arms | equal | 5 and 5 | `t2-sonnet.json` |
| run count / run errors | 108 / 0 | 108 / 0 | same |
| cost per run, localize with / without | $0.2205 / $0.1763 | $0.2205 / $0.1763 | same |
| cost per run, review with / without | $0.1982 / $0.1917 | $0.1982 / $0.1917 | same |
| turns, review with / without | 8.75 / 8.5833 (differ by 0.17) | 8.75 / 8.5833 | same |
| sweep cost | $21.2623, 1,571 s | sum of per-run `costUsd` = 21.2623 (equals `.costUsd`); 1571 s. Sum of per-run `judgeCostUsd` = 0.8508, separate (F3) | same |
| Opus values quoted in decision.md:10-20 | 0.6565, 0.6198, 0.1563, 0.1250, 28/30, 23/24, $0.544, $0.630 | all match `baseline/metrics.json` T2; `$57.83, 3,202 s` matches `it-003/scratch/eval-2026-09-29T04-05-40-882Z.json` (`[57.83, 3202, false]`) | those files |
| spreads quoted (decision.md:27) | with 0.104 (Opus 0.070), without 0.058 (Opus 0.062) | 0.6397-0.5359 = 0.1038; 0.6082-0.5506 = 0.0576; Opus 0.6840-0.6140 = 0.070; 0.6762-0.6142 = 0.062 | metrics files |

### Ledger, cost, order
| field | value | from |
|---|---|---|
| per-iteration eval costs (baseline 65.56, it-001 2.03, it-003 70.90, it-005 0.81, it-006 6.68, it-007 0.15, it-008 0.33, it-009 0.61, it-010 21.47; it-002, it-004 0) | sum 168.55 | `it-*/metrics.json`, `baseline/metrics.json` `costUsd` |
| supervisor session spend | 43.65 | `supervisor/state.json` `spentUsd` 43.6537 |
| lead's ledger | ≈ 203.6 (50.9 %) | `cp-budget-200.md:10` |
| sum of the two | 212.20 (53.0 % of $400); gap 8.6 | assumes evals and sessions are disjoint, as `CAMPAIGN.md:12` says the ledger counts both |
| ledger arithmetic as written | 181.5 + 0.61 + 21.47 = 203.58, matches STATE.md rows and metrics | `cp-budget-200.md:7-9`, `STATE.md:16-18` |
| brief committed before its measure step | it-008: brief 13:23:36, first preflight 13:29 (+0200); it-009: brief 14:05:18, preflight 14:12; it-010: brief 14:16:55, preflight `2026-09-29T12-16-59Z` (= 14:16:59), sweep started 12:17:46Z | `git log`, `it-010/scratch/t2-start.txt`, `it-008/scratch`, `it-009/preflight-sonnet.log` mtimes |
| scope of diffs | it-008 and it-009 `diff.patch`: exactly `evals-preflight.mjs`, `evals-preflight.test.mjs`, `p2-task-regression-fix/prompt.md`; it-009 total 102+/7- equals `git diff --stat gym/R1/it-005 HEAD -- . ':!gym'`; prompt wording is exactly the R-3 sentence (02 §3.3, `02-loop-protocol.md:171`); it-010 has no `diff.patch`, all its changes are under `gym/` | `it-008/diff.patch:1,14,66`, `it-009/diff.patch:1,16,68` |
| recorder untouched since it-005 | `evals-record-core.mjs` last commit `8ba7f73` (it-005), so the T3 A/A recorder is the HEAD recorder | `git log -- evals/scripts/src/evals-record-core.mjs` |
| `benchmarks/reviewer-recordings.json` | sha prefix `b4d778c9...` (owner-restored value) | shasum |

## Findings
| # | severity | finding | evidence |
|---|---|---|---|
| F1 | should-fix | `baseline/metrics-R-1.json` G1/G3 pointers are wrong and its G1 is stale. `G1.log` is `"verify.log"`, which resolves to `baseline/verify.log`: that log is the cp-0 run with **752** tests (`ℹ tests 752`), not the 795 the block claims. `G3.log` is `"g3.log"`: no such file in `baseline/` (only `baseline/scratch/g3.log`, the Opus one). The 795-test log is `it-006/verify.log:1102`; the current tree's G1 is 804/803/0/1 (`it-009/verify.log:1113`) and G3 554 (`it-009/metrics.json`), while the block says 795 and 521. `iteration` still reads `it-006`. The cp-S0 go row needs "G1 exit 0" and 03 §2 needs every `cp-K.md` cell traceable to a file path. | `baseline/metrics-R-1.json:2,15-21,27-32`; `baseline/verify.log:1033`; `it-006/verify.log:1102`; `it-009/verify.log:1113` |
| F2 | should-fix | The claim "T2 review is blind to the plugin on Sonnet" is measured for the T2 review case template, but the cause is untested and the campaign's own data points at the template, not at Sonnet, and the decision does not mention that data. `regression-ts` (a review case whose prompt says "Review the uncommitted change ... and verify it against the project's own checks") passes `plugin-fired` and `helper-ran` on Sonnet in every recorded preflight; the T2 review prompt template ("report the problems a reviewer should raise ... Do not edit anything") gets 0 Skill calls and 0 helper calls in 24 runs, and 173 of the with-arm's tool calls are plain Bash. The owner's own L-013 answer says "Sonnet in the owner's local sessions does call the plugin and its scripts". decision.md:26 says why is "not investigated", which is honest, but decision.md:3 and STATE.md:18 state the consequence as a property of Sonnet, and `cp-budget-200.md:20` says T2 "cannot detect a change to the review pipeline". That holds for T2 as configured; it may not hold for T2 with a prompt that names the review skill (the R-3 lever for p2). This bears on what the owner is asked in OWNER-INBOX item (2). | `baseline/metrics-R-1.json:55-68` (`passingCase` regression-ts, every attempt); `it-010/scratch/preflight.log`; `it-008/decision.md:19`; `it-009/decision.md:16`; `evals/scripts/src/evals-bench.mjs:250-270` (T2 review template); `evals/evals-archived/typescript/regression-ts/prompt.md:12-13`; `labels/labels.json` L-013 detail; `it-010/decision.md:3,26`; `STATE.md:18` |
| F3 | should-fix | The it-010 cost and the $200 ledger are understated. The sweep's `costUsd` (21.2623) is the sum of per-run `costUsd`; the per-run `judgeCostUsd` sums to 0.8508 and is not in it (the same convention as it-003, whose decision lists `judge 0.88` as a separate line, and the lead's 06:10Z inbox note "The ledger adds the baseline's T2 judge cost"). it-010's eval cost 21.4723 = 0.21 + 21.2623 omits it, and `cp-budget-200.md:12` omits this session's lead and verifier cost (session meter ≈ 2.9 by its own text). Against evals-plus-sessions from files (168.55 + 43.65 = 212.20) the ledger is short by 8.6, so 53.0 % not 50.9 %, remaining to the $360 stop ≈ $148 not $156, and "about 7 decision sweeps" is about 6.7. No budget checkpoint or stop moves (next is $300). The Sonnet/Opus ratio 0.37 is unaffected (both sides exclude judge). | `it-010/scratch/t2-sonnet.json` (`judgeCostUsd` sum 0.8508); `it-010/metrics.json:31,32`; `cp-budget-200.md:5-20`; `supervisor/state.json`; `CAMPAIGN.md:12`; `it-003/decision.md:29` |
| F4 | note | it-010 is accepted on the 02 §5 row "WP0-type ... accept on gates + control" (`02-loop-protocol.md:124`) with G1/G2/G3 recorded `null` (`it-010/metrics.json:7-10`). The gates are inherited from it-009, which is legitimate here: I confirmed `git diff --name-only gym/R1/it-009 HEAD -- . ':!gym'` is empty. `decision.md:33` says so ("the verifier checked"); the verifier checked `git status`, not a diff against the it-009 tag, so the support is mine, not the verifier's. | `it-010/decision.md:33`; `it-010/handoffs/verifier.md:14`; my diff |
| F5 | note | 03 §1 says the reference is "on `gym/R1/it-003`" and `metrics-R-1.json:5` says "product surfaces byte-identical to gym/R1/it-003". The second is true (`src skills prompts policies hooks` identical). The first is not literally true of the tree: 5 non-gym files differ (`evals-preflight.mjs`, `evals-preflight.test.mjs`, `evals-record-core.mjs`, `evals-record-core.test.mjs`, `p2-task-regression-fix/prompt.md`). None is on the T2 path (`it-010/brief.md:4`), and the recorder change is the tool T3 was measured with. T1 and T3 were measured at the it-006 HEAD, T2 at `8606622`, G1 at it-009; all are the same product. `cp-S0.md` should say "product surfaces" and list the five files, as `it-010/brief.md:4` already does. | `git diff --stat gym/R1/it-003 HEAD -- . ':!gym'`; `baseline/metrics-R-1.json:5` |
| F6 | note | `baseline/metrics-R-1.json:55-68` records the Sonnet preflight as "FAILED 4 of 4" and never records the two passing Sonnet preflights (it-009, it-010) that ungated T2, or the prompt repair. A reader of the reference file sees a gate that failed. Both logs exist. | `it-009/preflight-sonnet.log`, `it-010/scratch/preflight.log`, `it-010/metrics.json:11` |
| F7 | note | `decision.md:27` says review recall "moves in steps of 1/32 = 0.031; the 0.105 threshold is 3.4 steps". The 8 review cases have 1, 1, 2, 2, 2, 3, 4, 4 threads (19 total), so a sweep's mean recall steps by 1/32 only for the 4-thread cases and by up to 1/8; the Opus sweep value 0.1979 (`baseline/metrics.json` `T2.review.with.recallSweeps`) is not a multiple of 1/32. The conclusion (0.105 is a coarse threshold) stands; the granularity is stated too cleanly. Related, not in the decision: 01 §3's without-arm control band is ±0.03 (`01-goals-and-metrics.md:99`), and one of the three Sonnet without-arm localize sweeps deviates +0.037 from its own median (0.6082 vs 0.5715), so a single sweep would already fail that control. | `it-010/decision.md:27`; `evals/evals-core/cases/*/truth.json` `threads` (counts only) |
| F8 | note | decision.md's Opus column is labelled "Opus (cp-0)" but the cost row is the it-003 sweep ($57.83, 3,202 s) while every other row is the cp-0 assembled baseline ($60.56, 3,232 s). The row text says "(it-003 sweep)", and the value is correct against its file. | `it-010/decision.md:10-20`; `baseline/metrics.json` T2 |
| F9 | note | Stale or unmeasured labels: `CAMPAIGN.md:13` models row still says "eval agent pinned `claude-opus-5-5`", but the eval agent is Sonnet from cp-S0 (R-1). Three timestamps are later than the commit that contains them: `it-010/metrics.json:5` capturedAt 13:00:00Z and `OWNER-INBOX.md:28` "13:05Z" against commit 12:48:09Z; `OWNER-INBOX.md:27` "12:25Z" and `it-009/metrics.json:5` "12:20:00Z" against commit 12:15:51Z. Round numbers, not measured times. | `CAMPAIGN.md:13`; `git log -1 --format=%cd --date=iso b80bd72 1661639` |
| F10 | note | The T3 floor is 0.0 (recomputed, matches `baseline/metrics-R-1.json:432-440`). cp-3's "stability not below the cp-S0 floor on more than 1 case" and cp-4's "not below the floor" (`03-checkpoints-and-gates.md:20-21`) are therefore vacuous until the owner sets a nonzero floor (a threshold change, owner only). The metrics file says so; `cp-S0.md` should carry the sentence, since the go table for cp-3/cp-4 leans on it. | `baseline/metrics-R-1.json:432-440`; `03-checkpoints-and-gates.md:20-21` |
| F11 | note | Scope. it-010 changed only files under `gym/` (11 files, `git diff --stat 1661639 HEAD`). `cp-budget-200.md` is not in the brief's "Files allowed to change" (`it-010/brief.md:18`) but 03 §1 requires it at 50 %; the brief also lists a root `OWNER-INBOX.md` that does not exist (the lead notes it, `decision.md:38`). `it-010/scratch/cases.sha256` holds one hash where the brief (`brief.md:10`) asked for the list "before and after"; I recomputed it and it matches, with the command `find . -type f | sort | xargs sha256sum | sha256sum` in `evals/evals-core/cases`. | `it-010/brief.md:10,18`; `it-010/scratch/cases.sha256` |
| F12 | note | Open question with no default, same pattern as L-012: it-010's two owner items (01 §1 item 3 at 0 of 8, T2 review blind on Sonnet) sit only in `OWNER-INBOX.md:28`, which carries no default. I filed **L-016** in `labels/pending.md` with a conservative default. Also `labels/pending.md` has no Status line for L-013 and L-015 although `labels.json` answers both (a+b; b). | `OWNER-INBOX.md:28`; `labels/pending.md` L-013, L-015; `labels/labels.json` |
| F13 | note | Housekeeping: the it-009 worker worktree `/Users/KillBill/Documents/projects/mine/ai/ambicode-it-009` (branch `gym/R1-it-009-work`, uncommitted copy of the three files) is still registered; it-008 removed its own. Nothing depends on it. `git stash list` still holds the guard-kill stash (`stash@{0}`, already noted redundant in OWNER-INBOX). | `git worktree list`, `git stash list` |
| F14 | note | T1's model is evidenced only by `suite.modelOverride` and cost (T1 traces were deleted), as `baseline/metrics-R-1.json:13` states. 03's cp-S0 row demands trace verification only for T2, so this does not block; keep the sentence in `cp-S0.md`. | `baseline/metrics-R-1.json:13` |

Checks that found nothing:
- WP order: it-008, it-009, it-010 are all WPH; no WP3 or WP4 work was started (`it-008/decision.md:35`).
- Metrics against the wrong baseline: none. it-010 compares Sonnet with Sonnet in its own record and labels Opus as history (`decision.md:7`); it-009 and it-008 make no T2 comparison.
- Label defaults taken silently in the last three: none. L-013 and L-015 were answered by the owner before use (`labels.json`); L-010 and L-003..L-008 are unanswered with elapsed defaults, but no decision in it-008..it-010 turned on them, so S9 is not triggered. Their defaults will matter at cp-4 and cp-5.
- S4 statements: `decision.md` makes none. The threshold statement (0.05 inside the with-arm spread of 0.104) is correct. S4 is armed from cp-S0 with without-arm references localize F1 0.5715 and review recall 0.0938 (`03-checkpoints-and-gates.md:54`).
- it-010 must-not-move: no non-gym file changed; `benchmarks/reviewer-recordings.json` unchanged; cases hash unchanged.
- Verifier handoff: numeric fields agree with my re-derivation; its non-numeric disagreements are addressed (top-level `costUsd` corrected to 27.94 = 6.6777 + 21.2623; `OWNER-INBOX` path noted). One is not: top-level `modelProof` still describes only preflight and T1 (the T2 proof lives in `T2.agentModelProof`, verified by me above).

## Disagreements
| field | lead's value | mine | source of difference |
|---|---|---|---|
| T2 numbers (F1/recall medians, sweeps, pooled, helper-ran, plugin-fired, run count, errors, cost per run, turns) | see Numbers | identical | none |
| sweep cost / it-010 eval cost | $21.2623 / $21.4723 | $22.1131 / $22.3231 if `judgeCostUsd` (0.8508) is additional, as in it-003 | judge cost not in `costUsd`; the JSON alone cannot show whether it is inside the per-run figure, but it-003's accounting treats it as separate (F3) |
| ledger | ≈ 203.6 (50.9 %) | 212.20 (53.0 %) from files, assuming disjoint eval and session spend | ledger omits judge cost and this session's lead/verifier spend (F3) |
| G1 in `baseline/metrics-R-1.json` | 795 tests, log `verify.log` | log resolves to a 752-test run; the current tree is 804 | stale block, wrong relative path (F1) |
| "review recall moves in steps of 1/32" | 1/32 | 1/32 to 1/8, depending on the case's thread count | decision.md:27 (F7) |
| "product surfaces byte-identical to it-003" | true | true; the tree as a whole differs in 5 eval-tooling files | wording (F5) |

## Claims without evidence
- (none)

## Could not do
- Did not rerun `npm run verify` or any eval (instructed not to spend). G1 for the tag commit rests on it-009's log plus my empty-diff check outside `gym/`.
- Did not read `~/.claude` (denied), so the guard log was not consulted for the two guard denials I know of (one this session, mine, a read-only script with a regex literal; not retried in that form).
- Could not decide whether `judgeCostUsd` is inside the per-run `costUsd`; the argument in F3 rests on it-003's separate `judge 0.88` line, not on the harness source (not in the repo).
- Could not verify the "6 of 6 preflights" tally in the NOTE string (sandboxes deleted); it comes from the it-006 and it-008 decisions.
- Did not audit it-000..it-007 decisions (outside "last three"), nor the supervisor's owner-owned dirty edits (`gym/plan/supervisor/{policy.mjs,test/policy.test.mjs}`, `gym/runs/R1/supervisor.out`): not findings, by instruction.
- Did not investigate why the plugin's helper is not run on Sonnet in T2 (needs a kept trace of a with-arm run and a budgeted experiment). I read the 108 existing traces for Skill/Bash counts only.

## Verdict
cp-S0: go with notes. Reasons that would block the tag, none of which holds now: a `null` in G1/T1/T2/T3 (none), a trace showing a model other than `claude-sonnet-5-5` (0 of 108), `partial: true` or a run error (none), archive manifest mismatch (0 of 318), planDigest mismatch (equal), tag not on the record commit (it is). Fix before or with the tag: F1 (cite `it-009/verify.log:1113` in `cp-S0.md` and correct the G1/G3 log pointers), F2 (state the T2-blind finding as "for the T2 review template on Sonnet, cause untested", and cite the `regression-ts` contrast), F3 (restate the ledger with judge cost and session spend).

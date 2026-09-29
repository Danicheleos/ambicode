# verifier handoff — it-010 — 8606622 (working tree; metrics-R-1.json and it-010 scripts uncommitted)

Headline: every field in the T2 block reproduces from the raw result and the traces. No numeric disagreement. Three non-numeric observations are in the Disagreements table.

## Ran
Wall times are under 1 s each except where noted (not individually timed; no command took long enough to notice). Scripts are in /tmp and were written by me; none of the lead's scripts were run.
- `shasum gym/runs/R1/it-010/scratch/t2-sonnet.json evals/evals-core/results/eval-2026-09-29T12-17-46-139Z.json` → exit 0; both fa3dc250baa8a6b13c00fecb6e4368621e4b2367 (byte-identical)
- `jq` over t2-sonnet.json for partial/claudeVersion/suite.modelOverride/costUsd/durationSeconds/case count/run count/.error/.skippedPaidGraders → exit 0
- `node evals/scripts/src/evals-bench.mjs score gym/runs/R1/it-010/scratch/t2-sonnet.json` → exit 0; output file: /tmp/v_score.txt
- `node /tmp/v_sweeps.mjs` (imports `score()` from evals-bench.mjs; per-run-index mean over scored rows, medians, pooled) → exit 0
- `node /tmp/v_traces.mjs` (108 tracePaths from the result → `evals/evals-core/results/traces/<e-id>.jsonl`; counts system/init rows, model values, Skill tool_use by arm and skill) → exit 0; input list /tmp/v_traces.tsv
- `node /tmp/v_diff.mjs` (parse HEAD vs working-tree metrics-R-1.json, compare all blocks except T2, T2Reason, status, reference, capturedAt, commit) → exit 0; `jq -e . gym/runs/R1/baseline/metrics-R-1.json` → exit 0
- `(cd evals/evals-core/cases && find . -type f | sort | xargs shasum -a 256) | shasum -a 256` → exit 0; 2f7470fdb24fa1259e9a970b2b32358d6f817ae0f6d9cad064ecb663f9df8212
- `git status --short -- . ':!gym'` → exit 0, empty; `git diff --stat HEAD -- benchmarks/reviewer-recordings.json` → exit 0, empty; `git status --short benchmarks` → empty
- `git diff gym/R1/it-003 --stat -- src skills prompts policies hooks` → empty (brief's "shipped plugin is the it-003 build" claim)
- `test -e` on the paths the brief cites → all exist except root `OWNER-INBOX.md` (see Disagreements)

## Numbers
| field | value (mine) | T2 block | from |
|---|---|---|---|
| result.partial | false | false: agree | jq .partial |
| claudeVersion | 2.1.284 | 2.1.284: agree | jq .claudeVersion |
| suite.modelOverride | claude-sonnet-5-5 | claude-sonnet-5-5: agree | jq .suite.modelOverride |
| costUsd | 21.2622628 (sum of per-run costUsd also 21.2622628) | 21.2623: agree | jq .costUsd |
| durationSeconds | 1571 | 1571: agree | jq .durationSeconds |
| cases / runs | 18 cases; 36 arms x 3 = 108 runs, every arm has 3 | 18 / 3 per arm: agree | jq |
| run errors | 0 | 0: agree | jq select(.error!=null) |
| skippedPaidGraders | 0 | 0: agree | jq select(.skippedPaidGraders) |
| absent (unscored) runs | 0 of 108 | not stated | score() |
| localize/with f1, precision, recall | 0.5724, 0.6485, 0.6101 | f1Pooled 0.5724, 0.6485, 0.6101: agree | /tmp/v_score.txt |
| localize/with cost/run, turns | 0.2205, 11.8667 | 0.2205, 11.8667: agree | score |
| localize/with helper-ran, plugin-fired | 1 of 30, 28 | 1 of 30, 28: agree | score |
| localize/without f1, precision, recall | 0.5768, 0.5687, 0.7161 | 0.5768, 0.5687, 0.7161: agree | score |
| localize/without cost/run, turns | 0.1763, 9.2 | 0.1763, 9.2: agree | score |
| review/with recall, cost/run, turns | 0.0833, 0.1982, 8.75 | 0.0833, 0.1982, 8.75: agree | score |
| review/with helper-ran, plugin-fired | 0, 0 (of 24) | 0 of 24, 0: agree | score |
| review/without recall, cost/run, turns | 0.0833, 0.1917, 8.5833 | 0.0833, 0.1917, 8.5833: agree | score |
| localize/with f1 by run index 0,1,2 | 0.5359, 0.6397, 0.5417 (10 scored cases each) | f1Sweeps same: agree | /tmp/v_sweeps.mjs |
| localize/with f1 median | 0.5417 | 0.5417: agree | same |
| localize/without f1 by run index | 0.6082, 0.5506, 0.5715 | same: agree | same |
| localize/without f1 median | 0.5715 | 0.5715: agree | same |
| review/with recall by run index | 0.0938, 0.0938, 0.0625 (8 scored cases each) | same: agree | same |
| review/with recall median | 0.0938 | 0.0938: agree | same |
| review/without recall by run index | 0.0938, 0.0625, 0.0938 | same: agree | same |
| review/without recall median | 0.0938 | 0.0938: agree | same |
| helper-ran localize/with by run index | 1, 0, 0 of 10 each; median 0 | helperRanMedian 0 of 10: agree | same |
| helper-ran review/with by run index | 0, 0, 0 of 8 each | helperRanMedian 0 of 8: agree | same |
| traces named / found | 108 unique e-ids, 108 found, 0 missing | missingTraces 0: agree | /tmp/v_traces.mjs |
| system/init rows | 108 (exactly 1 per trace); model claude-sonnet-5-5 x 108 | 108 of 108: agree | same |
| Skill tool_use | localize/with ambicode:investigate 28; every other arm 0; review/with 0 | 28 / {} : agree | same |
| cases hash | 2f7470fd...8212 fresh = cases.sha256 | n/a: agree | shasum pipeline |
| metrics-R-1.json other blocks (T1, preflight, T3, G1..G3, models, modelProof, T4, T4p, costUsd, costBreakdown, pluginVersion, iteration) | 0 differences vs HEAD | n/a: agree | /tmp/v_diff.mjs |
| keys changed vs HEAD | T2 (null -> object), T2Reason (removed), status partial -> complete, reference, capturedAt, commit | expected set | /tmp/v_diff.mjs |
| files outside gym/ changed | none; benchmarks/reviewer-recordings.json unchanged | agree with brief "must not move" | git status/diff |
| harness exit | t2.log ends `exit=1`; result still partial false, 0 errors | matches T2.exitStatus | tail scratch/t2.log |

## Files touched (worker only)
- none (verifier). Wrote only gym/runs/R1/it-010/handoffs/verifier.md. Scratch scripts and outputs are in /tmp.

## Could not do
- Did not run `npm run verify` or `npm run evals:score` through npm: the task listed `evals:score` as allowed, I ran the same `evals-bench.mjs score` entry point directly. Did not run verify: nothing outside gym/ changed and the task did not ask for it.
- Did not re-derive the T2.opusReference numbers (history from baseline/metrics.json, not this sweep's claim). Not compared.
- Did not verify the cost claim "preflight ≈ $0.2 immediately before the sweep" (preflight.log exists; no field in T2 depends on it).
- Did not check whether result costUsd includes judgeCostUsd: the result total equals the sum of per-run costUsd (21.2622628) and per-run judgeCostUsd sums to 0.8508 separately; whether that 0.85 is inside the per-run figure is not decidable from the JSON alone.
- Did not check the statement that `gym/R1/it-009` tag equals HEAD~; tags it-006..it-008 do not exist, but the brief only names it-003 and it-009.

## Disagreements (verifier/auditor only)
| field | lead's value | mine | source of difference |
|---|---|---|---|
| (numeric fields of T2) | see Numbers | identical | none |
| metrics-R-1.json top-level `costUsd` / `costBreakdown` | 6.6777 (T1 2.0855 + preflightKeepTemp 0.17 + T3AA 4.4222), unchanged from HEAD | T2 sweep cost 21.2623 and the pre-sweep preflight are not in it | stale total: the campaign total in this file now excludes the largest spend; the T2 block has its own costUsd, so the number is right but the file total is misleading |
| metrics-R-1.json top-level `modelProof` / `models.agent` | covers preflight and T1 only, unchanged | T2 proof lives only inside T2.agentModelProof (correct and verified) | not an error; readers of the top-level field will not see the 108-trace proof |
| brief "Files allowed to change" lists `OWNER-INBOX.md` | repo root path | root file does not exist; the file is gym/runs/R1/OWNER-INBOX.md | path in the brief is wrong or not yet created; nothing depends on it in this verification |
| working tree beyond the brief's file list | brief allows gym/runs/R1/it-010/**, baseline/metrics-R-1.json, decision-R-1.md, STATE.md, cp-S0.md, OWNER-INBOX.md | `git status` also shows M gym/plan/supervisor/policy.mjs, M gym/plan/supervisor/test/policy.test.mjs, ?? gym/runs/R1/supervisor.out (all inside gym/, not it-010 changes; already dirty before this verification) | outside the brief's list; not evaluated, flagged for the lead |
| baseline/decision-R-1.md, STATE.md, cp-S0.md | brief lists them as to be updated | unchanged in the working tree (not in git status) | not yet written; not part of this verification |

## Claims without evidence
- (none)

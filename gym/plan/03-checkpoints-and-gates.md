# 03 — Checkpoints and gates

Numeric thresholds at fixed points of the campaign; who decides; what evidence a "go"
needs. Metric ids from [01](01-goals-and-metrics.md); the per-iteration decision table is
[02 §5](02-loop-protocol.md#5-decision-table); this file is about the campaign level.

## 1. Checkpoints

A checkpoint is a tagged commit `gym/<campaign-id>/cp-K` plus `gym/runs/<campaign-id>/cp-K.md`
holding the evidence table below, filled from `metrics.json` files (never from memory).

| CP | When | Go requires (all) | No-go / pause |
|---|---|---|---|
| cp-0 | end of iteration 0 | `baseline/metrics.json` complete: G1 = 751/750/0/1 (or higher `tests`); T2 has 3 runs/arm, `partial: false`, model recorded as `claude-opus-5-5`; T3 = 5/8; T4 row reproduced by the script; `archive/MANIFEST.txt` verifies | any `null` in G/T1/T2 → **pause**, fix the harness, rerun; archive source missing → **pause**, escalate (B5) |
| cp-1 | WP1 accepted | T3 = 8/8 with 3 recordings each; T2 review with-arm `helper-ran` ≥ 6/8 (median of 3); T1 unchanged; localize F1 within ±0.03 of cp-0 | `helper-ran` < 4/8 after 3 iterations → **no-go** for WP1, replan trigger R3 |
| cp-2 | WP2 accepted | G1 `tests` ≥ cp-1 + 3; T2 localize and review with-arm within noise of cp-0 (control); label L-* entries filed for the first human cycle; `docs/review.md` or `docs/` updated if user-visible behaviour changed | any T2 control moved beyond noise against → **no-go**, revert WP2, replan |
| cp-3 | WP3 accepted | T3 recordings carry a tool-call record; a synthetic 0-read review is flagged `partial` in a unit test; T3 median findings per case within ±2 of cp-1 | median findings drop ≥ 3 on ≥ 2 cases → **no-go** |
| cp-4 | WP4 accepted | replay of the 3 archived VS-6735 reviews with `--iteration` shows later-iteration findings ≤ 1 of N (human label or documented heuristic); T3 unchanged | not measurable because snapshots were lost → **pause**, Q-class blocker, replan |
| cp-5 | cycle 1 exit | [01 §1](01-goals-and-metrics.md#1-definition-of-trained-cycle-1) all true; spend ≤ ceiling; `STATE.md` has no row without a decision | otherwise **pause** and hand over ([USER-GUIDE §6](USER-GUIDE.md)) |

Budget checkpoints, independent of WPs: at 50 % and 75 % of the ceiling the lead writes
`cp-budget-<pct>.md` (spend so far, iterations accepted/rejected, cost per accepted
iteration) and continues; at 90 % it stops (§3).

## 2. Who decides, and with what evidence

| Decision | Decider | Evidence attached to a "go" |
|---|---|---|
| iteration accept/reject | lead, after the verifier's independent numbers match ([04 §2](04-orchestration.md#2-verifier)) | `decision.md` quoting both `metrics.json` and `baseline/metrics.json` lines; verifier handoff file |
| checkpoint go | lead | `cp-K.md` table with every cell traceable to a file path; `git tag` output |
| checkpoint no-go → replan | lead proposes, **human confirms** if the replan changes a target in 01 §1 or the budget | `09` replan record |
| pause / stop | anyone: lead, verifier, human (`STOP` file) | `incidents/*.md` |
| push through (§4) | lead, only inside the listed conditions, recorded in `decision.md` under `push-through:` | the condition's evidence |
| raising a limit, changing a threshold, editing `gym/plan/` | human only | — |

"Human confirms" means a line in `labels/labels.json` or a message the lead quotes
verbatim in the record. No human line, no confirmation ([05 §1](05-anti-hallucination.md)).

## 3. Stop and escalate

Any one of these stops the loop before the next iteration starts; the lead writes
`incidents/<ts>-<slug>.md` and the `STOP` file ([08 §2](08-safety-and-rollback.md#2-emergency-shutdown)):

| # | Condition | Threshold |
|---|---|---|
| S1 | Gate red at the last accepted tag | `npm run verify` fails on `git checkout <last tag>` — the baseline itself is broken |
| S2 | Spend | ≥ 90 % of the ceiling, or a single iteration > 2× its brief's budget |
| S3 | Rejections | 3 consecutive rejected iterations, or 5 rejected of the last 7 |
| S4 | Without-arm drift | T2 without-arm localize F1 or review recall moved > 0.10 from cp-0 on two sweeps — the model or harness changed, not the plugin |
| S5 | Harness health | `partial: true`, `skippedPaidGraders`, or any run `error` mentioning usage/rate limit (plugin-evals docs "Runs fail with a usage-limit…") in a decision sweep |
| S6 | Integrity | archive manifest mismatch; `git status` shows changes outside the brief's globs; `benchmarks/` or `evals/evals-core/cases` staged (`git diff --cached --name-only`) |
| S7 | Safety | any condition in [08 §1](08-safety-and-rollback.md#1-triggers) |
| S8 | Plan drift | `planDigest` mismatch; a helper report cites a file that does not exist ([05 §5](05-anti-hallucination.md#5-red-flags)) twice in one iteration |
| S9 | Unanswered labels | ≥ 3 label defaults taken in a row on decisions that turned on them |

In unattended runs the supervisor applies S2, S3 (as "3 sessions without progress") and S7 itself and halts with a `STOP` file; see [10 §4](10-supervisor.md#4-what-the-supervisor-does-when-a-session-ends).

Escalation = the incident file plus a one-paragraph message to the owner in the channel
named in `CAMPAIGN.md` (**TBD: the owner's channel**). No further model spend until a
human line clears it.

## 4. Push through

The lead may continue **without** a new decision only when all of the listed evidence
is in the iteration directory:

| Situation | Allowed action | Evidence required |
|---|---|---|
| T2 screening within noise but the WP brief predicted a T4-only effect | run the 3-run decision sweep anyway | brief line "Claim: T4 …" written before the screening |
| One flaky T1 case (< 1.0 in 1 of 3) | rerun T1 once | both result dirs named in `metrics.json.notes` |
| A helper timed out | respawn once with the same brief ([04 §5](04-orchestration.md#5-replacing-a-helper)) | the timed-out handoff kept |
| Eval harness refused a case (`refused …: none of its true file(s) exists`) | proceed with the remaining cases, count reported as `scored` | the refusal line quoted |
| Cost 25 % rule breached but the brief predicted it | accept | the brief's predicted cost line |

Anything not in this table is not a push-through; it is a decision, and it needs the
verifier's numbers and a `decision.md`.

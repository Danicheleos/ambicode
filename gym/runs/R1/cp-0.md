# cp-0 — R1 — end of iteration 0

**Go.** Tags `gym/R1/it-000` and `gym/R1/cp-0` are on the commit that records this file.

| Go requires (03 §1) | Observed | Source |
|---|---|---|
| G1 = 751/750/0/1 or higher `tests` | 752 / 751 / 0 / 1, exit 0 | `baseline/metrics.json` G1; `baseline/verify.log`; verifier re-run |
| T2 has 3 runs/arm | 18 cases × 3 runs/arm, 0 run errors, 0 skippedPaidGraders | `metrics.json` T2; `handoffs/verifier-s5.md` |
| T2 `partial: false` | merged set `partial: false`; **one source sweep was `partial: true` (interrupted by the guard kill)**. Its 13 complete cases are used; its 1 incomplete case was dropped and rerun | `metrics.json` T2 `assembled`; `baseline/decision.md` "How T2 was obtained" |
| model recorded as `claude-opus-5-5` | `models.agent` `claude-opus-5-5`; traces 5,957 rows opus, 10 haiku (auxiliary) | verifier-s5 |
| T3 = 5/8 | 5/8 | `metrics.json` T3 |
| T4 row reproduced by the script | `tools/transcript-metrics.py` reproduces 00-audit §4:94-116. One attribution is ambiguous (prettier it4–6: 1 here vs "×4" in the audit) | `metrics.json` T4 notes |
| `archive/MANIFEST.txt` verifies | 318 OK, 0 failed | `sha256sum -c`, session 5 |
| no `null` in G/T1/T2 | none; the nulls are `models.judge` and T3 per-case turns/cost/seconds, which are not G/T1/T2 fields | `metrics.json` |

The one departure from a literal reading is the T2 row: the baseline is complete, but it was assembled from two runs rather than one uninterrupted sweep. The lead calls that a go because every case has its full 3 runs per arm from a single invocation, with the same CLI version and model. It is recorded here, so any reader can disagree with the call.

Spend at cp-0: ≈ $75.7 of $150 (`cp-budget-50.md`).

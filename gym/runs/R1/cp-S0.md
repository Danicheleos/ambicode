# cp-S0 — R1 — Sonnet reference

**Go, with the notes below.** Every cell comes from a file. The auditor ran before this tag (`it-010/handoffs/auditor.md`, verdict "go with notes") and re-derived the T2 numbers independently with no disagreement. Tag `gym/R1/cp-S0` is on the commit that first records this file.

| Go requires (03 §1 cp-S0) | Observed | Source |
|---|---|---|
| G1 exit 0 | exit 0, 804 tests, 803 pass, 0 fail, 1 skipped | `it-009/verify.log` (`ℹ tests 804`, `exit=0`); product surfaces unchanged since |
| T1 run once, every scored case recorded | 7 scored cases at 1.0, 3 runs; `url-bare` 0.4 (diagnostic, not scored); $2.09 | `baseline/metrics-R-1.json` T1 |
| T2 3 runs/arm, `partial: false` | 18 cases × 3 runs × 2 arms = 108 runs, `partial: false`, 0 run errors, $21.26, 1,571 s | `baseline/metrics-R-1.json` T2; `it-010/scratch/t2-sonnet.json` |
| agent model verified from traces | 108 of 108 `system/init` rows `claude-sonnet-5-5` (auditor: also all 1,595 assistant messages) | `it-010/trace-summary.mjs`; `it-010/handoffs/auditor.md` |
| T3 two 3-run sets, floor computed | 23 + 23 successful runs (1 invalid-output failure per set); floor 0.0 | `baseline/metrics-R-1.json` T3 |
| `archive/MANIFEST.txt` verifies | 318 OK, 0 not OK | `shasum -a 256 -c archive/MANIFEST.txt`, run this session and by the auditor |
| plan digest | `c2c756c6…` equals `CAMPAIGN.md` | `sha256sum gym/plan/*.md \| sha256sum` |

Sonnet reference values (the controls for WP3 and WP4 screenings; Opus figures are history):

```
localize F1 median   with 0.5417   without 0.5715
review recall median with 0.0938   without 0.0938
```

## Notes that travel with this checkpoint

1. **T2 review did not exercise the plugin on this reference:** review with-arm `helper-ran` 0 of 24, 0 Skill calls; localize with-arm 1 of 30. The cause is not established. `regression-ts`, a review case whose prompt says to verify against the project's checks, fires the review skill and runs the helper on Sonnet in every recorded preflight, so the T2 review prompt template may be the cause, not the model (auditor F2). Until that is tested, a T2 review result on Sonnet is recorded as "not measurable (0 of 24 helper-ran at the reference)", never as "within noise". Owner question: L-016.
2. **The T3 floor is 0.0, so the cp-3 and cp-4 stability rows ("not below the cp-S0 floor") are vacuous** until the owner sets a nonzero floor (a threshold change, 03 §2). T3 stays reported-only.
3. **The tree is not literally `gym/R1/it-003`.** Product surfaces (`src skills prompts policies hooks`) are byte-identical; five eval-tooling files differ: `evals-preflight.mjs`, `evals-preflight.test.mjs`, `evals-record-core.mjs`, `evals-record-core.test.mjs`, `p2-task-regression-fix/prompt.md`. None is on the T2 path. T1 and T3 ran at the it-006 head, T2 at `8606622`, G1 at it-009.
4. **T1's model is evidenced by `suite.modelOverride` and cost only** (T1 traces were deleted).
5. **01 §1 item 3 (review with-arm `helper-ran` ≥ 6 of 8) is 0 of 8 at this reference.** Owner's call (L-016).
6. **Ledger, restated from files** (auditor F3): evals 168.55 (baseline plus it-001…it-010 `costUsd`) + it-010 T2 judge 0.85 (not in its `costUsd`) + baseline T2 judge ≥ 0.95 + supervisor session spend 43.65 (22 sessions) = **≈ $214.0, 53.5 % of $400**. It still omits the orphan session 5, which has no file (≈ 7 by the meter). Remaining to the $360 stop ≈ **$146**, so about 6 Sonnet decision sweeps at ≈ $22 each, not 7. The `cp-budget-200.md` figure of ≈ $203.6 is superseded. No budget checkpoint or stop moves (next: $300).
7. **Corrections made at this checkpoint:** `baseline/metrics-R-1.json` G1/G3 pointed at the cp-0 log (752 tests) and a non-existent `g3.log`; they now cite `it-009/verify.log` (804) and `it-009/g3.log` (554), with the reason in a `note`. Its preflight block now records the three passing preflights after R-3 (auditor F6).

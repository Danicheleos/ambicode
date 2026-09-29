# it-000 — baseline — decision

**Verdict: accept** (02 §5 last row: WP0-type, no behaviour claim; gates green). **cp-0: go** (`cp-0.md`).

Measured commit `2c63668c658b79868621316cbeba3fa0fd804cce`, plugin 0.3.4. `git diff 2c63668 -- . ':!gym' | wc -l` → 0 at the commit of this record: nothing outside `gym/` changed since.

## Evidence (from `baseline/metrics.json`; verifier: `handoffs/verifier-s5.md`)

```
"G1": { "exit": 0, "tests": 752, "pass": 751, "fail": 0, "skipped": 1, "seconds": 26 }
"G2": { "exit": 0, "zipSha256": "c8c5b7b3…dec7f", "files": 50 }
"G3": { "exit": 0, "files": 466, "filesVerifier": 474, … }
T1   scoredMean 1.0 over 7 cases, url-bare "investigate 3/3", overallScore 0.925, $4.21, 209 s, partial false
T2   18 cases × 3 runs/arm, 0 run errors, 0 skippedPaidGraders, claudeVersion 2.1.284, agent claude-opus-5-5
     localize with   F1 median 0.6565 (sweeps 0.6840 / 0.6565 / 0.6140), pooled 0.6515, helper-ran 28/30 (median 9/10), $0.544/run
     localize without F1 median 0.6198 (0.6762 / 0.6142 / 0.6198), pooled 0.6367, $0.418/run
     review with     recall median 0.1563 (0.1979 / 0.0938 / 0.1563), pooled 0.1493, helper-ran 23/24 (median 8/8), $0.630/run
     review without  recall median 0.1250 (0.1563 / 0.1250 / 0.0938), pooled 0.1250, $0.627/run
T3   5 of 8 recorded; findings 4 / 4 / 6 / 1 / 6
T4   VS-6735 cycle, 4 sessions; fabricated provenance 4/4; refusals 0/0/1/1; 15 fetches for 4 keys
```

The verifier reproduced every T2, T3, T4 and cost field at 4 decimals with its own commands (not `tools/t2-merge.mjs`). It disagreed on three labels: the G3 file count, the definition of T1 `scoredMean`, and the secrets sweep matching its own quoted pattern in `verifier.md`. `metrics.json` now carries both values for the first two. The third is not a credential.

## How T2 was obtained (read before comparing against it)

The single 3-runs/arm sweep was interrupted by the guard kill of session 4 (`incidents/2026-09-29T02-16-40-123Z-system-change.md`). Its 13 complete cases are used as they are. The 5 unfinished ones were rerun, one `--case` per invocation, about 40 minutes later, on the same CLI version and model. The reruns share no run index with the first sweep, so a "sweep" in the medians means run index *i* across all cases, not one uninterrupted invocation. Per-run-index medians are therefore slightly less paired than in a clean sweep. Later decisions compare medians against these medians; the per-index values are listed so that any comparison can be recomputed.

Against the plan's 1-run/arm rows (01 §3): localize with 0.6565 is inside the 0.637–0.694 range of the three pre-campaign sweeps. Without 0.6198 is 0.01 below their range (0.630–0.654), which is within the 0.03 control band.

## Findings that change the plan's premises

1. **Review with-arm `helper-ran` is 23/24 (median 8/8), not 0/8.** The 0/8 in 01 §3 and 07 K2 came from 1-run sweeps on plugins 0.3.2/0.3.3. WP1's second item ("make the review with-arm run the pipeline"; claim `helper-ran` 0 → ≥ 6) is therefore already met at baseline, and cp-1's criterion "`helper-ran` ≥ 6/8 (median of 3)" holds at cp-0. This is not an accepted WP1 item: no change was made. The item is dropped for lack of a premise, in the next iteration's selection.
2. **Review recall with-arm (0.156) barely exceeds without (0.125).** The Δ of 0.031 is well below the 0.105 signal threshold, so the plugin's review path shows no measurable recall benefit on these 8 cases.

## Not measured, or measured differently than planned

- `models.judge`: the result JSON does not record it → `null`.
- T3 per-case turns/cost/seconds: absent from `benchmarks/reviewer-recordings.json` → `null`.
- T4 "prettier ×4" for it4–6 (00-audit.md:103): the script finds 1 in it4–6 and 3 in it1–3. The audit total is likely aggregated; unverified.
- G1/G2 are from session 4's logs (`verify.log`, `scratch/g2.log`), re-run by the session-5 verifier with identical results; G1/G3 wall times were not re-timed by the verifier.
- WP0 "pin `--model`": every T2 invocation passes `--model claude-opus-5-5`, and the traces confirm the model. `evals-bench.mjs:600` was **not** changed to default it. A change there is an `evals/scripts` change, which needs a T2 screening ($19, 02 §4) and would buy nothing the command line does not already give. Judgment call by the lead.

## blockers

- B2 (harness, interrupted sweep): resolved by rerunning only the unfinished cases (1 rerun, 07 §2).
- B7 L-002 (budget): answered by the owner, $150.

# cp-1 — R1 — WP1 accepted

**Go, with T2 carried from cp-0, not re-measured.** Tag `gym/R1/cp-1` is on the commit that records this file.

| Go requires (03 §1) | Observed | Source |
|---|---|---|
| T3 = 8/8 with 3 recordings each | 8/8 cases; 3 recording runs each (19 new + 5 reused from baseline); the stored file keeps 1 per case | `it-001/metrics.json` T3 |
| T2 review with-arm `helper-ran` ≥ 6/8 (median of 3) | 8/8 median (23/24 pooled) | `baseline/metrics.json` T2 review.with — **cp-0 measurement** |
| T1 unchanged | no trigger surface changed since cp-0 (`git diff gym/R1/cp-0 -- . ':!gym'` empty); cp-0 T1: 7 scored cases 1.0, url-bare investigate 3/3 | `it-001/diff.patch`, `it-002/diff.patch` (empty) |
| localize F1 within ±0.03 of cp-0 | the plugin is byte-identical to cp-0, so it is cp-0's value, 0.6565 median | same |

**What is not re-measured, and why that is still a go.** Between cp-0 and cp-1 no plugin file changed; both iteration diffs are empty. The one input that changed is `benchmarks/reviewer-recordings.json`, which T2's review with-arm replays: it went from 5 recordings (0.3.3) to 8 (0.3.4, `--exclude`). `helper-ran` measures whether the agent ran the plugin's pipeline, which happens before any replay, so the lead expects no change from the recording swap. That is an expectation, not a measurement. Re-measuring would take a T2 decision sweep, ≈ $60, which the budget does not have (≈ $55 left before the $135 stop, next line). A screening sweep ($19) cannot decide anything (01 §3). Any later T2 review comparison against cp-0 must name the recording change.

Spend at cp-1: ≈ $80.3 of $150 (lead sessions 1–4 $5.76 + baseline eval $65.56 + it-001 $2.03 + session 5 ≈ $7.0).

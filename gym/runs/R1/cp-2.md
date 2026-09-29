# cp-2 — R1 — WP2 accepted

**Go.** Tag `gym/R1/cp-2` is on the commit that records this file. Every cell comes from `it-003/metrics.json`, and the verifier reproduced each one (`it-003/handoffs/verifier.md`).

| Go requires (03 §1) | Observed | Source |
|---|---|---|
| G1 `tests` ≥ cp-1 + 3 = 755 | 776 (exit 0, fail 0) | `it-003/metrics.json` G1; `it-003/verify.log` |
| T2 localize with-arm within noise of cp-0 | F1 median 0.6328 vs 0.6565 (Δ −0.024; real at ≥ 0.05); without-arm 0.6408 vs 0.6198 (within ±0.03) | `it-003/metrics.json` T2; `baseline/metrics.json` T2 |
| T2 review with-arm within noise of cp-0 | recall median 0.1563 vs 0.1563; helper-ran 8/8 median (23/24) vs 8/8 (23/24) | same |
| L-* entries filed for the first human cycle | L-010 (`labels/pending.md`) | — |
| `docs/` updated if user-visible behaviour changed | `docs/review.md` +21 lines (receipt wording, `init --mcp-server`, `prepare` size notice); `ambicode --help` names `--mcp-server` | `it-003/diff.patch` |

No-go check: no T2 control moved beyond noise against. T1 is unchanged (7/7 at 1.0 in 3/3 runs; `url-bare` → investigate 3/3).

**Not part of the cp-2 criteria, reported anyway.** T3 be-vs-5546 moved from median 6 to 3, outside it-003's ±2 band, on byte-identical reviewer prompts (16/16). `it-003/decision.md` gives the grounds for accepting. T4 is `null` until L-010 is answered. 01 §1 item 6 cannot be met before then.

WP2: items 1–3 accepted in it-003; item 4 dropped with its reason (`it-003/decision.md`, "WP2 status").

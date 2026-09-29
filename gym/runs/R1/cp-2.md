# cp-2 — R1 — WP2 accepted

**Go on the cp-2 criteria. It rests on it-003, whose acceptance is unconfirmed until L-011 is answered.** Tag `gym/R1/cp-2` is on the commit that first recorded this file. Every cell comes from `it-003/metrics.json`, and the verifier reproduced each one (`it-003/handoffs/verifier.md`). The auditor ran after the tag and marked two blocks against it-003 (`it-003/handoffs/auditor.md` F1, F2). Its caveats are listed at the end of this file (F6).

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

## Caveats the first version left out (auditor F6)

- T2 review with-arm replayed it-001's 8 recordings. cp-0 replayed 5 older ones, so review numbers are not like-for-like.
- T2 exercises only item 3, the `prepare` size pre-flight. 0 of 18 cases carry a requirement source, so for items 1–2 "within noise" says nothing.
- Under 01 §3's T3 rule, 4 of 8 medians count as real against cp-1, not only be-vs-5546: be-vs-3571 +2, be-vs-5546 −3, fe-vs-6086-d1f112e5 +2, fe-vs-6292 +2. Against a same-day base build, with byte-identical reviewer prompts, 2 of 8 are at +3 and be-vs-5546 is −1 (`it-003/decision.md` "Same-day A/A").
- Review without-arm recall fell from 0.125 to 0.094 (−0.031, within the 0.06 noise). The with-arm is unchanged at 0.156.

# it-010 decision — WPH H2-T2 (Sonnet T2 reference): **accept** (WP0-type, no behaviour claim)

**The headline is not the accept. On Sonnet the plugin's helper almost never runs in T2, so T2 cannot see changes to the review pipeline.** Review with-arm `helper-ran` is 0 of 24 and localize with-arm 1 of 30; on Opus at cp-0 they were 23 of 24 and 28 of 30.

Verdict rule from the brief: sweep complete (`partial: false`, 108 runs, 0 run errors), agent model proven from the traces, numbers reproduced by the verifier. All three hold (`handoffs/verifier.md`: no numeric disagreement). Plan revision R-3; one uninterrupted invocation, no reruns, no merge.

## Numbers (`baseline/metrics-R-1.json` T2; the Opus column is `baseline/metrics.json`, history, not a control)

```
                              Sonnet (it-010)                    Opus (cp-0)
cost, wall                    $21.26, 1,571 s                    $57.83, 3,202 s (it-003 sweep)
localize with   F1 median     0.5417 (0.5359 0.6397 0.5417)      0.6565 (0.6840 0.6565 0.6140)
localize without F1 median    0.5715 (0.6082 0.5506 0.5715)      0.6198
review with     recall median 0.0938 (0.0938 0.0938 0.0625)      0.1563
review without  recall median 0.0938 (0.0938 0.0625 0.0938)      0.1250
helper-ran localize with      1 of 30 (median 0 of 10)           28 of 30
helper-ran review with        0 of 24 (median 0 of 8)            23 of 24
Skill calls, from traces      localize/with 28 x ambicode:investigate; review/with 0; both without-arms 0
cost per run, with            localize $0.2205, review $0.1982   $0.544, $0.630
agent model                   108 of 108 traces claude-sonnet-5-5 (missing traces 0)
```

## What this means

- **With-arm and without-arm are the same experiment on review.** Recall medians are equal (0.0938 both), pooled recall is equal (0.0833 both), raised and threads are equal, turns differ by 0.17. The plugin's review skill is never called (0 Skill calls in 24 with-arm runs). A change to the review pipeline cannot move T2 review recall on Sonnet, and T2 is no control for it.
- **Localize with-arm F1 is below without-arm on Sonnet** (0.5417 against 0.5715, Δ −0.030; on Opus +0.037). The `investigate` skill fires in 28 of 30 runs, but the helper runs in 1. I did not investigate why, and no trace was read beyond counting calls.
- **Spread on Sonnet.** Localize with-arm sweeps span 0.104 (Opus 0.070), without-arm 0.058 (Opus 0.062). The 0.05 signal threshold sits inside the with-arm's own run-to-run spread. Review recall moves in steps of 1/32 = 0.031; the 0.105 threshold is 3.4 steps. Re-deriving the thresholds is a replan (09 §2 step 3, owner-confirmed, R7) and is not done here.
- **01 §1 item 3 cannot be met at the reference.** "Review with-arm `helper-ran` ≥ 6 of 8" is 0 of 8 at cp-S0, with the campaign's model pinned to Sonnet by the owner (R-1). That is a target in 01 §1: only the owner changes it. Nothing here is a regression; no product change has been made since it-003.
- Cost per run is now the Sonnet reference for the 25 % rule: localize $0.2205, review $0.1982.

## Not measured, not done

- T1, T3, T4, gates: not re-run (no file outside `gym/` changed since it-009; the verifier checked). `metrics.json` records them as `null` with the reason, not as a pass.
- **cp-S0 is NOT decided in this session.** 03 §1 requires the lead to read the auditor's handoff before a checkpoint tag, and the lead reached the soft context limit (150k) after the verifier. All cp-S0 inputs now exist (G1 at it-009, T1 and T3 A/A from it-006, T2 here, archive manifest 318 OK / 0 failed at this commit); the tag and `cp-S0.md` are the next session's first step.
- Why helper-ran is ~0 on Sonnet: not investigated (needs a kept trace of a with-arm run; a T2 case costs about $0.2 per run).
- The `claude plugin eval` exit status was 1 (threshold 1). The Opus baseline showed exit=1 on its review cases too. The result has `partial: false`.
- `metrics-R-1.json` was rewritten with `JSON.stringify`: number formatting changed (`1.0` to `1`, `§` to `§`) and nothing else outside T2, `status`, `reference`, `capturedAt`, `commit` and the top-level `costUsd` (6.6777 to 27.94, the verifier caught that it excluded the sweep).
- Two small stale items: the brief lists `OWNER-INBOX.md` at the root (it is `gym/runs/R1/OWNER-INBOX.md`); the tree carries the owner's uncommitted `gym/plan/supervisor/*` edits and `supervisor.out`, untouched and not in this commit.

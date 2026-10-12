# evals:decide, investigate only — 06_1853_localize-ambicode-with-prompt-sonnet-5-5 (2026-10-08)

Plugin arm, 20 cases x 3 runs, Sonnet 5.5, `CLAUDE_CODE_EFFORT_LEVEL=low`, CC 2.1.292, the bundle with Phases A–D and the prompt-word fix. $12.87 agent cost ($0.45 judging), 12.2 min.
Bare reference: the lock (30_2248, same effort), no bare run. Report: `../ambicode-evals-assets/reports/core/2026-10-08/06_1853_localize-ambicode-with-prompt-sonnet-5-5/`.

## Gate
```
pass  recall     with 0.520 vs bare 0.494   Δ +0.026, noise band 0.056 (inside the noise)
pass  cost       0.9776x bare (budget 1.1x)
pass  turns      -0.73 vs bare (budget +2)
GAP   meanDelta  not computable against a cached baseline
gate: pass, 1 unmeasured
```
precision 0.672 vs 0.709, F1 0.524 vs 0.530, $0.215 vs $0.219 per run, turns 9.4 vs 10.1, wall 48 s vs 59 s.
Gate answers: no headless default taken, so the eval answers covered every question.

## Per case (above the 0.056 noise band)
```
gain  be-vs-5071 1.00 vs 0.92 | be-vs-5941 0.76 vs 0.62 | be-vs-5973 0.87 vs 0.69 | fe-vs-438 0.60 vs 0.43 | fe-vs-5948 0.31 vs 0.21
loss  be-vs-6015 0.50 vs 0.58
cost  fe-vs-6141 1.24x bare; cheap cases 5071 0.82x, 5973 0.83x, 6140 0.79x, 5164 0.79x, 5967 0.72x
unstable fe-vs-438 (0.50 range)
```

## Read-many (Phase C), measured
```
                                   plugin   run 27 (earlier)
reading calls / run                3.80
  naming one path / run            1.30 (34%)   51/112 requests (46%)
paths per reading call             2.23
ambicode read calls / run          0.45    (27 calls in 60 runs; 18 runs used it at all)
Read tool / cat / grep per run     0.60 / 0.33 / 5.55
first tool call: grep 46, ambicode read 8, Grep 3, cat 2, ls 1  (of 60)
```
The model uses the tool in under a third of runs; most reads still go through Read or cat. 11 files were cut by the budget; 2 operands were refused.

## Delivered map (Phase D), measured in the run
- map-empty: in 18 runs the map listed no true file (6 cases).
- map-missed: in 12 runs the answer left out true files the map had listed (21 files).
- first call is a broad search in 50 of 60 runs.

## Not claimed
- Recall +0.026 is inside the noise band: no recall gain is established, only no loss.
- No bare run of this build was made; the comparison rests on the lock and the assumption that the naked plugin equals no plugin (gate info line).
- The gate's "skill fired 0/60" line counts Skill tool calls; typed commands do not use it, so it is not evidence the route failed (the report shows route steps in every routed run).

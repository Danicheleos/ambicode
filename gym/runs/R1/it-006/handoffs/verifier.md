# it-006 verifier handoff (Sonnet helper, read-only; a302570b9b07737c6)

Re-derived with its own commands from the raw files. Result: every number it re-derived agrees with `metrics.json`. Two claims were inexact and are corrected in `metrics.json`; one item is inferred.

Agreed (claim = re-derived): T1 7 scored cases mean 1.0, url-bare 0.4, cost 2.0854708, 133 s, partial false; url-bare fails fired-plan/-review/-task in 3 of 3 runs and passes fired-investigate 3 of 3; verb-implement passes task-fired 3 of 3. T3: 23 + 23 successful runs; per-case counts, medium-and-above counts, own stability (16 values) and set agreement (8 values) identical; floor 0.0 from be-vs-6261, without it 0.3333 / 0.5. usage: 23 + 23 runs, cost 4.4222724, turns 2:24 3:11 4:6 5:3 6:1 7:1, 24 runs with turns <= 2, 0 null. Failed runs: set 1 fe-vs-6253 run 2, set 2 be-vs-5075 run 3, both invalid-output, nothing else. recordings-before sha b4d778c9…2805; policies tree hash 20234210…5d7a; kept traces: model claude-sonnet-5-5 in all assistant messages, no Skill call in the p2-task trace, jest run by Bash.

Inexact, corrected in `metrics.json`:
1. `modelProof` said T1's result JSON names no model. It has `suite.modelOverride: "claude-sonnet-5-5"` (the flag as the harness recorded it; the T1 traces are gone, so the answering model is not shown for T1).
2. `floor.reading` said be-vs-6261's medium-and-above finding "appears in one run of six"; it is one run of three in each set. The 0 / 0 / 0 conclusion holds.

Not checked by the verifier: G1-G3 and the G2 zip hash (lead re-ran them: `verify.log`, `g3.log`), `capturedAt`, `commit`, the Opus reference figures, the it-005 preflight history. Preflight cost: kept traces sum to about $0.16 against the printed $0.17 (rounding or overhead, not resolved).
Inferred, not confirmed: which case each kept trace belongs to (the traces do not carry the prompt; the trace calling `ambicode:review` is regression-ts, the one with a `sed` fix and no Skill is p2-task-regression-fix).
The live `benchmarks/reviewer-recordings.json` was b4d778c9…2805 when the verifier looked: the owner restored it after the A/A (`labels.json` owner-note-2). The lead confirmed the same digest itself.

Guard: the verifier's first Bash call (a read-only node script containing a regex and `=>`) was denied as write-outside-roots, a false positive of the same class as the it-005 brief heredoc. It was not retried in that form.

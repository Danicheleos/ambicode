# Phase A — eval ruler (2026-10-07)

No model spend. Plan: `~/.claude/plans/immutable-snuggling-wreath.md`.

## A.1 Pinned bare constant

`evals/common/core/baseline.lock.json` (gitignored, NDA), written by `evals:bench lock <naked eval.json>` or
`select --baseline`. Locked to run 22_0553: 21 cases, claude-sonnet-5-5, Claude Code 2.1.292. The lock's per-case
recall and precision equal the old `bare-recall.json` on all 42 values.

One resolver (`baseline-lock.mjs resolveBaseline`) for score, walk, gate, report and select. Refuses: changed or
missing source, model, CC version, unknown case, changed prompt, changed truth. `findComparisons` no longer picks the
newest naked run.

## A.2 Gate

```
24_0648  cost 1.0552×  turns +1.06  recall 0.793 vs 0.556  gate: pass, 1 unmeasured
27_0733  cost 1.1008×  FAIL         recall 0.640 vs 0.556  gate: FAIL (1 of 9)
```

- The gate's default traces path missed `<iteration>/traces`, so `pinned-model` failed on all of runs 24–27 with "no run
  is traced". Fixed. Before the fix the gate failed run 24; after it, run 24 passes.
- Cost is agent cost only. Measured: run 27 agent $6.4891 plus judging $0.1859, against a harness total of $6.4891.
- `ACCEPTANCE` holds the gate and report thresholds, with `report.extraContext` set to 2,500. The report prints the
  policy it used and a `context-unmeasured` caveat when an arm has no trace.

## A.3 Terminal export

The Stop hook copies the final ledger and notes to `$EVAL_AMBICODE_EXPORT/<session>/<task>/` (with `source.json`) and
writes `ambicode stop: export failed, …` on failure. `runSweep` sets the variable to `<traces>/exports`. `harvestTraces`
lays each export over the polled copy when the export has at least as many entries.

**Unverified:** that the hook can write outside the sandbox under `claude plugin eval`. The env reaches the sandbox:
`EVAL_AMBICODE_REVIEWER_REPLAY` did in run 12_0439. The first paid run will show either export files or the failure
line.

## A.4 Read requests (notice 2 metric)

Grouped per model call. Operands come from Read and the reading segments of Bash; grep targets and pipe filters are
excluded.

| per run | bare 22 | 24 | 25 | 26 | 27 |
|---|---:|---:|---:|---:|---:|
| reading calls | 2.61 | 3.33 | 2.39 | 3.22 | 3.11 |
| single-path | 1.28 | 1.56 | 1.33 | 1.42 | 1.39 |
| paths/call (pooled) | 1.77 | 1.73 | 1.65 | 1.78 | 1.79 |
| re-read KB | 2.6 | 0.4 | 1.7 | 1.7 | 1.0 |

The analysis counts were 47/60/43/116/112 reading calls and 24/28/24/51/51 single-path. Reading calls match exactly.
Single-path counts are within one call: 23 vs 24 for bare and 50 vs 51 for run 27.

## A.5 One scorer

No change needed. The gate's recall (0.793/0.632/0.673/0.640) equals the analysis's normalized `scoreAnswer` figures
(79.30/63.16/67.33/64.02%). The report, gate and layer-audit all go through `namedFiles`.

## Not done

- The `skill fired 0/18` info line in the gate counts Skill tool calls only, while typed commands route through the
  hook. The line is misleading and was left as is.

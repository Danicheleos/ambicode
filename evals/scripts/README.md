# Eval scripts

Implementation and unit tests live under `src/`, grouped by responsibility:

| Directory | Purpose |
| --- | --- |
| `harness/` | CLI, run planning and execution, options, case locks, prompt transport, run validity |
| `cases/` | Benchmark selection and generation, including impact and reuse cases |
| `analysis/` | Scoring, traces and ledgers, walkthroughs, offline shortlist recall |
| `arms/` | Naked and LSP control plugin builders |
| `validation/` | Evaluation gates, preflight checks, reviewer evaluation and recordings |
| `shared/` | Repository and benchmark paths |
| `testing/` | Shared synthetic fixtures and suite integration tests |

`local/` is gitignored and holds one-off tools that name NDA data: `benchmark-prep/` (merge-request audit and
review preparation) and `report-tools/` (trace and call-chain analyses behind `../ambicode-evals-assets/reports/`).

`npm run evals:report -- <iteration>` writes the standard analysis of a run (`analysis/run-report.mjs`) to
`../ambicode-evals-assets/reports/<eval type>/<date>/<iteration>/`.

Every run files its output under `../ambicode-evals-assets/outputs/<eval type>/<date>/<NN>_<HHMM>_<label>/` (`iterationDir` in
`harness/run-options.mjs`) and appends a row to that date's `iterations.md`.

Unit tests stay beside their modules. Run all eval tests without model calls:

```sh
node --test 'evals/scripts/src/**/*.test.mjs'
```

The `npm run evals:*` commands retain their names. Direct CLI calls now use
`node evals/scripts/src/harness/evals-bench.mjs <command>`. That module also
reexports the existing harness APIs; internal consumers import their owning
module directly. Repository paths come from `shared/bench-paths.mjs`.

Architecture plans and historical reports may name files from the former flat
layout. Filenames are unchanged: resolve them in the directories above.
Historical input digests describe their original paths and revisions.

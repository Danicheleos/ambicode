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

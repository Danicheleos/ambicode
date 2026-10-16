# Evals refactoring — 2026-10-06

Scope: `evals/` only. Everything outside it that the move breaks or that the audit found is listed in
[01-required-outside-evals.md](01-required-outside-evals.md) and [02-src-findings.md](02-src-findings.md).
Data gaps that block generators and scaffolds are in [03-data-gaps.md](03-data-gaps.md).

## New layout

```text
evals/
  README.md                              index of the four folders
  benchmarks/<project>/                  BE-express, FE-angular, python (NDA, gitignored)
    .git/  project/  cases/
  cases/
    README.md                            which suite lives where
    .gitignore                           NDA suites stay local
    common/core/      README + cases/ + selection.json      (was evals-core)
    common/task/      README + cases/                       (was evals-task)
    common/triggers/                                        (was evals-triggers, tracked)
    common/archived/                                        (was evals-archived, tracked)
    common/reviewer-recordings/{archived.json,core.json}   (from fixtures/ and benchmarks/)
    BE-express/{impact,reuse}/  FE-angular/{impact,reuse}/  (impact/reuse pools, per project)
    python/                                                 config + candidate notes
    scripts/src/                                            harness (tracked)
    scripts/local/{benchmark-prep,report-tools}/            one-off NDA tools (gitignored)
  outputs/<type>/<YYYY-MM-DD>/
    iterations.md                        one row per iteration
    <NN>_<HHMM>_<label>/{results,traces,reports}/
  reports/<type>/<YYYY-MM-DD>/<iteration>/
```

Outputs older than 2026-10-03 were dropped. Migrated: `core/2026-10-04` (naked baseline), `core/2026-10-05` (16
iterations: probes, localize runs, decision-A run04–run11), `core/2026-10-06` (run12), `task/2026-10-06`
(walk of fe-task-vs-5164), `search-maps/2026-10-05` (20 offline map variants). Where the harness result and the
plugin's own `aggregate-result.json` differed, both are kept (`results/eval.json`, `results/plugin-eval/<ts>/`).

## Script changes (`evals/cases/scripts/src`)

- `shared/bench-paths.mjs`: one source for every path above. A case's side is its project (`BE-express`,
  `FE-angular`; `BENCH_PROJECTS`, `PROJECT_CODE_ROOTS`); `projectCodeDir`, `projectCasesDir`; `casePrefix` keeps
  case names and tags at `be-`/`fe-` so they stay comparable with earlier runs; recording paths.
- Generators (`bench-cases`, `impact-cases`, `reuse-cases`, `task-cases`, `base-scaffold`) read the project layout
  (see 03-data-gaps.md). `generate` without `--out` writes each project's full set to `<project>/cases/`; base
  scaffolds archive from `<project>/.git`. `truth.json` `side` values in the existing cases were rewritten to the
  project names (242 files).
- `run --set full` takes `--project <project>`: the eval dir is `evals/benchmarks/<project>`; `evals:full` runs
  both projects.
- `analysis/shortlist-recall.mjs`: M6 and the case sets keyed by project.
- `harness/run-options.mjs`: `iterationDir` numbers a run's folder; `resultLayout` puts traces and reports in the
  iteration when the result sits in an iteration's `results/` under `evals/outputs`, else beside it (old behavior
  for explicit `--json` elsewhere). The default `--output-dir` is `<iteration>/results/plugin-eval`. Any path
  under `evals/outputs` or `evals/benchmarks` is accepted.
- `harness/evals-bench.mjs`: walk goes to `<iteration>/reports/walk.md`; every finished sweep appends a row to
  `<date>/iterations.md`.
- `analysis/bench-score.mjs`, `cases/impact-cases.mjs`, `cases/reuse-cases.mjs`: impact/reuse cases are read and
  written per project (`--cases <dir>` overrides the root).
- `arms/lsp-arms.mjs`: `--impact`/`--reuse` collect from every project pool and rebase each scaffold's
  `benchmarks/` climb to the curated depth; `naked-arm.mjs` uses `CURATED_EVAL_DIR`.
- `validation/evals-preflight.mjs`, `evals-reviewer.mjs`: archived suite and recordings from `bench-paths`;
  reviewer output under `outputs/archived/<date>/<HHMM>_reviewer`.
- Scaffolds in `common/triggers` and `common/archived`: one more `..` to reach `fixtures/materialize.mjs`.
- `testing/evals-suite.test.mjs`: CLI subcommands are read from both `commands/<name>.ts` and `commands/<name>/`
  (the src restructure moved them into folders).
- `local/report-tools`: repo-relative ROOT; inputs point at the migrated iterations; `callchain`/`run-analysis`
  read traces beside the result they are given.

`node --test 'evals/cases/scripts/src/**/*.test.mjs'`: 291 tests, 290 pass on the full run, and the one
failure (the select scaffold anchor regex) passes after its fix (22/22 in that file). During the run the peer
session's src restructure briefly broke `#types/policy` imports; a rerun after it settled was clean.
`evals-reviewer.test.mjs` failed once under the parallel run and passes alone.

## Not done

- No generator was re-run: their inputs are gone (see 03-data-gaps.md).
- Root `fixtures/` stays where it is: `definitions.mjs`, `materialize.mjs` and `reviewer-envelopes/` are used by
  src tests, `package.json` and docs, and the peer session is editing `materialize.mjs`. Only the archived
  recordings (evals-only) moved.
- `search-maps/2026-10-05` numbering follows the original folder order, not time order.

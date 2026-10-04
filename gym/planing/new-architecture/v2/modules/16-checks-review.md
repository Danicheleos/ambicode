# Module: Checks and Reviewer (execution and independent judgment)

## Purpose

Keep what measured as strong (M18) and add what the task and review routes need: single-test runs
with proof of what ran, a sanctioned formatter, task-scoped review, an estimate before spending, and
the publication selection metric.

## Inputs

A target and options as today; from the route: `--task`, the baseline, dependents from Search;
`--approve/--decline`.

## Outputs

Unchanged artifacts under `reviews/<id>/`; `check --only`, `format`, `review --estimate` outputs;
`metrics.jsonl` from the page; ledger `baseline`, `check {phase, summary}`, `format`, `review`.

## Workflow

### 1. Pipeline (unchanged)

`assembleBundle` → partition → limits → policy → snapshot with dependents → checks → isolated
reviewer → validate → report. Status rules, error codes, publication: unchanged.

### 2. `check --only` with a runner summary (review C20)

```
$A check --task <slug> <projectId>/<checkId> --only <file>… --phase red|green
```

Reuses `runChecks` with a forced selection, authorized through `authorizeCommand` under the check's
key (`propose` asks, `forbid` refuses; no new runner). The adapter parses the runner's summary line
(jest/vitest/pytest/playwright: tests run and failed; eslint/ruff/generic: `null`). Ledger `check
{exit, phase, summary}`. The task route's rules: **red** needs `summary.failed ≥ 1` (a syntax error
in a new spec is not red); **green** needs `exit 0` and `summary.ran ≥ 1` (a wrong `--only` path that
runs zero tests is not green). Unparseable summary → `limit {red-unproven|green-unproven}`, visible
in Not verified.

### 3. `format`

`$A format --task <slug> [paths…]`: the project's `format` command on the files changed since the
baseline, same authorization; formatted files reported as such, not as `mutations`.

### 4. Task-scoped review (F5)

`review --task <slug>` excludes dirty files from the baseline that the task did not touch, listing
them under "not covered: pre-existing changes". Without `--task`: all uncommitted work, as today.

### 5. Estimate

`$A review --estimate [target]`: a dry `bundle`: files, lines, checks and decisions, waiting keys,
snapshot bytes; plus the median duration and cost of the last 5 reviews in this repository when
present ("no history" otherwise). Catches `input-too-large` and `snapshot-too-large` before the
snapshot is written. The review route prints it as the gate text ⏸ *run* / *narrow* / *skip*
(default: **skip**, non-acting).

### 6. Dependents

`dependents.ts` (name search, ≤ 8) is the default and the only path with `index: none`: **review
dependents are unchanged in the default configuration.** With an index: `relates` of changed files
and `refs --exact` for removed/re-signed exports, passed with `--context`. No LSP (D1).

### 7. Partial acceptance (`review.onInvalid: drop`)

Off by default; a flag for the experiment in 33 §6 only.

### 8. Selection metrics (D4)

The page records offered/selected/edited/posted per finding into `result.json` and
`.ambicode/metrics.jsonl` on submit. This touches `src/page/*` (41 names it).

## Interfaces

```ts
interface Checks { baseline(task); run(req); only(task, key, files, phase): Promise<CheckResult & {summary}>; format(task, paths?) }
interface Reviewer { review(target, opts); estimate(target, opts) }
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `check-only-unauthorized` 🆕 | `propose`/`forbid` | `--approve` or report as a gap |
| `format-unconfigured` 🆕 | no `format` command | "not formatted" in Not verified; `init` prints how |
| `baseline-missing` 🆕 | `review --task` before `checks.baseline` | the route runs it first |
| `snapshot-too-large` | i18n JSON over 262,144 bytes | unchanged refusal; caught by the estimate first |

## What changes from v0.4.0

Additions only, in `bundle.ts` (`--task` scoping, `--estimate`), `checks/run.ts` (`--only`, summary
parsing), `validate.ts` (`onInvalid`, off), `page/*` (metrics). Reviewer invocation unchanged.

## Open problems

- P19 Replay-miss blocks measuring review (33 §0).
- P41 Runner summary parsing is per adapter and brittle across versions; `null` is the honest
  fallback and shows as `*-unproven`.

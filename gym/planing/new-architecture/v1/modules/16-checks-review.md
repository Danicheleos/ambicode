# Module: Checks and Reviewer (execution and independent judgment)

## Purpose

Keep what measured as strong (M18): a pinned snapshot, affected-only check selection,
run/propose/forbid authorization, an isolated read-only reviewer, strict finding validation and a
four-part report. Add the four things the task route needs and the review route lacks:
single-test runs for red/green, a sanctioned formatter, task-scoped review, and an estimate before
spending.

## Inputs

- A target (working tree, branch, MR) and options, as today.
- From the route: `--task <slug>`, the baseline recorded at task start, the dependents from Search.
- Approvals and declines (`--approve/--decline <key>`), as today.

## Outputs

- Unchanged artifacts under `reviews/<id>/`; `result.json`, `report.txt`.
- 🆕 `check --only` results, `format` results, `review --estimate` output.
- Ledger: `baseline`, `check {phase}`, `format`, `review`.

## Workflow

### 1. Pipeline (unchanged)

`assembleBundle` → partition → limits → policy (`activity: review`) → snapshot plan with dependents
→ checks → reviewer (`claude --print --safe-mode --restricted --tools Read,Grep,Glob …`) → validate →
report. Every status rule, every error code, the publication page: unchanged.

### 2. `check --only` (red/green for `task`)

```
$A check --task <slug> <projectId>/<checkId> --only <file>… [--phase red|green]
```

Reuses `runChecks` with a selection forced to the given files, authorized through the same
`authorizeCommand` seam under the same key (a `propose` check still asks; `forbid` still refuses;
no new runner, per the walkthrough's pushback). Output capped at 262,144 bytes as today. Appends
`check {key, only, exit, phase}`; the task route requires `red` (exit ≠ 0) before `green` (exit 0) for
a defect iteration, and the report's Evidence line is generated from these two entries.

### 3. `format`

```
$A format --task <slug> [paths…]
```

Runs the project's `format` command (new slot, 11-policy §3) on the task's changed files only
(from `git diff --name-only` since the baseline), under the same authorization. Mutations are
expected here and reported as formatted files, not as `mutations`.

### 4. Task-scoped review (F5)

`review --task <slug>` reads the `baseline {dirty[]}` entry and excludes dirty files the task did not
touch (not in the diff since baseline for those paths), listing them under "not covered: pre-existing
changes". The default target without `--task` stays "all uncommitted work".

### 5. Estimate

```
$A review --estimate [target options]
```

A dry `bundle`: files, lines, selected checks and their decisions, which keys would wait, snapshot
bytes, and the median duration and cost of the last 5 reviews in this repository (from `result.json`
files). Catches `input-too-large` and `snapshot-too-large` before the snapshot is written. The review
route runs it first and prints it as the gate text ⏸ *run* / *narrow with --only/--exclude* / *skip*.

### 6. Dependents from the index

`dependents.ts` (name search, ≤ 8 files) is kept as the fallback. With `search.index` set, the
route's review step asks Search for `relates` of each changed file and `refs --exact` for each
exported name the diff removes or re-signs, and passes them with `--context`. The reviewer prompt's
"unchanged dependents" section is unchanged. No LSP (D1).

### 7. Partial acceptance of reviewer output

Opt-in `review.onInvalid: void|drop` (default `void`, unchanged): `drop` keeps valid findings, records
the rejected ones, and marks the status `partial`. Shipped off until an eval shows that dropped-invalid
runs produce no extra false findings (walkthrough §7 pushback).

## Interfaces

```ts
interface Checks {
  baseline(task): Promise<Baseline>;                         // head, dirty[]
  run(req): Promise<CheckResults>;                           // existing runChecks
  only(task, key, files, phase): Promise<CheckResult>;
  format(task, paths?): Promise<FormatResult>;
}
interface Reviewer { review(target, opts): Promise<ReviewResult>; estimate(target, opts): Promise<Estimate> }
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `check-only-unauthorized` 🆕 | the check is `propose`/`forbid` | `--approve` the key (propose) or report as a gap (forbid) |
| `format-unconfigured` 🆕 | no `format` command | the report lists "not formatted"; `init` prints how to add one |
| `baseline-missing` 🆕 (task) | `review --task` without a `baseline` entry | the route runs `checks.baseline` first; the message says so |
| existing codes | unchanged | unchanged (`outcomes.md`) |
| `snapshot-too-large` | i18n JSON over 262,144 bytes (3 of 8 eval review cases) | unchanged refusal with `--exclude`; the estimate step now catches it before the run |

## What changes from v0.4.0

- Four additions; nothing removed. `review.onInvalid` flag (off).

## Open problems

- P19 The eval's replay reviewer misses on any snapshot the agent did not build before (`replay-miss`
  in 10/24 and 16/24 runs). Recordings must be keyed by changed-file content hashes, not by snapshot
  id, or a live-reviewer tier must be paid for. This is an eval defect that blocks measuring review.
- P20 `--estimate` cost history needs 5 prior reviews; a fresh repository shows "no history".

# Module: Checks and Review (execution and independent judgment)

## Purpose

Keep what measured as strong (M18) and add what the task and review routes need: single-test runs
with a recorded exit, a sanctioned formatter the **model** runs, task-scoped review, an estimate
before spending, and the independent reviewer as a plugin subagent that can only read.

## Inputs

A target and options as today (`--branch`, `--base`, `--mr`, `--requirement`, `--only`,
`--exclude`, `--context`, `--with-tests`); from the route: `--task`, the baseline, the route's
requirement envelope; `--approve/--decline`.

## Outputs

Artifacts under `reviews/<id>/` (`result.json`, `snapshot-path.txt`, the snapshot's `changed.diff`
and mirrored `files/`, `brief.md`, `report.txt`, `findings.json`, `rejected-output.txt` on an invalid
answer); `check --only`, `format`, `review --estimate` outputs; ledger `baseline`, `check {phase}`,
`format`, `review {stage: pending|recorded}`, `capture {what: mr-diff}`. Every one of these
commands ends by advancing the route (12 §3.1).

## Workflow

### 1. Pipeline and the reviewer subagent (C1)

`assembleBundle` → partition → limits → policy → snapshot → checks → `result.json` with status
`partial`, `reviewer pending` → **the `ambicode:reviewer` subagent** → `review record` → validate →
report.

- `review` pins the target, mirrors it into a snapshot and writes `review{pending}`. The route's
  `brief` step (`policy.stage(before-work)` + `script(brief)`) writes `brief.md` beside it: the diff
  with the addressable line ranges per side from the hunks, the policy rules with their authority
  labels, the requirement evidence, the check results.
- The model invokes `agents/reviewer.md` with the Agent tool (`tools: Read, Grep, Glob`, model
  `sonnet`; it cannot run commands, edit or call any service), naming the snapshot directory and
  `brief.md`, and pastes its JSON answer **unchanged** into `$A review record --task <slug>`. The
  subagent can be invoked only by the review and task routes' step text; a natural-language request
  never reaches it. The human's yes for spending it is the `estimate` gate (review) or `review-offer`
  (task) (D3).
- `review record` parses the answer (one fenced block, or a bare object), validates every finding's
  location against the diff's addressable lines and the snapshot, applies the status rules and writes
  `review{recorded}` with the report. **One unverifiable location voids the whole answer**, an
  answer that is not the findings shape is a failed review (`rejected-output.txt` keeps it), and a
  failed review is never a clean one. With a check still waiting for a human, `review` stops before
  the reviewer is offered the evidence (`review-waiting` at `record`).
- Error codes, status rules and omissions: as in v6. The reviewer prompt contract is
  `agents/reviewer.md`.

### 2. `check --only`

```
$A check --task <slug> <projectId>/<checkId> --only <file>… --phase red|green
```

Runs the configured check with a forced file selection, authorized through `authorizeCommand`
under the check's key (`propose` asks through the raised gate `check-only-unauthorized`, `forbid`
refuses). **`--approve <key>` is honoured only with an `acceptance {gate: check-only-unauthorized,
key}` on record under 12 §3.4's rule** (a hook answer bound to a printed instance, or a consumed
preanswer from a trusted start; never the flag itself, G1, C1); a model-typed `--approve` without
one — in any mode, on any channel — records `declined {via: flag, reason: acting-needs-human}` and
the gate re-prints — the same rule as `review --approve` and `review-offer` (#84). An approval
re-enters the step whose command waited (`onAnswer: {approve: revise $raisedBy}`, #77). Ledger
`check {key, argv, only, exit, phase, tail, ms}`. **No runner output is parsed (C8)**: the task
route's proof is the exit code — **red** is `exit != 0`, **green** is `exit 0`; the other
combination is printed "not as expected" with its cause and stays a gap, never a proof.

### 3. `format` — model-run (#48)

`$A format --task <slug> [paths…]`: the project's `format` command on the files changed since the
baseline, same authorization; formatted files reported as such, not as `mutations`. The task route's
green step text ends with "then `$A format --task <slug>`": the **model** runs it, so the engine
never rewrites source between two model steps and the model's next `Edit` sees the formatted text.
Ledger `format {via: model, outcome: formatted|unconfigured|failed|refused}`.

### 4. Task-scoped review

`review --task <slug>` excludes dirty files from the baseline that the task did not touch, listing
them under "not covered: pre-existing changes". Without `--task`: all uncommitted work, as today.
On a task route a missing baseline is `baseline-missing` (release: `route next`, ground records it).

### 5. Estimate

`$A review --estimate [target]`: a dry `bundle`: files, lines, checks and decisions, waiting keys,
snapshot bytes; plus the median duration and cost of the last 5 reviews in this repository when
present ("no history" otherwise). Catches `input-too-large` and `snapshot-too-large` before the
snapshot is written. The review route prints it as the declared gate `estimate` ⏸ *run* / *narrow* /
*skip* (default: **skip**, non-acting).

### 6. Dependents (D8: no language service)

The bundle no longer searches for dependents: the reviewer subagent greps the snapshot with the
whole word for each name the change removes, renames or re-types (`agents/reviewer.md`), and
`--context <path>` names extra files to mirror. Names the harvest marks as colliding are in the map,
not in the review. No LSP, no `refs --exact` (backlog). Re-running the review after approving a
waiting key is route re-entry (`review-run` step, `repeat: 2`, 25), not a loop in this module.

### 7. Merge-request targets (C2)

`--mr <url>` has no provider: `script(mr-diff)` prints the project path, the iid and the two MCP
calls (`get_merge_request`, then the diff tool, every page); the `mcp__.*` hook records the diff
(`capture {what: mr-diff}`); `review` builds the target from that capture (`mr-diff-missing` until
one exists). Merge-request tests are never executed here and are dropped unless `--with-tests`. The
local review page, selection metrics and the GitLab CLI are gone; findings are displayed in the final
message and publication is the route's `publish` gate followed by a model step (25).

## Interfaces

```ts
interface Checks { baseline(task); only(task, key, files, phase): Promise<CheckOnlyOutcome>; format(task, paths?) }
interface Review { assemble(target, opts): Promise<ReviewBundle>; estimate(target, opts): Promise<ReviewEstimate>; record(task, answer): Promise<ReviewResult> }
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `check-only-unauthorized` | `propose`/`forbid` | raised gate (default decline); approve → `revise $raisedBy`; `--approve` only per 12 §3.4 |
| `format-unconfigured` | no `format` command | "not formatted" in Not verified; `init` writes the slot |
| `baseline-missing` | `review --task` before `checks.baseline` | the route runs it first |
| `snapshot-too-large`, `input-too-large` | a file or the change over the limits | unchanged refusal; caught by the estimate first |
| `mr-diff-missing` | `--mr` with no captured diff | fetch the diff through the GitLab MCP server, then `route next` |
| `review-not-accepted` | a reviewer run with no honoured acceptance, or one already spent | answer `estimate` / `review-offer` / `review-again` |
| `review-not-found`, `review-recorded`, `review-waiting` | `review record` with no pending review, an already recorded one, or one stopped on waiting checks | `review` again, or answer the waiting checks |

## What changes from v0.5.0

`bundle.ts` (`--task` scoping, `--estimate`, no dependents search), `modules/checks/run`
(`--only`, `format`, route advance at the tail), `review record` (the subagent's answer replaces the
`claude --print` child), `agents/reviewer.md`. Removed: the process runner for the reviewer, the
GitLab provider, publication, the page and its metrics, Docker remote checks, runner-output adapters.

## Open problems

- P19 Replay-miss blocks measuring review (33 §0).
- P41 No runner summary is parsed, so a check that runs no tests (a wrong `--only` path) still reads
  green by exit code, and a syntax error in a new spec reads red. Open; accepted with C8.

## v7 changes

- **Human yes for reviewer runs (A7).** `default-taken` never applies an `onAnswer` revise. Every reviewer run needs a fresh acting acceptance: `review-offer`, `review-checks` (acting `with`, default `without`), `estimate`, or `review-again`. After a task fix round the route raises `review-again` (default skip, acting `run`, `maxRevises: 2`); skip records "fix not re-reviewed". This is the final fix-round mechanism (B13).

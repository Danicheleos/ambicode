# Task lifecycle: first real use (inseer-frontend, 2026-10-16)

Cause: the first real run of init → plan → task on inseer-frontend (VS-6735). The plan route worked; the task
route could not be continued, and every attempt made a new task folder. Evidence: the task ledgers in
`inseer-frontend/.ambicode/tasks/`, the console log the user pasted, and a $0 replay of the launches on a copy
of the plan ledger.

## What happened, with the cause

| # | Observed | Cause (code) |
|---|---|---|
| 1 | 4 of 5 task routes were started by the model with `route start` in Bash (`channel: cli`, no `harnessSession`) | Unknown: the same launch replays fine through the hook. Not reproduced. |
| 2 | The user's "skip" at review-offer (AskUserQuestion) was never recorded; the route stayed at the gate | `answerGates` finds the route by the Claude session (`resolveActiveRoute`); a CLI-started route carries no session, so the hook returns silently (gate-answer.ts:42) |
| 3 | A second start made a second live route in the same task; then `route-ambiguous`, and the implementer's `check` failed `session-unbound` | `start` supersedes only the same session's routes (engine.ts:173); the error text itself suggests `--task <slug>-2`, which the model followed (`vs-6735-iter2`) |
| 4 | The restart redid iteration 1 | the next iteration = last `notes` iteration + 1, and notes are written only by the final `write` step, which an abandoned route never reaches (src/skills/brief.ts:11) |
| 5 | `… Iteration 2` made a new task with no plan (`iteration 1 of 1 · plan: none`) | `iteration N` is matched only at the start of the text; the whole text became a new slug |
| 6 | `/ambicode:task .ambicode/tasks/<slug>` made `ambicode-tasks-…` | the text is slugified, never resolved as an existing task |
| 7 | Both implementers ran in the background (`requestShape: background` in the subagent meta) | the client backgrounds subagents despite `run_in_background: false`; the return hook never advanced the route |
| 8 | test, typecheck, typecheck-spec, format were refused (`check-forbidden`) while `checks.runnable` listed them | init named the checks `test`/`typecheck`; `common-checks` allows only `lint`, `unit`, `e2e`. Iteration 1 was verified by lint only. |
| 9 | Task folders named `task-b751b52a` (init's rules route, empty text) and `https-inseer-atlassian-net-browse-vs-6735` | `mintTaskSlug` slugifies the whole text |
| 10 | `steps/` kept after the route; 10 of 34 files empty; `envelope` duplicates `requirements/*.json`; no summary | payloads are written unconditionally and never removed |
| 11 | `modules/main.md` beside `modules/main/` | note path mirrors the directory; a parent's note sits beside its folder |

## Decisions (user, 2026-10-16)

- Parallel sessions in one repository stay supported (several plans, an investigate and a PR review at once).
- Declining the review is a valid end of an iteration. An interruption never blocks a restart or a change of task.
- Iterations: one iteration, review offered, then "start the next iteration?"; again per iteration. With
  "all iterations" the route runs them itself with the review run automatically.
- A task named from a Jira/Confluence link is the issue key (`vs-6735`), no title.

## Design

**Binding.** `CLAUDE_CODE_SESSION_ID` is set in every Bash and hook subprocess and equals the hook's
`session_id` (code.claude.com/docs/en/env-vars; measured: present in this session's Bash). `route start` and
`route next` from the CLI record it as `harnessSession`, so a CLI-started route is the same session's route as a
hook-started one. Hooks keep resolving by session; parallel sessions keep working.

**One live route per task.** `start` on a task closes its live route (`exit interrupted`) whatever session owns
it. Removed: plan ownership by session (`ownerOf`, `OWNING_SKILLS`), `--fresh`, `route-busy`,
`route-ambiguous`, `session-unbound` (the task names the route). A `/clear` gives a new session id; the next
start on the task takes it over.

**Iterations.**
```
start (N = first iteration not done, or `iteration N` anywhere in the text)
→ ground → change (implementer) → format
→ review-offer [run | skip]           --all: run
→ review → fix                        when run
→ report: iteration N done (ledger entry, not notes)
→ next-offer [start N+1 | stop]       only when iterations remain; --all: start
     start → exit done; a new route for N+1 starts on the same task in the same turn
→ write (final message for this run)
```
`--all` (or "all iterations" in the request) preanswers both gates; only a user's launch (hook) may set it.
A fix limit under `--all` stops the loop and is reported as a gap.

**Task argument.** The first word resolves an existing task by slug, by `.ambicode/tasks/<slug>` path, or by
issue key; its plan is attached. Otherwise a new task is named by issue key or slug.

**Implementer.** The return hook goes: the step says "when the implementer returns, `route next`", which the
model did by hand in both real runs. The check hold stays (observed: route text leaked to the subagent 6/9).

**Checks.** A configured check runs; `propose` only for `e2e` and what a pack marks. `checks.runnable` lists
exactly what the policy will let run.

**Task folder.** No empty payloads; payload files named `<n>-<key>.md`; no envelope copy when the requirement
JSON is there; `steps/` removed at route exit; `summary.md` written by code at every exit (task, plan,
iterations with status, checks, gaps). init's rules route is named `rules`.

**Context.** A module with submodules keeps its note at `modules/<dir>/overview.md`; a leaf stays `<dir>.md`.

## Order and acceptance

P0: binding, one live route, iterations, task argument, implementer hook removal, checks.
P1: naming, task folder, summary.
P2: context layout.

Each item lands with a test that fails on the current code, replaying the real sequence on synthetic data:
plan then task from another session; skip review → next-offer → iteration 2; interrupt and restart; a path as
the task; `--all` over two iterations with auto-review; `test`/`typecheck` runnable and run. Line counts of
`src/harness` + `src/hook` are reported before and after: P0 removes more than it adds.

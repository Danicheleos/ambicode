# Task lifecycle refactor: execution plan

Read README.md first (evidence and decisions). This file is the working plan: every step has its root cause,
the files, what is deleted, the failing test that comes first, acceptance, and a status. A step is `done` only
after the main session re-ran its tests and checked the diff.

## Rules for every step (user, binding)

- The problem is at the root → rewrite the root. No if/else branches that keep the broken behaviour and patch
  the cases of the observed flow. Cut junk, add nothing that is not needed. The code should shrink.
- A limit or guard only for a confirmed case that needs intervention (a ledger, trace or real run shows it).
- Tests first: the new test fails on the current code (paste the failure), then the fix makes it pass.
  Tests that only exercise removed behaviour are deleted and listed. Assertions on kept behaviour never weaken.
- Implementation in sonnet/medium subagents; the main session briefs, then verifies: re-run the tests, read the
  diff, count lines. `npm run typecheck`, the related tests (grep the test tree for touched file names) and
  `npm run build` per step; `npm run test:unit` at the end of a step; full `npm run verify` only at hand-off (user).
- Git is read-only for Claude and subagents (no add/commit/stash/checkout/reset/restore/apply). The user commits.
- Comments ≤3 lines, why-only, no history, no spec tags. Paid runs only with the user's explicit go.

## Baseline (HEAD a4257a38, non-test lines)

```
src/harness 2266   src/hook 1261   src/cli 1099   src/modules 3859   src/skills 781
src/platform 1149  src/types 1276  src/ total 13155   tests 15660
```

## Status

| Step | Status |
|---|---|
| P0-a binding + one live route + task argument | done, verified 2026-10-16 (see P0-a result) |
| P0-b checks: configured checks run | done, verified 2026-10-16 |
| P0-d implementer return hook removed | done, verified 2026-10-16 |
| P0-c iteration loop (next-offer, --all, done by exit) | done, verified 2026-10-16 |
| P0-e iteration choice by the request (replaces next-offer and --all) | done, verified 2026-10-16 (test:unit 1148 pass/0 fail/1 skip; harness 2134→2136, skills 785→778) |
| P1-a task folder: steps/ cleanup, payload names, no empty files | done, verified 2026-10-16 (typecheck, build, test:unit 1146 pass/0 fail/1 skip; harness +13, modules +31) |
| P1-b summary.md | done, verified 2026-10-16 (src/modules/evidence/report/summary.ts, written by closeRoute) |
| P2 context: overview.md inside module folders | done, verified 2026-10-16 (context/cli-surface/skill-content 90 pass; context.ts +8/−5). `context write` still accepts the old `modules/<dir>.md` for a parent (per-file rule cannot know). Gap: a leaf dir named `overview` collides with its parent's note. |
| P3 dead code from the audits | done, verified 2026-10-16 (test:unit 1127 pass/0 fail/1 skip/1 todo; src non-test 11643; skipped: layersSource, gate repeat — see P3 result) |
| P4 scenario gaps: 8 fixes from scenario-coverage.md "Fix plan" | todo, awaiting the user's go |
| Hand-off: verify, real re-run on inseer-frontend | todo |

---

## P0-a. Binding, one live route per task, task argument

**Root cause.** A route is bound to a session the CLI invents (`runtime.ids.ownerId()` = random UUID,
src/cli/commands/route/route.ts:41), while hooks look a route up by Claude's `session_id` (`harnessSession`) via
a scratchpad pointer. A route the model starts in Bash belongs to no Claude session, so the gate-answer hook
(src/hook/events/gate-answer.ts:42), reinject and stop ignore it. `start` supersedes only the same session's
routes (src/harness/engine/engine.ts ~173), so a second start makes a second live route; then `route-ambiguous`
and `session-unbound`, and the error text itself tells the model to fork `--task <slug>-2`. The task name is the
slug of the whole text (src/modules/evidence/task/slug.ts), so a path or "<slug> Iteration 2" becomes a new task.

**Fact used.** `CLAUDE_CODE_SESSION_ID` is set in every Bash tool and hook subprocess and equals the hook
input `session_id` (code.claude.com/docs/en/env-vars; present in this session's Bash). It changes on `/clear`.
Unknown: whether a subagent's Bash gets it (irrelevant: subagent CLI calls pass `--task`).

**Rewrite.**
- A route's session is the Claude session id: hook `session_id`, or `CLAUDE_CODE_SESSION_ID` in the CLI (through
  a runtime port, faked in tests; random only when unset). Collapse `session`/`harnessSession`/`owner`.
- The scratchpad pointer goes if scanning task ledgers for "this session's live route" is cheap (measure on ~50
  ledgers and record the number here).
- One live route per task: `start` closes the task's live route (`exit interrupted`) whatever session owns it.
- Deleted: plan ownership (`ownerOf`, `OWNING_SKILLS` in src/modules/evidence/ownership.ts), `--fresh`,
  `route-busy`, `route-ambiguous`, `session-unbound`, the `--task <slug>-2` advice. The guard's plan-body/notes
  rules become "the task's live route is a plan route" (guard bundle cap in src/architecture.test.ts).
- Task argument: the first word names an existing task by slug, `.ambicode/tasks/<slug>` path or issue key
  (case-insensitive) → that task and its accepted plan. New task: issue key (`VS-6735` → `vs-6735`) from a
  Jira/Confluence URL or text; else the slug; empty text → the skill name (init's rules route → `rules`).
- `iteration N` anywhere in the text (src/skills/brief.ts:12 matches only at the start).

**Failing tests first.** (a) plan by hook in session S1, task via CLI with `CLAUDE_CODE_SESSION_ID=S2`, an
AskUserQuestion answer through the hook in S2 is recorded; (b) a second start on the task from another session
closes the first (`interrupted`) and `route next --task` works; (c) `start task .ambicode/tasks/<slug>` and
`start task <slug> iteration 2` → existing task, its plan, iteration 2; (d) Jira URL → key; empty rules text →
`rules`; (e) two sessions on two tasks: each session's hooks act only on its own route.

**Acceptance.** Tests above pass; `src/harness`+`src/hook`+`src/cli` smaller than baseline; parallel sessions on
different tasks still work.

**Result (verified by the main session: typecheck, build, test:unit 1148 pass / 0 fail / 1 skip).**
- Test file src/harness/session/route-binding.test.ts: 9 of 10 failed on old code (failure lines in the
  session scratchpad before.txt), all pass now. Scan of 51 task ledgers for the session's live route: median
  4.1 ms → the scratchpad pointer is deleted.
- Deleted: session.ts, harness.ts, ownership.ts (+ tests), route-child fixture; `ownerOf`, `OWNING_SKILLS`,
  `resolveActiveRoute`, `endedRouteInLedger`, `harnessSession`, `--fresh`, `route-busy`, `route-ambiguous`,
  `route-taken-over`. Added: `sessionRoutes`/`liveRouteOf` (ledger scan), `interrupt`/`settle` in engine.ts,
  `taskNameFor`/`TASK_PATH`/`ISSUE_KEY`.
- Lines: harness 2266→2084, hook 1261→1221, cli 1099→1082; src/ 13155→12836. Diff +503/−1470 incl. tests.
- Kept on purpose: a zero-byte `headless` marker in the hook state dir (the guard cannot scan ledgers);
  `ledgerUnreadable` still suggests `--task <slug>-2` (corrupt-ledger recovery); `session-unbound` remains only for
  `check` with no live route. A start in a session also interrupts that session's live route on another task.
- Changed assertion: slug `ORD-17 which files?` → `ord-17` (issue key by design).

## P0-b. Configured checks run — done

`decisionFor` (src/modules/policy/packs/resolve.ts) returns `run` when no pack names the command; the
`undeclared` state and its refusal are gone. `authorizeCommand` refuses only `forbid`, asks on `propose`.
`check`, the format step, `runOne`, `checks.runnable` and `checks.preflight` all use `runnableChecks`
(src/modules/checks/run/check-command.ts) → one decision, no second list. policies/common/common-checks.yaml
keeps only `e2e: propose`. Test: src/modules/checks/run/configured-checks.test.ts (failed on old code with
"Command "test" is not declared by any enabled pack"). Non-test lines +29/−27. test:unit 1200 pass, 0 fail.

## P0-c. Iteration loop

**Root cause.** An iteration counts as done only when the final `write` step saves `notes` with `--iteration`
(src/skills/brief.ts:11; the `task.iterations` handler tells the model to save them). An interrupted or
review-declined route never gets there, so a restart redoes iteration 1. One route = one iteration with no way
to go on.

**Agreed behaviour (user).**
```
start (N = first iteration not done, or `iteration N` in the text)
→ ground → change (implementer) → format
→ review-offer [run | skip]          --all: run
→ review → fix                       when run
→ report
→ next-offer [start N+1 | stop]      only when iterations remain; --all: start
     start → this route exits `done`; a new route for N+1 starts on the same task in the same turn
→ write (final message of this run)
```
Declining the review is a normal end. `--all` runs every remaining iteration with the review run; a fix limit
stops the loop and is reported as a gap.

**Rewrite.**
- An iteration is done when its route exits `done` (the start step already records `iteration`). `briefOf` counts
  done iterations from route exits, not notes. Delete the notes-based counter and the `task.iterations` handler's
  "save this iteration's notes" instruction (keep `context write` advice only if a step still needs it).
- `next-offer`: a human gate after `report-step` with `when` = iterations remain. Its "start" answer ends the
  route `done` and starts the same skill on the same task with the same launch args (preanswers included,
  `iteration N` dropped). Implement it as one generic route-language action (e.g. `onAnswer: {start: restart}`),
  not task-specific branches in the engine; document it in routes/README.md.
- `--all`: a `route start` flag that adds preanswers `review-offer=run` and `next-offer=start`. The existing rule
  already declines acting preanswers from an untrusted (model) start; the user's launch through the hook is
  trusted. The gate print of next-offer carries a one-line iteration result (files changed, checks, review).

**Failing tests first.** skip review → next-offer printed → "start" → route 2 at iteration 2 with the plan;
"stop" → write, exit done, a later start picks iteration 2; interrupted route (start again mid-change) → same
iteration; `--all` over a two-iteration plan → two routes, review run in each, one final write; last iteration →
no next-offer.

## P0-c/P0-d result (verified by the main session 2026-10-16)

typecheck ok, build ok, test:unit 1143: 1142 pass, 0 fail, 1 skip. src/ non-test 12836 → 12764; whole diff vs
HEAD a4257a38: 106 files, +708/−1945. harness 2084→2121 (restart action, `iterations.remain`), hook 1221→1104.
- P0-d: implementer-return.ts and agent-return.ts deleted (inlined into review-record.ts), `implementer-hook`
  cause, attempt counting, touched listing, async notice, git `strict` gone. change.md/fix.md: launch, then run
  Then. Work files keep only step-specific lines; generic rules only in agents/implementer.md.
- P0-c: src/skills/task/iterations.test.ts (7 tests, 5 failed before). `briefOf` counts iterations from
  `exit done`; notes counter and `task.iterations` handler deleted. `next-offer` gate [start, finish],
  `when: iterations.remain`, `onAnswer: {start: restart}`. `restart` is one generic action: `recordAnswer` writes
  `exit done` and the engine starts the same skill/task/session/channel with the head's args minus `iteration N`.
  `--all` = preanswers review-offer=run, next-offer=start (model/CLI starts declined as acting).
- Open: option named `stop` is hard-wired to exit `blocked` in `recordAnswer` (special case → P3); a fix limit
  under `--all` does not stop the loop (no observed case, not built); a restart re-runs `fetch` when the launch
  carried a requirement; `note save --kind notes --iteration` now unused (P3); `--all` only as a flag — natural
  language ("all iterations") is not recognised by the hook.

## P0-d. Implementer return hook removed

**Root cause.** In both real runs the client ran the implementer in the background despite
`run_in_background: false` (subagent meta `requestShape: background`), so the PostToolUse(Agent) return hook
never advanced the route; the model ran `route next` by hand and that worked. The hook path never worked live.

**Delete.** src/hook/events/implementer-return.ts, the implementer branch in run-hook.ts, the `implementer-hook`
cause (EXPLICIT in execute.ts, engine.ts channel), relaunch counting (`ATTEMPTS`, attempt n of 3), HOOK_LIMIT
touched-files listing, `strict` git status option (only caller), the async notice. Merge src/hook/events/
agent-return.ts back into review-record.ts if it has one user left. Keep: the check hold (`delegatedStepOf`;
observed: route text leaked into the subagent 6/9 runs without it), the work file with `## request`.

**Step text.** routes/task/change.md and fix.md: "Launch `ambicode:implementer` on {work}. When it returns, run
{Then}." Remove the `run_in_background` instruction and the "hook prints the touched files" line. De-duplicate
change-work.md / fix-work.md against agents/implementer.md (generic rules live in the agent; the work files keep
only the step-specific lines); drop change-work.md:7 ("wait for the user's answer"), which contradicts the agent.

**Tests.** The task fixture's implementer return path becomes "subagent returns → `route next`"; delete tests that
cover only the hook (attempt counting, touched list, async notice, strict git).

## P0-e. Iteration choice by the request (user, 2026-10-16)

Decision: "пусть агент решает. Если я ему в запрос указал итерацию, то он делает только ее; если нет, то делает все
начиная с первой/последней завершенной". Reason: the hook cannot read "all iterations" from free text, and a
gate asking after every iteration is the friction the user rejected.

- `iteration N` in the request: only iteration N; review-offer is asked as now; no continuation.
- No iteration in the request: every iteration from the first not done to the last; review runs
  automatically (earlier decision: "all" = auto-review); the route restarts itself while iterations remain.
- Removed: the `next-offer` gate, the `--all` flag and its preanswers (`answersOf`), the trust special case
  for it. `restart` stays as the generic mechanism if code can carry it; otherwise move it to a code step.
- Stop: a red check / exhausted fix limit ends the loop as a gap (no auto-continue past a failure).
- Tests: iterations.test.ts rewritten: no N → 2 iterations with review run, no gate; `iteration 2` → only 2,
  review-offer asked; red check in iteration 1 → no iteration 2. Line count must shrink.

### P0-e result (verified by the main session 2026-10-16)

- review-offer `when: iteration.named`; brief/review-agent/review-run `when: gate.review-offer.is(run) or iteration.unnamed`
  (`or` added to `when`, generic). next-offer gate → code step `next` (`task.continue`, returns `restart: true`).
- Deleted: next-offer, `--all`, the `restart` onAnswer action. `stop` → blocked kept: draft-ok, project-ambiguous,
  scope still use it.
- The subagent's tests proved "blocked does not continue" only via `engine.stop`; the real path (change released
  red by the check limit, route goes on to done) did continue. Main session reproduced it (test "a red change
  released by the check limit ends the loop", failed 2 routes vs 1) and fixed `iterations.continue`: the route's
  last check must have exited 0. Not covered: review findings left after the fix limit with a green check.
- Fixtures: task-fixture's default request ends with ` iteration 1` so the review-offer tests keep their gate.

## P1-a. Task folder: steps/

**Root cause.** `writeStepFile`/`payloadFile` (src/harness/engine/execute.ts ~270, 405) write every payload,
empty ones included, as `payload-<route id>-<key>.txt`, and nothing removes them. Observed: 34 files in one task,
10 empty; `envelope` duplicates `requirements/*.json`; plan and task payloads mixed.

**Rewrite.** No file for an empty payload. Names `<route n>-<key>.md` (readable, markdown). `steps/` is deleted
at route exit (nothing reads it after; verify by grep before deleting — plan-body.md is promoted before exit).

## P1-b. summary.md

At every route exit, code regenerates `.ambicode/tasks/<task>/summary.md` from the ledger: the request (and
requirement title/key), the plan file, each route (skill, start time, exit reason), iterations with status,
checks run and their results, review outcome, gaps. Renderer in src/modules/evidence (beside report), called
from the engine's exit path. No model involvement.

## P1 result (verified by the main session 2026-10-16)

- One exit point: `closeRoute` (src/harness/engine/run-context.ts) appends `exit`, removes `steps/`, rewrites
  `summary.md`. Callers: `exitRoute` (answers.ts), `interrupt` and `stop` (engine.ts). grep: no other `exit` append.
- Payloads `<route id>-<key>.md`; empty output writes no file and removes the old one; overflow `step-<step>.md`.
- `rules-apply.md` write deleted (no reader).
- Gaps: summary shows requirement keys, not titles; a route interrupted before `promote` loses `plan-body.md`;
  `partOf` may name a "Read it whole" file nothing writes (pre-existing, P3 candidate).

## P2. Context layout

A module with submodules keeps its note at `modules/<dir>/overview.md`; a leaf stays `modules/<dir>.md`. Files:
`noteOf` in src/modules/context/context.ts, the ALLOWED path rule, agents/scout.md, templates/context-format.md,
context tests. Real case: inseer-frontend `modules/main.md` beside `modules/main/`.

## P3. Dead code from the audits (2026-10-16, four read-only audits)

Cut only after P0/P1 (some items disappear with them). Each line: what, evidence.

- Engine: `onRaisedAnswer`/`applyRaisedAnswers` registry (0 registrations); `CommandContext.object` (0 callers,
  duplicates `objectOf`); `ConsentBinding.set/.draft`; `finish()` closing branch for routes ending on a code step
  (payload always empty); `sessionUnbound` no-task branch; loader `registry`/`root` params; `names()`; dead
  `'init …'` EXPLICIT causes; `evaluate()` `window`; `gate?.repeat`; `revisable: []` default restated.
- Never fired in 2029 ledgers: `draft-ok` gate (257 skipped, 0 delivered), `check-only-unauthorized` gate,
  `identical-next` limit, revise not via code (model `--revise` + `revisable`): remove unless P0 needs them.
- `repeat:` on plan.yaml:12, task.yaml:22/43, review.yaml:6/17 never read.
- routes: plan/fetch.md byte-identical to investigate/fetch.md; step text lines that repeat `Then:`/`Now:`.
- Duplicated helpers: view built 3× (context.ts viewOf, run-context.ts viewFor, engine.ts:225); `readStrict` ≈
  `readEntries`; two yaml try/catch; `validateAnswers` ≈ `unknownGate`; `KIND_DIRS` twice; `taskOf` copied in
  note.ts/report.ts; AmbicodeError→failed mapping 3×.
- Hooks: `findSessionRepository` runs twice per event (~90 ms each, measured) — pass the root down; stop-check.ts
  pass-through; SessionStart/PostCompact identical bodies.
- Platform/modules: git `showFile`, `listTree`, `gitCommonDir`, `GitOptions.gitDir` (0 callers);
  `PublicationState`, `ProviderId`, `Dependent`, `MAX_DEPENDENTS`, `DraftPolicyRule` (0 refs); `expandFiles`
  (select.ts, 0 callers); `indexHash`/`statusHash` computed, never read (6 of 10 git spawns in `touchedSet`
  wasted, measured); `layersSource` always `'default'`; breadth rule written 3×; `projectRelative` re-implements
  `toProjectRelative`; `mostSpecificRoot` reimplemented in packs.ts and glob-ignored.ts.
- CLI `note promote` / `note save --from`: no route uses them; the guard's deny text advertises them → remove both.
- Keep: platform `unsupported` branches (deliberate adapter states).
- Tests: duplicates listed in the audit (review.test.ts:227-367 vs validate.test.ts; run-hook Edit-event tests
  for a hook that is not registered; 04-B6 = 03-H6; limits-null LIM1/LIM2).
- Docs: docs/review.md, docs/compatibility.md, release-checklist.md, findings.md, installation.md (0.3.1 ×7,
  "five skills") describe behaviour the code does not have; rewrite to what ships.
- Possible bug to reproduce first: `estimate=narrow` given by flag hits `repeat 1` on estimate-step.

## P3 result (verified by the main session 2026-10-16)

typecheck ok, build ok, test:unit 1129: 1127 pass, 0 fail, 1 skip, 1 todo. Grep of docs/skills/routes/agents/
prompts/policies/src for next-offer, --all, --fresh, route-busy, route-ambiguous, harnessSession, draft-ok,
--from-draft, revisable: 0 hits. Skipped: `layersSource` (a recorded ledger field asserted by tests), `gate?.repeat`
(03-R1 asserts human-step repeat). Bug reproduced, not fixed: `estimate=narrow` via `--answer` hits `repeat 1`
on the estimate step (08-R5 todo in src/skills/review/review-route.test.ts).

## Hand-off

`npm run verify` (user). Then the user re-runs on inseer-frontend: plan → task iteration 1 → skip review →
next-offer → iteration 2 → interrupt and restart → `--all`. Their ledgers are the acceptance. Before that, the old
task folders there (`task-b751b52a`, `*-iterat`, `vs-6735-iter2`) are the user's to delete.

## How to resume after a context loss

1. Read README.md and this file; the Status table says where work stands.
2. `git status --short` and `git diff --stat` show the uncommitted step; compare with the step's file list.
3. Re-run the step's tests (names in the step) and `npm run typecheck`; a failing new test means the step is
   mid-way. Continue it; never start the next step on a red tree.
4. Update the Status table here when a step is verified.

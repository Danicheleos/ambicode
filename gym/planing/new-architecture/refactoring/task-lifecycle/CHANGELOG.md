# Task lifecycle refactor: changelog

Behaviour changes against HEAD a4257a38, grouped as removed / added / changed. Each entry names the step in
01-plan.md and the reason. Updated as steps are verified.

## Removed

| Feature | Step | Why |
|---|---|---|
| Session invented by the CLI (random UUID per `route start`) | P0-a | made model-started routes invisible to hooks; replaced by the Claude session id |
| Scratchpad pointer to the session's active route | P0-a | a cache that disagreed with the ledger; a ledger scan takes 4.1 ms on 51 tasks |
| `harnessSession` / `owner` fields beside `session` | P0-a | one session field is enough |
| Plan ownership by session (`ownerOf`, `OWNING_SKILLS`, takeover race check) | P0-a | blocked continuing a task from another chat |
| `--fresh` flag | P0-a | every start now replaces the task's live route |
| Errors `route-busy`, `route-ambiguous`, `route-taken-over`; `session-unbound` for route commands | P0-a | could not happen with one live route per task; their text told the model to fork `--task <slug>-2` |
| "Undeclared check is forbidden" rule; `lint: run`, `unit: run` in common-checks | P0-b | refused the user's `test`/`typecheck`; iteration 1 was verified by lint only |
| Implementer return hook (PostToolUse on Agent for the implementer): auto-advance, touched-files list, attempt n of 3, async notice | P0-d | the client ran the implementer in the background in both real runs, so it never fired; the model advanced by hand |
| `implementer-hook` cause, `IMPLEMENTER_AGENT_TYPE`, git `status(strict)` | P0-d | only served the removed hook |
| `agent-return.ts` shared prelude | P0-d | one user left; inlined into review-record.ts |
| `next-offer` gate, `--all` flag and its preanswers, `restart` as a gate onAnswer action (all briefly added in P0-c) | P0-e | the user: the request decides; the hook cannot read "all iterations" from text |
| `steps/` after the route | P1-a | removed at every exit; nothing reads it afterwards |
| Empty payload files | P1-a | 10 of 34 files were empty; empty output now writes no file |
| `rules-apply.md` | P1-a | written, never read by code |
| Generic rules repeated in change-work.md / fix-work.md, and "wait for the user's answer" in change-work.md | P0-d | duplicated agents/implementer.md; the wait line contradicted it (a subagent cannot wait) |
| `run_in_background: false` and "the hook prints touched files" in change.md / fix.md | P0-d | not honoured by the client / hook removed |
| Iteration counted by saved `notes` (`note save --kind notes --iteration`), `task.iterations` handler | P0-c | an abandoned or review-declined route never reached the notes step, so iteration 1 repeated forever |
| CLI `note promote`, `note save --from`, `note save --iteration` | P3 | no route or skill script calls them; the plan route uses its in-route handlers |
| `--from-draft`, `plan.isDraft`, `draft-ok` gate | P3 | 0 of 257 plan routes ever asked it |
| `check-only-unauthorized` gate, `identical-next` limit | P3 | never fired in 2029 ledgers |
| `route next --revise`, `revisable` in route files | P3 | never used by a model; revises come from code steps |
| `routes/plan/fetch.md` | P3 | byte-identical to investigate/fetch.md |
| `stop-check.ts` pass-through, `select.ts` (`expandFiles`) | P3 | no logic / 0 callers |
| git `showFile`, `listTree`, `gitCommonDir`, `gitDir`; types `PublicationState`, `ProviderId`, `Dependent`, `MAX_DEPENDENTS`, `DraftPolicyRule`, `CommandName`; `names()`, `CommandContext.object` | P3 | 0 callers |
| `indexHash` / `statusHash` in the touched-set baseline | P3 | computed, never read: 6 of 10 git spawns per touched-set |
| 9 duplicate tests (review.test.ts ×6, 04-B6, 08-LIM1/2) and the Edit-event test of an unregistered hook | P3 | covered elsewhere / tested nothing that ships |
| The dismissed-AskUserQuestion section in docs/compatibility.md | P3 | described code that does not exist |

## Added

| Feature | Step | Behaviour |
|---|---|---|
| Route session = Claude session id | P0-a | hook `session_id`, or `CLAUDE_CODE_SESSION_ID` in the CLI; CLI-started routes get gate answers, reinjection, stop checks |
| Task resolution from the first word | P0-a | an existing task by slug, `.ambicode/tasks/<slug>` path or issue key (case-insensitive) is reused with its plan |
| Task named by issue key | P0-a | `https://…/browse/VS-6735` → `vs-6735`; empty text → the skill name (init's rules route → `rules`) |
| Exit reason `interrupted` | P0-a | a new start on a task closes its live route, whichever session started it |
| `headless` marker file in the hook state dir | P0-a | the guard cannot scan ledgers; replaces what the pointer carried for it |
| Restart of a route by a code step (`HandlerResult.restart`, step `next` / `task.continue`) | P0-c, P0-e | ends the route `done` and starts the same skill on the same task with the same args; documented in routes/README.md |
| Predicates `iteration.named`, `iteration.unnamed`, `iterations.continue`; `or` in `when` | P0-e | continue only with no iteration named, iterations left, and the last check green |
| `summary.md` beside ledger.jsonl | P1-b | rewritten from the ledger at every route exit: request, requirement keys, plan, routes with exit reason, iterations with status, the report's evidence and Not verified |
| Single exit point `closeRoute` | P1-a | appends `exit`, removes `steps/`, writes `summary.md`; done, blocked, interrupted, stopped all go through it |
| `runnableChecks` | P0-b | one function behind `check`, format, `checks.runnable` and `checks.preflight` |

## Changed

| Feature | Step | Before → after |
|---|---|---|
| Starting a task that has a live route | P0-a | second live route in parallel → the old one exits `interrupted` |
| Iteration counter | P0-c | last saved notes + 1 → first iteration whose route did not exit `done`; `iteration N` anywhere in the text |
| Declining the review | P0-c | route could stall at the gate (answer lost) → report → write → exit `done` |
| Which iterations run | P0-e | one per launch → `iteration N` in the request: only N, review offered; no iteration: all from the first not done, review runs unasked, the next route starts itself; a red last check stops the loop |
| A plan without `## Iteration` headings | P0-c | run once → always iteration 1, so it can be re-run |
| Checks policy | P0-b | absent from packs = forbidden → configured = runs; a pack only narrows to `propose`/`forbid`; common-checks keeps `e2e: propose` |
| `checks.runnable` text | P0-b | listed checks the policy then refused → lists exactly what runs, marks `needs approval` |
| `checks.preflight` | P0-b | a project whose checks are all forbidden now stops `blocked` before any edit |
| change.md / fix.md | P0-d | launch, wait for the hook → launch, then run the Then command |
| Held `check` closing line | P0-d | "The route moves on when the implementer returns." → "Recorded; the main session advances the route." |
| Payload file names | P1-a | `payload-<id>-1-<key>.txt` → `<route id>-<key>.md`; step overflow `step-<step>.md` |
| Parent module note | P2 | `modules/<dir>.md` beside `modules/<dir>/` → `modules/<dir>/overview.md`; leaves stay `modules/<dir>.md` |
| Slug of a text with an issue key | P0-a | `ORD-17 which files?` → `ord-17` |
| Duplicated helpers | P3 | one each: ledger read (`entriesOf`), gate-name check (`unknownGate`), `taskOf`, error→failed mapping, breadth rule (`tooBroad`), `projectRelative`, `mostSpecificRoot` |
| Session repository lookup per hook event | P3 | twice (~90 ms each, measured) → once, the root passed down |
| docs/installation.md | P3 | version 0.3.1 → 0.6.0, "five skills" → "six skills" |

## Size

| | HEAD a4257a38 | now |
|---|---|---|
| src non-test lines | 13155 | 11643 (−1512) |
| harness | 2266 | 2048 |
| hook | 1261 | 1088 |
| cli | 1099 | 1027 |
| modules | 3859 | 3824 |
| test:unit | — | 1129 tests: 1127 pass, 0 fail, 1 skip, 1 todo |
| git diff vs HEAD | | 154 files, +1908 / −2745 |

## Open

- `estimate=narrow` via `--answer` hits `repeat 1` on the review estimate step: reproduced as a todo test
  (08-R5, src/skills/review/review-route.test.ts), not fixed.
- An auto-run iteration continues when review findings remain after the fix limit with a green check (no
  observed case).
- Not done, kept: `layersSource` ledger field, `repeat` on human steps (asserted by tests).
- Hand-off: `npm run verify` and a real re-run on inseer-frontend (user-scenarios.md, flows 1–6); delete the
  stray task folders there (`task-b751b52a`, `https-…-vs-6735`, `vs-6735-iter2`, `…-iterat`).

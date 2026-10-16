# Scenario coverage: user-scenarios.md vs the plugin as it is now

State: working tree of 2026-10-16 after P0–P3 (uncommitted). Method: four read-only audits (common + init,
investigate + plan, task, review + rules), each verdict with `file:line`; the main session re-checked the
strongest claims in code (marked ✔). Nothing was run live; "unverified" marks what only a real run can show.

Verdicts: **ok** covered · **partial** · **conflict** the code does the opposite or blocks · **missing**.

## The ones that hurt first

| # | Expectation | What happens now | Where |
|---|---|---|---|
| 1 | `plan vs-6735 …` and `task vs-6735` meet in one folder | The issue key is matched only in UPPERCASE ✔. `vs-6735 add view management` mints `vs-6735-add-view-management`; a later `task vs-6735` opens a new empty task. `UTF-8`, `SHA-256` in a sentence also count as keys. | src/modules/evidence/task/slug.ts:12 |
| 2 | Investigate → plan/task start from the investigation | Plan looks for the investigation only inside its own route's entries, so it never finds it ✔; task never reads it. Flow 6 does not work. | src/skills/brief.ts:24-30, src/skills/common.ts:127, src/modules/evidence/ledger-chain.ts:6 |
| 3 | Plan iterations drive task | Task splits a plan only on `## Iteration N` headings; design.md never asks for that heading ✔ and plan-check does not verify it. A plan with other headings runs as one brief. | src/skills/brief.ts:6, routes/plan/design.md:9-14 |
| 4 | All iterations: stop and tell me when one cannot be made green | The loop does stop (P0-e fix), but the red route still exits `done` ✔, so the next `task vs-6735` counts that iteration as done and skips to the next. The message says "complete, N not verified", not "blocked at iteration N". | src/harness/engine/execute.ts:114, src/skills/brief.ts:12-13 |
| 5 | `/ambicode:task` continues the session's task | No argument → a task literally named `task` with an empty request. Two such chats share it and interrupt each other. Same for every `review --mr <url>` (slug `review`). | src/modules/evidence/task/task-dir.ts:57 |
| 6 | Re-running init keeps my edits | The scout rewrites all context notes with `context write --replace`, deleting hand edits; config is kept only if the model re-reads it. | agents/scout.md:14 ✔, src/modules/context/context.ts:80-90 |
| 7 | No `-2` forks | Two error texts still tell the model "Continue under a new task: --task <slug>-2" ✔ — the exact text the model followed in real use. | src/harness/engine/context.ts:15, src/modules/evidence/notes.ts:27 |
| 8 | Task without tests still usable | No configured check → task exits `blocked` before any edit ✔; init never asks for the test command, so an unknown one stays null. | src/skills/task/handlers.ts:55-61, skills/init/SKILL.md:12 |

## Decisions (user, 2026-10-16), answering the list above

| # | Decision |
|---|---|
| 1 | Real problem: the key is typed in lowercase. Match it in any case. False keys like `SHA-256` are not a concern (nobody types them into a request). |
| 2 | The user points at the investigation: a path to its file or a task folder in `.ambicode/tasks/`. When given, plan and task use it. |
| 3 | The user checks the iteration headings first. |
| 4 | Failing checks never block the START of a task (it may start on a broken tree), but at the END of an iteration they must pass: a red iteration is not done. |
| 5 | `/ambicode:task` (or any skill) with no argument asks what to do first. |
| 6 | Init `--replace` overwriting hand-edited notes: not now. |
| 7 | Remove the `-2` fork hint; the model already has the slug and should continue that task. |
| 8 | Only configured checks run. A `null` check does not exist and counts as passed; no check configured never blocks a task. |
| task checks | The implementer runs checks itself, but only on the files of the change (the per-file form). A full test or lint run (`all` form) never runs silently, only with the user's approval. |
| review | Skip: severity sort, concrete fix, `!123`; GitLab only is fine. Problem: the reviewer must notice style and code smells even when no project rule names them. |

## Common expectations

| Expectation | Verdict | Notes |
|---|---|---|
| I talk in my words | partial | Links with a Jira key, existing slugs and `.ambicode/tasks/<slug>` paths work. Lowercase keys (#1), non-Jira links (become a 48-char URL slug), `!123` for an MR, `vs-6735 2` for an iteration do not. |
| One task = one folder, recognisable | partial | `vs-6735` from a URL or uppercase key ✔. A review of the task lives in a second folder `.ambicode/reviews/<slug>`. |
| Stop any time, restart continues | ok, with gaps | Any start on a task interrupts its live route; the first iteration not `done` reruns. Gaps: Esc/close leaves the route live with no `summary.md` until the next start; after `/clear` a start on another task does not close the old one; #7 fork texts. |
| Every question has a "no" | ok | review-offer, estimate, plan-accept, rules-table, check approval, decisions all default to the safe answer, and declines land in Not verified. Exceptions: `scope` gate in investigate has only `pause`; auto-review in all-iterations mode is by your decision. |
| Few questions, ask before spending | partial | No cost/time statement before the init scout, investigate, plan, or the auto-review of each iteration. Review estimate is size only (files, lines), no cost or time. |
| Nothing invented | ok | Final report is generated from the ledger; Stop hook blocks a final message without Evidence/Not verified. Raw `npm test` outside `check` is not blocked and not counted. write.md demands a "test count" that check entries never carry. |
| Folder tidy, summary.md | partial | `steps/` gone, no empty files, summary.md at every exit (P1). Still there: `plan_<timestamp>.md` (you expect `plan.md`), every `plan-draft_<ts>.md`, `requirements/*.json`, `mr-diff.*`, and `.ambicode/reviews/<slug>/` with a full diff copy, never cleaned. summary.md has no changed-files list. |
| Parallel work | partial | Different tasks: separate folders, locks, session-bound hooks ✔. Same slug in two chats (#5) silently interrupts the other one. No test for two parallel reviews. |
| Uses my tools | ok | Any configured check key runs (P0-b). Init derives commands silently and never confirms them (#8). |
| Reuses existing solutions | partial | Plan: explicit reuse sweep with `refs --declarations` (design.md:2). Task: one line "Reuse existing code before adding" (implementer.md:16), no search command. Investigate: none. Rule `reuse-before-reimplementing` applies only when init enabled the common packs (template has `packs: []`). |
| Shortest, simplest code | partial | Implementer: "Make the smallest change the brief needs" — one line. `unjustified-complexity` and `need` are `plan`/`review` only, never reach the implementer. Nothing says "no code for theoretical edge cases". |

## init

| Expectation | Verdict | Notes |
|---|---|---|
| Looks at the repo itself | ok | Scout: ls-files, context tree, declarations, README; ~8 tool calls. Note quality unverified. |
| Asks only what it cannot know, guess as default | missing | Never asks about test/e2e commands; unknown stays null (#8). Asks refresh/abort on re-run and the user's own rules, then launches the rules route with two more gates. |
| Time/cost before the expensive part | missing | Nothing before the scout subagent. |
| Config with my checks, hand-editable | ok | Commented YAML; scaffold never overwrites. |
| Teammate-useful description, submodule notes inside the folder | ok / conflict | Format ok (P2). `.ambicode/` is gitignored by init, so teammates never see it. |
| One-screen result | partial | Summary list prescribed, no length cap, no "assumed / check this". |
| Re-run updates and keeps my edits | conflict | #6. |
| Never refuses the commands it recorded | ok | Only a user pack with `forbid` can. |

## investigate

| Expectation | Verdict | Notes |
|---|---|---|
| Reads the ticket | partial | The ticket yes; linked pages deliberately not ("Keys mentioned inside it are not fetched", routes/investigate/fetch.md:3). A lowercase key without a link is not a requirement. |
| Fast to the right code via init's notes | ok | `search.map` + `context.list` in the payload. Whether the model reads the notes is unverified. |
| May use web search | partial | Neither allowed nor forbidden: not in `allowed-tools`, no instruction. It would prompt for permission. |
| Does not edit code | partial | Instruction only; the guard blocks writes only under `.ambicode/`. |
| ≤3 clarifying questions, only if ambiguous | missing | No rule. The only question is the `scope` gate when the search finds nothing. |
| Short chat answer + link, details in the file | conflict | The final chat message IS the saved note (read.md:2): full text with citations, no short form, no link. |
| Saved with `file:line` | ok | `investigation_<ts>.md`; `check-citations` verifies file and range (not meaning); a failure is recorded, not fixed. |
| Plan/task start from it | conflict | #2. |
| Faster, cheaper, as correct as bare | unverified | Last measured in evals, not in this pass. |

## plan

| Expectation | Verdict | Notes |
|---|---|---|
| Reads ticket and linked docs | partial | Ticket yes, linked docs no (same fetch.md). The design step's payload omits the requirement envelope. |
| Reuses an earlier investigation | conflict | #2. |
| Asks real design choices only | ok | design.md: material decisions only, one AskUserQuestion each, recorded as gates; unanswered → draft. |
| Splits a large ticket into iterations | partial | Iterations always required, never "proposed"; heading format not enforced (#3). |
| High-level design first, then details | missing | One pass straight to the full plan; the only checkpoint is plan-accept at the end. |
| Follows style, reuse search before writing | ok | Reuse sweep + policy rules; nothing checks the sweep ran. |
| plan.md with goal, iterations usable as implementer instructions, files, done | partial | Shape per iteration: Goal, Changes (`path:line`), Accept, Checks, Leaves out. File is `plan_<ts>.md`; no overall goal section required. |
| Short final message: five lines + undecided | missing | Route ends at `promote` with "plan saved at <path>"; no prescribed summary. |
| Hand-edited plan followed by task | ok | Read fresh at every task start. No hash check, so a broken heading changes the briefs silently. |
| Re-run revises the existing plan | partial | Same folder only with an uppercase key. The previous plan is not loaded; a new `plan_<ts>.md` is written from scratch. |
| No invented files | partial | plan-check verifies every `path:line`; a new file without a line and symbol names are not checked; a failure is recorded, not fixed. |

## task

| Expectation | Verdict | Notes |
|---|---|---|
| `/ambicode:task` = the session's task | conflict | #5. |
| `task vs-6735` = whole plan | ok | All iterations from the first not done, review automatic, next route starts itself (P0-e). |
| `task vs-6735 iteration 2` / `vs-6735 2` | ok / missing | `iteration N` anywhere ✔ (also inside free text like "fix iteration 2 handler"). A bare `2` is ignored: the whole plan runs. `iteration 9` of 2 says "every iteration is done". |
| Follows the plan or the implementation result | ok / missing | Plan yes. Investigation no (#2). |
| Says which iteration and what it will change | partial | `iteration N of M` is in the implementer's work file only; nothing tells the main model to say it to you. |
| Checks only after approval + fix without asking | conflict | See "conflicts with itself". |
| All iterations, each reviewed, stop on red | partial | #4. Also `review-again` is asked after each fix round even in auto mode. |
| Named iteration → review offered, "no" allowed | ok | Decline reads "independent review skipped — verification incomplete", not "skipped by you". |
| Interrupt and continue in the same folder | ok | Gap: files the interrupted run edited are "already changed" in the new route's baseline and stay out of its review and format (code reading, no test). |
| KISS, reuse, no theoretical edge cases | partial | See common expectations. |
| Formatted like the project | partial | Format runs once after `change`; code changed by `fix` is not re-formatted; only the per-file form of the format command is used. |
| Final message: files, checks, review, gaps | partial | Files come from the implementer's own `Changed:` text, never recorded; in all-iterations mode only the last route's evidence is in the report. |
| summary.md enough for a PR | partial | Has request, plan, routes, iteration status, checks, Not verified. No changed files, no per-iteration description, no implementer gaps. |
| Not stuck in a fix loop | ok | Bounded: 5 checks per step, 3 empty `route next`, fix ×2. You see it only in Not verified, no stop or question. |

## review

| Expectation | Verdict | Notes |
|---|---|---|
| Independent of the author's description | ok | Reviewer gets diff, rules, conventions, requirements, checks; never the MR description. |
| Applies and names project rules | ok | Rule ids in the brief and in findings; `observed`/`inherited` rules are mentioned, not enforced. |
| Side effects beyond the diff | partial / conflict | Reviewer greps callers itself. For `--mr` the files are not in the checkout ("Diff only"), yet the brief says "the code is in the checkout" — it greps whatever branch you have. |
| Style, smells, reuse, simplest solution | partial | Duplication/reuse and unjustified complexity: yes. Style and smells: excluded unless a project rule states them ("preferences the project has not adopted"). |
| Ranked by severity | missing | Reviewer order; no sort, no instruction. |
| `file:line`, why, concrete fix | partial | Has location, evidence, explanation, a "suggested comment"; no concrete fix required. |
| Clear verdict | partial | Deliberately never says "clean"; no "fix these first" line. |
| Ask before posting, post only approved | partial | Gate all/none/numbers, default none. GitLab only (no GitHub). A model-typed `--answer publish=1` may count as approval (read, not run). |
| "No findings" short | ok | |
| Cost/time estimate | partial | Files and lines only; nothing for an MR. Bug: `estimate=narrow` via `--answer` is refused (todo test 08-R5). |
| `!123` shorthand | missing | Only `--mr <url>`. |

## rules

| Expectation | Verdict | Notes |
|---|---|---|
| A sentence becomes a rule, with paths and an example violation | missing | Rules are only drafted from written sources (file or URL) with a ≥20-char verbatim quote; a bare sentence has no source. The table shows `pack/rule: instruction`, no paths, no example. |
| No text → proposes observed rules, accept/reject each | missing | Only from documents; observed rules come only from the init scout. One gate for the whole batch: apply all / apply with changes / discard. |
| Never adds an unaccepted rule | ok | Apply is bound to the exact draft hash; default discard. |
| Readable files, reviewable in a PR | partial | YAML in `.ambicode/policies/`, editable; gitignored by init, so not in PRs by default. |
| task follows, review checks, both name the rule | ok / partial | Task gets rules capped at 4 KB (rest named only); review gets all and names ids. |
| Never silently blocks my commands | ok | Only plugin checks are governed; a refusal names the pack. |

## Flows

| Flow | Verdict | Breaks on |
|---|---|---|
| 1 Ticket to PR | partial | #1 if the key is typed lowercase; #4 on a red iteration; summary.md lacks changed files; `review !<mr>` needs `--mr <url>`. |
| 2 Stepwise | ok | `iteration 1` → decline → new chat `iteration 2` → review → fix. |
| 3 Interrupted | ok | Edited files of the interrupted run fall out of the next review (baseline). |
| 4 Change of mind | ok | After `/clear` the old route stays live until the next start on it. |
| 5 Parallel | partial | Two reviews (`review` slug) or two bare `/ambicode:task` collide (#5). |
| 6 Investigate then task | conflict | #2 and the folder mismatch of free-text slugs. |

## Internal codes and flags you can see

Flags in texts that reach you or the model: `--task <slug>-2` (#7), `route start <skill> --task`, `--project <id>`
(ambiguous project, shown in the hook launch failure), `--only/--exclude` (estimate narrowing), `--branch/--mr`,
`route next`, `delete <lockFile>` (ledger-busy). Codes printed: "Review estimate unavailable: <code>" in the
review-offer gate, `<code>: <message>` as a route exit detail in summary.md, `no-check: …`. Full list with
lines is in the common/init audit (2026-10-16).

## Fix plan (from the decisions)

1. **Issue key in any case** (#1): `ISSUE_KEY` case-insensitive; `vs-6735 add view management` → `vs-6735`.
   Test: lowercase and uppercase key give the same folder.
2. **Investigation by path** (#2): a path to an `investigation_*.md` or a `.ambicode/tasks/<slug>` folder in the
   request attaches that investigation; plan seeds its map and design payload from it, task passes it to the
   implementer. Replaces the dead route-scoped lookup in `seedTextOf`.
3. **Red iteration is not done** (#4): the iteration is done only when its last check is green; a red route
   exits `blocked`, the next start redoes it. A red baseline at start is fine (only the end counts).
   Replaces the extra condition added to `iterations.continue` in P0-e.
4. **No argument asks** (#5): an empty request does not mint a task named after the skill; the skill asks what
   to do (the session's live task, the last task, or a new request).
5. **No `-2` hint** (#7): delete the two fork texts (context.ts:15, notes.ts:27); point to the same `--task`.
6. **Null checks pass** (#8): delete `checks.preflight` blocking; with no configured check the change step needs
   no green check, and the report states "no checks configured" once (an absent result is reported as absent).
7. **Check scope**: the per-file form of a check runs freely on the change's files; the `all` form is `propose`
   (asks the user) for every check. Generic in the checks policy, not per check name.
8. **Reviewer style and smells**: agents/reviewer.md assesses style and code smells on its own judgement, not
   only when a project rule states them; still no formatter-owned nitpicks.

Not now: init `--replace` (#6), severity sort, concrete fix, `!123`, GitHub, rules from a sentence, per-rule
accept, cost estimates, `plan.md` naming, reviews folder cleanup. Iteration headings (#3): after the user's check.

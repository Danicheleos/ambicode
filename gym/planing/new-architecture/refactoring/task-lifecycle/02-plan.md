# Task lifecycle, run 2: execution plan

Cause: the second real run on inseer-frontend (2026-10-16 23:20 → 10-17 00:12), on the code of 01-plan.md
P0–P3, with `.ambicode/` deleted first. Flow: init → rules → plan VS-6735 → task (no argument) → task
`VS-6735 1` → task `VS-6735` (iterations 2 and 3). This plan supersedes P4 of 01-plan.md: its eight items are
folded in below (R9) or replaced (P4 #4 → R4).

Evidence used: `inseer-frontend/.ambicode/` (ledgers of `rules`, `task`, `vs-6735`; `summary.md`; both
context passes), subagent meta and tool-result files of session e48da091, `$0` CLI replays in a scratch repo.
**The init session transcript is not on disk**: `~/.claude/projects/…inseer-frontend/` has no
`e48da091-….jsonl` (only `subagents/*.meta.json` and `tool-results/`), and no ledger exists for init by design.
Init findings therefore come from the files it left, not from its conversation.

Rules for every step are those of 01-plan.md ("Rules for every step"): rewrite the root, cut, tests first with
the failing output pasted, sonnet/medium subagents, git read-only, the user commits, paid runs only on go.

## What happened, with the cause

| # | Observed (user) | Measured | Cause (code) |
|---|---|---|---|
| 1 | Init's rules could not be applied, several times; `/ambicode:rules` failed too | rules ledger: 3 routes, `sources` gate printed 9 times; every "Use these sources" answer wrote `revise discover --source "Use these sources"` and the gate printed again | the gate option is `use these sources`; the answer arrives capitalised. `recordAnswer` tests `gate.options.includes(answer)` exactly (answers.ts:81), so the answer is "free text" and `onAnswer["*"]` revises back to discover: an endless loop. `offersOption` (gates.ts:148) is exact too |
| 2 | — | `Rule sources found: none` in all 9 prints | discover.mjs lists `CLAUDE.md`, `AGENTS.md`, … at the root only; the repo keeps `.claude/CLAUDE.md` and `.claude/rules/security.md`. Init itself found `.claude/CLAUDE.md` (its draft cites it) |
| 3 | Empty folder `tasks/e48da091-3`; "the ledger is lost" | `route next --task e48da091-3` in a scratch repo creates the folder and answers "Start one: route start <skill> --task e48da091-3". `e48da091-3` is the first `sources` gate's instance id | `withLedgerLock` runs `mkdirp(taskDirectory)` before anything checks that the task exists (ledger-lock.ts:43). Init has no route, so it never had a ledger |
| 4 | First scout pass gave an incomplete context; the second, deeper pass was what was expected | pass 1: 135 notes, **129 with an empty `Key files`**, 33.8 KB. Pass 2: 171 notes, 40 empty, 174 KB | scout recipe step 4: ONE Grep for declarations over all modules. On this repo that grep is **525 KB** (4381 tracked files under `main/`, measured with the same export pattern); the model sees a small part of it and writes stubs. `context tree` alone is 25.6 KB |
| 5 | Plan did not read the epic's children; the user chose "UI only" and it never read them | 1 requirement captured (VS-6735, 7.8 KB); the plan says "Child keys … were not fetched" | routes/investigate/fetch.md: "Read only the ticket or page itself. Keys mentioned inside it are not fetched". The scope question came before reading the children, so the answer could not be informed |
| 6 | `/ambicode:task` with no argument: stopped, wrote in chat how to run, created folder `task` | task ledger: route on task `task`, empty text, map 0 candidates, `exit human` | empty text → the task is named after the skill (P0-a). P4 #4 was not started |
| 7 | "Every choice should be an AskUserQuestion, not typed by hand" | gates already say "Ask the user with AskUserQuestion" (gates.ts:100). Prose asks without it: init SKILL ("ask refresh or abort"), review outcomes ("ask which project", "ask which target"), CLI errors that tell the user to type a command | no shared rule outside gates |
| 8 | `task VS-6735 1` "worked correctly" | it ran iteration 1, then `task.continue` started a second route (iteration 2), which the model stopped: `exit human "user asked for iteration 1 only"`. summary.md shows a phantom "Iteration 2 of 3: human" | `NAMED_ITERATION = /\biteration\s+(\d+)\b/i` does not match `VS-6735 1`; the user's scenario (`vs-6735 2`) is the bare-number form |
| 9 | Iterations 2 → 3 ran by themselves, out-of-scope question asked, not an error | as designed (P0-e) | — |
| 10 | The final chat message ends with an Evidence block useless to the user | write.md orders "the generated Evidence and Not verified sections … pasted exactly"; the Stop hook blocks a final message without them (stop.ts `problemsOf`) | the internal audit trail is the user-facing report |
| 11 | summary.md Evidence is junk; plan should write its description there, task its iteration results | vs-6735 summary: Requirements line repeats "built from the args text (not captured)" ×4; 5 Map lines "0 candidates"; 4 Baseline lines with ~20 dirty paths each; Checks "green exit 1" (phase label, not result); review ids; Revisions | `renderSummary` embeds `buildReport` (report.ts), which dumps every ledger kind. Nothing from plan or task results is recorded: the model's final message is not kept for task/plan |
| 12 | Reviews sit in `.ambicode/reviews/vs-6735`, apart from the task ("tolerable") | 5 reviews ran, one folder: each review overwrote the previous bundle | `REVIEWS_DIR` (defaults.ts:21) |
| 13 | MR review not tried: glab support was cut, the GitLab MCP works nowhere | in this machine's Claude Code session the `GitLab` MCP server is listed as "requires authentication" | not code; see Decisions |
| 14 | — | task map: 4 of 4 task routes recorded `0 candidates` | the task map is seeded from the request text (`VS-6735`), which has no terms; the plan's iteration text is not used |

## Decisions (user, 2026-10-17)

- **D1 init's folder: task `init`.** The rules route init starts lives in `tasks/init/`; `scaffold`,
  `config packs`, `config validate` and the scout's report append one entry each, so `tasks/init/summary.md`
  says what init did. Lands in R2.
- **D2 MR review: glab, as short as possible.** The GitLab MCP is broken on GitLab's side (several accounts and
  machines). Fetch an MR with `glab` (read), and publish back as one method: MR url, path, line, comment. The
  earlier provider code was ~2000 lines for this; the target is one small adapter. Lands in R11.

## Steps

Order: R1–R2 unblock init/rules; R3–R5 are the start of every skill; R6 is the largest (report and summary);
R7–R8 improve inputs; R9 carries P4; R10 is optional.

### R1 Gate answers: one option matcher; rules sources without a loop (#1, #2)

Root: three exact comparisons of an answer against options (`offersOption`, `recordAnswer`'s `free`,
`stop`/`pause`), so a capitalised label is "free text".
- One `matchOption(options, answer): string | null` in gates.ts: trim, strip `(Recommended)`, compare
  case-insensitively, return the declared spelling. The hook and the flag path convert the answer once; every
  later comparison sees the declared option. `offersOption` and `stripRecommended` callers go through it.
- rules.yaml: delete `onAnswer: { "*": "revise discover --source $answer" }`. The answer itself is the choice:
  `chosen` (script) reads it — `use these sources` → the found list, free text → the named files/URLs (the
  `named`/`urls` parsing moves from discover.mjs to chosen.mjs), `none — stop` → stop. The draft payload takes
  `script:chosen`. One question, no revise, no loop by construction.
- discover.mjs: add `.claude/CLAUDE.md`, `.claude/rules/*.md` and nested `CLAUDE.md` files (`git ls-files`,
  one level of `.claude/`) to the candidates.

Tests first: hook answer `Use these sources` on the `sources` gate → next position is `chosen`, no `revise`
entry (fails today: revise + reprint); `USE THESE SOURCES (Recommended)` → same; free text
`.claude/CLAUDE.md` → chosen lists it, no second print; discover on a fixture with `.claude/CLAUDE.md` lists it.
Acceptance: rules route reaches `draft` with one answer.

### R2 `--task` never creates a folder (#3)

- `withLedgerLock` stops creating directories. `route start` (the only creator) makes the task folder;
  every other command with `--task` that names no ledger fails `task-unknown` with the existing tasks listed
  (newest first, at most 5) and no "route start … --task <that id>" hint.
- D1 lands here if the user picks `init`.

Tests first: `route next --task e48da091-3` in an empty repo → error, no folder (fails today: folder created).

### R3 Start with no argument (#6; replaces P4 #4)

- `route start <skill>` with empty text and no `--task`: the session's latest task (ledger scan by
  session id, exists since P0-a) continues as if its slug were typed. With none, nothing is created: the
  output lists up to 3 recent tasks (slug, plan, iterations done/total, last exit) and says to ask with
  AskUserQuestion — those tasks as options, "describe a new task" as the free answer — then start with the answer.
- Delete the "empty text → task named after the skill" branch of the slug code.

Tests first: empty start in a session with a task → same task, its plan; empty start in a fresh session → no
folder, the listing (fails today: folder `task`).

### R4 The iteration number in any form (#8)

- One `iterationOf(text, task)`: `iteration N`, or a bare number right after the word that resolved the task
  (`vs-6735 2`, `VS-6735 1`). `NAMED_ITERATION` users (engine.ts:94, fold.ts, brief.ts) take it from the
  route args (`args.iteration`), parsed once at start; the regex is not repeated.

Tests first: `VS-6735 1` on a 3-iteration plan → one route, review offered, no `task.continue` restart (fails
today: second route started).

### R5 Every choice is an AskUserQuestion (#7)

- prompts/session-contract.md, one line: a choice between known answers is asked with AskUserQuestion with
  those answers as options; plain chat questions only for open answers.
- Rewrite the prose asks to that form: skills/init/SKILL.md (refresh or abort; the user's own rules),
  skills/review/references/outcomes.md (which project, which target), and every CLI error text that tells
  the model to have the user type a command or a flag (grep `details` in `src/**` for "run", "pass --").
- No code gate is added: a model-side question with no route has nothing to record.

Test: skill-content test asserting the contract line; cli-surface test that no error detail asks the user to
type a flag.

### R6 Final message and summary.md for humans (#10, #11)

Root: one renderer (`buildReport`) serves the audit trail, the chat and the summary. Split by reader; the
ledger stays the audit trail.

- **Chat final message** (task write.md, plan's last step): `Done` (the implementer's `Changed:` lines),
  `Checks` (per check: passed / failed exit N, test count when parsed, "no checks configured" when none),
  `Review` (n findings, m fixed, re-review clean / skipped by you), `Not verified` (human sentences, only when
  there are gaps). No Evidence block. The Stop hook checks only that each current gap is stated; it no longer
  demands pasted sections.
- **summary.md**, rewritten from the ledger at every exit:
  - header: request, requirement keys, plan path;
  - `## Plan`: the plan's H1 and goal line, its iteration headings, the user's decisions at plan time
    (e.g. "Plan only the UI epic parts");
  - `## Iterations`: one line per iteration with its **final** status (the latest route of that iteration —
    no phantom rows), then its result: the model's final message for that launch (saved by the Stop hook, the
    seam `answersAsNote` already uses for investigate), files changed, last result per check, review outcome;
  - `## Not verified`: the human gap lines, once.
  - Dropped from summary and chat: Map, Baseline, Navigation, Revisions, envelope origins, review ids,
    `(historical)` markers. They stay in ledger.jsonl.
- report.ts shrinks to the gap list and the per-check / per-review facts both readers use; `report --task`
  prints the summary's body.
- Check results name the outcome (`passed`, `failed exit 1`), never the phase (`green exit 1`).

Tests first: summary of a fixture ledger shaped like vs-6735 (plan, `iteration 1` route + restart stopped
`human`, iterations 2 and 3 auto) → 3 iteration rows, no Map/Baseline lines, the saved final message present;
Stop hook lets a final message without "Evidence" through and blocks one that omits a current gap.
Acceptance: report.ts + summary.ts lines go down.

### R7 Scout: key files from code, not from one grep (#4)

Root: the recipe asks the model to read every module's declarations from one grep that does not fit.
- `context write` fills each module note's `## Key files` from the declaration harvester (`harvest.ts`,
  `DECLARATION_PATTERNS`, language-agnostic): per module the files with exported declarations, most declarations
  first, capped so the note stays under `maxFileTokens`. The scout's bundle no longer carries Key files; it
  writes Purpose, Submodules, Depends on, Gotchas, and may add a few words to a key file by repeating its
  bullet (kept when the path and name match).
- agents/scout.md: delete step 4 (the grep) and the Key files paragraph; budget stays.
- Measure before/after on inseer-frontend with `context tree` + the harvester at $0: modules with declarations
  but an empty Key files must be 0 (today 129/135 after the scout). The paid re-run of init is the user's.

Tests first: `context write` on a fixture bundle with no Key files → each module note lists its exported names.

### R8 Requirements: read the children and links before planning (#5, #14)

- fetch.md: fetch the ticket, then, one level down, its children / subtasks and linked issues, whole; a
  parent epic of a story too. Ask about scope after reading, not instead of it.
- Verify `requirements.normalize` puts every captured issue in the envelope, not only the asked key (one
  test on a fixture with two captures).
- Task map (#14): seeded from the brief (the iteration's section of the plan) when a plan exists, not from the
  request text. Test: task on a planned fixture → map candidates > 0.

### R9 P4 carry-over (from scenario-coverage.md "Fix plan", items 1, 2, 3, 5, 6, 7, 8)

1. Issue key in any case (`vs-6735 add …` → `vs-6735`).
2. Investigation by path: a path to an `investigation_*.md` or a task folder attaches it to plan and task
   (replaces the dead `seedTextOf` lookup).
3. A red iteration is not done: a red last check exits `blocked`; the next start redoes it. A red baseline is
   fine. Replaces the extra P0-e condition in `iterations.continue`.
5. No `-2` fork hints (context.ts:15, notes.ts:27).
6. Null checks pass: no `checks.preflight` block; with no check configured the change step needs no green check;
   reported once as "no checks configured". `web/format (unconfigured)` stops being a gap line (#11): an
   unconfigured formatter is stated once, not as a failure.
7. Per-file checks run freely on the change's files; the `all` form asks the user (`propose`) for every check.
8. agents/reviewer.md: style and code smells on its own judgement, not only from project rules.

Each with its test as listed in scenario-coverage.md.

### R11 MR review through glab (D2)

Measured: `glab 1.118.0` installed, logged in to gitlab.com; `glab mr diff <id> -R <repo> --raw` gives a git
diff, `glab api` does REST with `-X`/`-f`.
- One adapter `src/platform/gitlab/glab.ts`: `parseMrUrl(url)` → host, project path, iid;
  `fetchMr(url)` → raw diff + `diff_refs` (base/start/head sha) + title/description from
  `glab api projects/<enc>/merge_requests/<iid>`; `comment(url, refs, path, line, body)` →
  `glab api -X POST …/discussions` with a text position. Spawned through the process port, so tests fake it.
- review.yaml: `mr-fetch` becomes a code step (`review.mrFetch`) writing `mr-diff.patch` / `mr-diff.json`,
  which target.ts already reads. `publish-run` becomes a code step posting the findings the user selected at the
  `publish` gate (the human answer is the authorisation; the code posts nothing else).
- Delete: routes/review/mr-fetch.md, publish.md, the MCP capture in mr-capture.ts (`captureMrDiff`, `patchOf`,
  `opened`, `fromChange`, `gitShaped`, `shaOf`) and its run-hook wiring.
- glab missing or not logged in → `mr-fetch-failed` with glab's own message; no fallback.

Tests: fake process runner returning a recorded diff and MR JSON → bundle sees the diff and head sha; publish
with 2 of 3 findings selected → exactly 2 POSTs with path/line/body; glab exit 1 → route ends with the message.

### R10 (optional) Reviews inside the task folder (#12)

`tasks/<slug>/reviews/<n>/` instead of `.ambicode/reviews/<slug>/`, one folder per review, nothing overwritten.
Touches `REVIEWS_DIR`, path-classes, the guard's `RUN_DIR` / `DANGEROUS` patterns. Only with the user's go.

## Not in this plan

- Severity sort, `!123`, GitHub, rules from a sentence, per-rule accept, cost estimates,
  `plan.md` naming, init `--replace`.
- The plan's `.../models/...` anchor (plan-check flagged it, the user accepted): the check worked.

## Status

Baseline before R-steps (2026-10-17): src non-test 11643 lines (harness 2048, hook 1088, cli 1027, modules 3824,
skills 771, platform 1119, types 1221); test:unit 1129: 1127 pass, 0 fail, 1 skip, 1 todo; typecheck ok.

| Step | Status |
|---|---|
| Batch 1 total | typecheck ok, build ok, test:unit 1147: 1145 pass, 0 fail, 1 skip, 1 todo |
| D1, D2 | decided 2026-10-17 (init task; glab read + publish) |
| R1 gate answers, rules loop | done, verified 2026-10-17 (`matchOption`; gate `free: true`; sources.mjs shared by discover/chosen; `.claude/` sources) |
| R2 `--task` creates nothing | done, verified 2026-10-17 (lock throws `task-unknown` with up to 5 tasks; `route start` and init commands create; D1: ledger kind `init`, `--task` on config packs/validate and context write) |
| R3 start with no argument | done, verified 2026-10-17 (route flag `needsRequest` on task/plan/investigate; empty start continues the session's task or fails `task-needed` with 3 recent tasks) |
| R4 iteration number | done, verified 2026-10-17 (`iterationOf` in iterations.ts: `iteration N` or a bare number after the task word; `task.verdict` exits `blocked` on a red last check) |
| R5 AskUserQuestion | done, verified 2026-10-17 (contract line; init/review outcomes asks; 4 CLI flag texts; gates wording; note kinds from `SAVE_KINDS`) |
| R6 final message and summary.md | done, verified 2026-10-17 (report.ts `gapsOf`/`checkFacts`/`reviewFact`/`factsOf`; summary.md: Plan, Iterations, Routes, Init, Not verified; Stop checks gaps are stated and saves the `result` note; navigation-line.ts deleted) |
| R7 scout key files | done, verified 2026-10-17 (`fillKeyFiles` in context write; $0 on inseer-frontend: 131/135 notes filled, 4 have no declarations; largest note 2975 chars; context.ts +67) |
| R8 requirements children, task map | done, verified 2026-10-17 (fetch.md: one level of children and links, cap 10; unasked fetches recorded `linked`) |
| R9 P4 carry-over | done, verified 2026-10-17 (`checks.preflight` deleted; `baseline.runnable`; `all` form always asks; reviewer style bullet) |
| R11 MR review through glab | done, verified 2026-10-17 (glab.ts 53 lines; mr-fetch/publish-run code steps; MCP capture, mr-capture.ts and the `capture` kind deleted; not run against real glab) |
| R10 reviews in the task folder | optional |
| Batch 2 total | typecheck ok, build ok, test:unit 1163: 1161 pass, 0 fail, 1 skip, 1 todo; src non-test 11643 → 11871 lines (+228) |
| Hand-off: verify, real re-run (init from scratch, rules, plan of an epic, task with no argument, `task <key> 1`, `task <key>`) | todo |

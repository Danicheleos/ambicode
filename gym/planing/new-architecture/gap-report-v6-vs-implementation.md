# Gap report: v6 architecture vs the final implementation

Date: 2026-10-06. Code at `fa37bb2` (branch `new_architecture`), after migration steps 00–09 and the src refactoring.

Inputs:
- Design: [v6/00-README.md](v6/00-README.md) and every file it links (01, 02, 10–17, 20–25, 30–33, 41, 50).
- Accepted deviations:
  - [implementation-reports/](implementation-reports/): step reports 00–09 and amend-05/06/08/09;
  - [archive/migration-plan_v7/CHANGELOG.md](archive/migration-plan_v7/CHANGELOG.md) V1–V41.
- Refactoring: [refactoring/src/01-changes.md](refactoring/src/01-changes.md), [02-findings.md](refactoring/src/02-findings.md) and README.
- Code: `src/`, `routes/`, `hooks/hooks.json`, `skills/`.

Method: I read the design and the reports. Four read-only audits then compared the code with the design, one per area: engine/harness, evidence/requirements/guard, search/policy/checks/workers, and skills/routes. I re-checked every item in §2 against the code at HEAD. Items in §3 come from the audits; I spot-checked most of them.

## Ratings

| Rating | Meaning |
|---|---|
| **BREAKS** | Contradicts a design rule (R1–R18), a user decision (D1–D19), an invariant of 12 §8, or the layer model of 02 §2. |
| **DRIFT** | Same intent, but the mechanism or a contract detail differs in a way a reader of v6 would get wrong. |
| **FITS** | A small difference that keeps the design's intent. |
| **NOT BUILT** | Designed, but absent at HEAD. |

The Origin column says whether a deviation was **accepted** (a user decision or an amendment exists), **documented** (written in a report, but never decided), or **undocumented** (found only in the code).

---

## 1. Verdict

The core of v6 holds:
- routes as data (`routes/*.yaml` plus a generic DSL);
- route position as a fold over the ledger;
- the 21 ledger kinds, all present with schemas;
- declared and raised gates, each with a release, and a DSL that refuses an acting default;
- acting answers honoured only from a hook bound to a printed instance, or from a trusted preanswer (R17);
- a completion record for every step (R18);
- the draft-first plan with a bound, idempotent `note promote`;
- the structural guard parser (the M12 case passes);
- reviewer isolation;
- `format` run by the model;
- no running LSP or language service.

Nine deviations change the architecture rather than its details (§2). Four were accepted on purpose:
- A2: owner ids;
- A4: the Stop hook saves the investigation answer;
- A5: the measured profile;
- A7a: the `review-checks` default.

Five were never decided:
- A1: the layer inversion;
- A3: a completed route never exits;
- A6: map heuristics that are not declared;
- A7b and A8: draft consent and crash repair;
- A9: routes shipped without their decision points.

v6 itself was never updated (§5). It no longer describes the plugin for investigate, session identity, search adapters or the review gates.

---

## 2. Deviations that break the architecture

### A1. Layer boundaries are crossed in both directions — BREAKS, undocumented

- **Design:** 02 §2 says:
  - "L2 knows steps, actors, evidence kinds, gates, revises and limits, and nothing about tickets, policy or code."
  - "L1 modules are independent and expose a CLI command … and an interface (the route's view)."

  Handlers are meant to be the seam between them.
- **Code:**
  - **L2 → L1 and L3.** The engine imports requirement and index logic directly:
    - `src/harness/engine/engine.ts:4-11`: config load, `startIndexBuild`, `raiseConflict`, `hasRequirement`, task slugs;
    - `src/harness/definition/flags.ts:1`: `canonicalUrl`.

    The handler registry imports every skill's table (`src/harness/engine/handlers.ts:5-10`, `#skills/*`). So the engine is wired to the skills at compile time, not registered from L3.
  - **L1 → L2.** Modules import engine internals:
    - `checks/run/check-command.ts:6-8`: `openRouteView`, `cycleEntries`, `liveHeads`, `raiseGate`;
    - `checks/run/format.ts:11`, `evidence/report/report.ts:3`, `requirements/envelope/envelope.ts:2`, `requirements/envelope/conflict.ts:1`, `workers/plan-check.ts:8`, `policy/authoring/rules.ts:7`, `review/bundle/estimate.ts:4`, `checks/review-evaluation.ts:2`;
    - `evidence/notes.ts:2`: `ownerOf`.
  - **L0 → L1.** `platform/providers/gitlab/provider.ts:23` imports `review/snapshot/exclusions`.
  - **L2 → hook adapter.** `harness/session/active-route.ts:3` imports `#hook/session/markers`.
- **Why it matters:**
  - Folders do not make a layer model; the import graph does. The refactoring README says the pass "follows the v6 architecture (L0–L3)", but only the folder layout does.
  - Modules are not independent: `check`, `format`, `report`, `plan check` and `rules` need the engine's fold to run.
  - The route engine cannot be tested or replaced without the modules. F10 (the move of `onNeedCommand`) fixed one table; the pattern remains.
- **Decide:** either record that L1 may read the fold, and define a small `RouteView` contract in `types/harness.ts` that L1 depends on, or invert it with registration. In both cases, add an import-direction test like the import-free guard test.

### A2. Session identity: owner uuid instead of the Claude session — BREAKS H2 as written, accepted

- **Design:**
  - 12 §2.3 and §8 (G2, H2): "a `plan` route has one live owner — a second session is `route-busy` … the former session is refused at write time".
  - 30 §2: the session state is a pointer that "duplicates the ledger".
- **Code** (step 03 §5.1, accepted as V38/V40):
  - The owner is an ambicode uuid, and the Claude session goes into `harnessSession`.
  - A CLI call that knows only the slug is the owner of that task's single live route (`taskSessionSource`, `src/harness/session/session.ts:18-21`).
  - SessionStart and PostCompact re-attach a new Claude session to the only orphaned route, using the ended-session marks under tmp (`src/hook/events/rebind.ts`).
- **What breaks:**
  - **The "one live owner" rule is weaker.** Any process that types `--task <slug>` acts as the owner for `route next|stop`, `note save --kind plan-draft` and `requirements normalize`. Only the Write of `plan-body.md` is still checked against the real Claude session. Consent is not widened: acting answers still need the hook marker.
  - **Ownership now depends on files outside the ledger.** The re-attachment heuristic reads tmp marks, so "route position is a pure function of the ledger" (00 "What this design is not") no longer holds for who owns the route.
  - **A route started from the CLI is never bound to a Claude session** (`src/cli/commands/route/route.ts:63`: `ownerId()`, no `harnessSession`). Its pointer is written under the uuid, where no hook looks. So on the body's fallback path (12 Failure modes, "hook did not fire"):
    - the guard denies the `plan-body.md` Write;
    - Stop never saves or checks the answer;
    - MCP payloads are never captured;
    - steps are never re-injected.

    The session sources that could bind it (`environment`, `association`, `updatedInput`, `session.ts:35-72`) are reached only from tests (refactoring 02-findings). The step 07 runner walk showed the hook firing in the sandbox (P37(b) evidence), so this path matters less than it did, but it is still the documented fallback.
- The step 03 report listed six conservative choices for confirmation (session-5-1.md "Decided conservatively"). Only the 0-S replacement as a whole was confirmed (V40). Choices 1 and 2 (slug = owner, the re-attachment heuristic) carry the risk.

### A3. A completed route with unverified items never gets an exit — BREAKS 12 §8, documented as a decision but not its effect

- **Design:** 12 §8, "Completion is not success": the **exit** is `done` when nothing is unverified, "otherwise `complete` with the report's Not verified listing each one".
- **Code:** `src/harness/engine/execute.ts:62-66` writes `exit {done}` only when the count is 0. Otherwise it writes no exit at all; the comment cites S12, so that a late answer can still change the outcome. Step 03 recorded this as "Dirty completion writes no exit".
- **Effect:** `liveHeads` (`fold.ts:23-26`) and `ownerOf` still see the route as live. A plan that finished on a defaulted `plan-accept`, or a task with one declined check, keeps:
  - holding `route-busy` against other sessions;
  - making `taskSessionSource` answer `route-ambiguous` for the slug;
  - showing up as an open route in `route status` and in eval ledger metrics.

  With the review-route rules, "complete with N not verified" is a normal ending, so this is the common case, not an edge.
- **Decide:** write `exit {complete, unverified: N}` as v6 says, and let S12's late answer reopen the route through `resumes`. Otherwise amend 12 §8 and teach ownership that "passed the last step" means not live.

### A4. The Stop hook writes evidence, and investigate has no report step — BREAKS 02 §5, 12 §8 and 15 §3 as designed, accepted

- **Design:**
  - 02 §5 has the model write the answer and run `note save --kind investigation` (ceremony 3), and the Stop hook only checks it.
  - 12 §8 lists five entry points (start, next, command tail, gate hook, resume).
  - 15 §3 says the Stop hook acts on report-shaped stops and blocks once.
- **Code** (03b, Decision A fallback, V25–V31):
  - `routes/investigate.yaml` ends at `read` with `answer: note`.
  - The Stop hook saves the final message as the note, saves a blocked answer with its problems (03b-N12), and advances the route (`src/hook/events/stop-check.ts:298`).
  - Investigate now takes **0 ceremony turns**.
  - The Stop hook has also become the checker for other routes: init's doctor read-back (09-D5), review's verbatim "not covered" block (08), and red-before-green (07).
- **What breaks:**
  - The Stop hook is now a sixth entry point and an evidence writer, which 12 §8 does not cover (crash repair, concurrency).
  - 22-investigate.md, 02 §5's walk and 30 §1's Stop row all describe a route that no longer exists.
  - This was the price of passing Decision A (run 4 failed at 1.44x; runs 8–10 passed at 1.05–1.11x). It is the right call on the numbers, but v6 has no record of it.

### A5. Ecosystem adapters replaced by a measured profile, with language knowledge still in the code — DRIFT on R16 (accepted), BREAKS on D8 (undocumented)

- **Design:**
  - R16 / D18: ecosystem knowledge "lives in adapters `init` detects": declaration patterns, source globs, runner and formatter adapters.
  - D8: "No LSP or language service of any kind".
- **Accepted (03c, V32/V33; step 09 deviations 09-E1/E2/E4/D6):**
  - Search reads a per-project `profile` that `init` measures: sources, companions, catalogs, feature kinds and the export rule.
  - There is no `ECOSYSTEMS` table and no `adapter` field.
  - This fits R16's intent better than the v6 mechanism, but v6 still describes adapters.
- **Undocumented:**
  - **LSP guidance is still shipped.** `src/modules/search/text/navigation.ts:8-33` is a per-language table that names `typescript-lsp`, `typescript-language-server`, `pyright-lsp` and their install commands. It is printed by `config` (`src/cli/commands/config/config.ts:107-108`) and emitted by `prepare` with strategy `…-then-lsp-then-…` (`src/types/prepare.ts`). The R16 test skips the file on purpose (`src/modules/config/config.test.ts:689`). Nothing runs a language server, but the user-facing text contradicts D8.
  - **Declaration patterns are hard-wired.** `src/types/modules/ecosystems.ts:2-10` is one global regex list for TS, Python, Rust, Go and Java/C#. `harvest`, `dependents` and `profile` use it directly. R16 names exactly this ("a harvest pattern hard-wired into `map`") as the thing it forbids. Being one list rather than a per-language branch makes it neutral in form, but it is neither detected by init nor declared in config.
  - **A repository with no manifest defaults to `typescript`** (step 09 deviation): the root project gets `typescript` with null commands.
  - **Test-path patterns** for Python and TS sit in `review/snapshot/exclusions.ts:39-40` and are used by the map through `isTestPath`.

### A6. The map's automatic choices are hard-coded and not recorded — BREAKS R14, undocumented

- **Design:** R14: "Every automatic choice code makes is declared, printed and recorded". D9 applied it to layer lists.
- **Code:**
  - **The layer lists are fine:** `search.layers` per mode, refusal of unknown layers, and `layersSource` in the ledger.
  - **The ranking inside the layers is not.** The 03b tuning rounds (M8–M20) added rules that change what the model sees first, with constants in `src/modules/search/text/map.ts`:
    - `TOP_FILES=8`, `PASS2_NAMES=6`, `PASS2_OUTSIDE=0.5` (:44-48);
    - `SEQUENCE_DIR_MIN=5`, `SEQUENCE_SHARE=0.8` (:324-325);
    - the layer-split test `LAYERED_SHARE=0.6`, `NAME_MAX_FILES=60` (:356-371);
    - harvest only from files the request places by path;
    - `REQUEST_WORDS`;
    - ticket-id splitting.
  - None of them is in config, and the `map` ledger entry records only `feature{root,paths}`: not which feature rule fired, how many files were demoted, or which pass-2 hits were down-weighted.
  - The route's prose retry (an empty map rebuilt from plain words, `src/skills/common.ts:108-111`) is not recorded either.
  - The profile thresholds follow the same pattern (`declarations/profile.ts:17-34`).
- **Also:**
  - The route payload (`leadsText()`) leaves out the layer list that D9 says is "printed on every run". Only `route status` shows it.
  - The route-step `--layers` override of D15 is not built: `layersSource: 'route'` is never produced.
- **Why it matters:** recall moved by ±0.05 between tuning rounds on these constants. These are the tuning levers, and a user cannot see or change them.

### A7. Acting effects without a human answer — BREAKS R4/R17 as worded

- **a) The `review-checks` default runs the reviewer (accepted, amend-08).**
  - `routes/gates.yaml:36-42` gives the default `without` with `onAnswer: {without: "revise $raisedBy"}`, and the engine applies `onAnswer` to `default-taken` too (`src/harness/gates/answers.ts:81-86`). So an unanswered or headless gate re-enters `review-run`, and the reviewer runs.
  - A `$raisedBy` revise skips the `repeat` check whatever path it came from (`answers.ts:35-41`). v6/32 §3 exempts it only from the build-time check. The only remaining bound is one answer per review entry (`src/skills/review/handlers.ts:61-62`).
  - The earlier `estimate=run` answer covers spending on a review, so the risk is small. But this is now the only gate whose default acts, and R4 says no default acts.
  - v6 25 step 5 had per-key `check-only-unauthorized` gates, default decline, and `repeat: 2`.
- **b) `draft-ok` declares no acting option (carried over from v6, undocumented).**
  - `routes/task.yaml:18-25`, `engine.ts:155`.
  - "implement anyway" is accepted from a model-typed `route next --answer`, or from `--from-draft` on an untrusted CLI start, which becomes a preanswer.
  - Implementing a plan nobody accepted is an acting choice. R17's "a flag the model can type never creates authority" applies, and v6 24 step 1 left this open.

### A8. A crash between an answer and its effect is not repaired — BREAKS 12 §8 invariant 6, undocumented

- **Design:** 12 §8: a crash between any two writes is repaired by the next entry point.
- **Code:** `answers.ts:81-86` appends the acceptance first, then the `onAnswer` revise or the stop exit. On re-entry `applyRaisedAnswers` (`execute.ts:243-247`) replays only the raised-gate handlers.
- **Effect:**
  - If a human *Revise* loses its `revise` entry, the gate reads as done and the route moves forward.
  - If `draft-ok=stop` loses its exit, the task goes on to `ground` and `red`.

  The window is small: two appends under one lock. Still, the invariant claims it is closed, and S-fixtures only cover the note-promote half.

### A9. Routes shipped without their decision points — BREAKS R10/R13 in spirit, documented as pending

- **Design:**
  - 33 and 41: every module has a decision point, and the user decides on numbers.
  - R10: "Nothing is mandated before it is measured".
- **State at HEAD:**
  - Only investigate was decided: Decision A passed on runs 8–10, after A4 and A6.
  - Still pending:
    - 5-I (index value; `search.index: none` until decided);
    - 6-P (plan composite);
    - 7-T (task suite; the runner walk left four open items);
    - 8-F and 0-R (live reviewer);
    - the harness-trust probe P58 (the `harness` channel is a rejecting stub, `session.ts:27-28`).
  - The plan, task, review, init and rules routes are all on by default with no measurement behind them.
  - amend-08 also set review limits to null (unlimited), and "review results from this step on are not comparable with earlier ones". So the review baseline that 01 §1 measured is gone too.
- Nothing here is hidden; every step report lists it. But the architecture's central promise, that the plugin earns its place by number and the user decides, has been tested for one skill of six.

---

## 3. Deviations that change mechanism or contracts (DRIFT)

| # | Area | Design | Implementation | Origin |
|---|---|---|---|---|
| B1 | Fold | 12 §1: a human revise resets `repeat` on **the steps it covers** | `cycleEntries` (`fold.ts:153-155`) resets every step after any human revise | undocumented |
| B2 | Start | 12 §2.3: `--fresh` supersedes the route being resumed | supersedes **every** live head of the skill on the slug, including other sessions' side-by-side routes (`engine.ts:200-201`) | undocumented |
| B3 | Consent | windowed consent | a raised gate's consent (`check-only-unauthorized`) is read over the whole chain (`context.ts:109`), so an approve from an earlier cycle still counts | undocumented |
| B4 | Same-error bound | 12 §4: `promote→plan-accept` re-ask bounded by the same-error counter | the counter is never reached on the `onFail` path (`execute.ts:159-166`) | undocumented |
| B5 | Stop | 15 §3 / 13: generated sections "present and unchanged" | compared only when the text already contains both headings (`stop-check.ts:122`), so a report that leaves them out passes; "accepted/approved" is satisfied by any bound acceptance in the chain (`:129`) | undocumented |
| B6 | Requirements | 14 §2: asked URLs of any kind; `mention` relation | a URL that is neither Jira nor Confluence is keyed by its raw URL (`envelope.ts:19-22`), and no capture produces that key, so it is always `missingAsked` and a review on it always refuses; `mention` is not in the relation enum; `requirements-server-disconnected` is never raised | undocumented |
| B7 | Ceremony | 02 §5 / 24 / 25: task 1–2, review 1–2 | task 2–3 (`task-write.md:8`, `plan-fetch.md:4`), up to +3 on the no-red path (re-print ladder instead of `limit {no-red}`); review up to 4 (`review-readback.md`, `review-view.md` each end with `route next`); investigate fell from 3 to 0 (A4) | partly documented |
| B8 | Plan and task map | 23 step 3: seed from the note's citations and the AC identifiers; 24 step 2: from the brief's paths and symbols | `search.map` always gets `paths: [], symbols: []` (`src/skills/common.ts:97-107`); a task from a plan ranks the string "iteration N of <slug>" | undocumented (step 06 follow-up noted empty maps) |
| B9 | Policy staging | 11 §2 table | `before-report` gets every carried rule; `before-checks` only late code-style rules; task delivers `before-work` and `before-checks` together at `ground`; investigate gets no `before-report` (`stage.ts:26-31`, `task.yaml:28`) | undocumented |
| B10 | Budgets | no turn budget; D10: turns reported, not steered; 31: only Stop reads the transcript | `budget.toolTurns` in the DSL and in `investigate.yaml`; the guard counter reads the transcript; **not registered** in `hooks.json` (03b round 6), so it is dead config | documented |
| B11 | Hook matrix | 30 §1: Bash `if:` includes `Bash(*ambicode.mjs*)`; `updatedInput --task`; guard asks for `rm -rf` at the repo root | the `ambicode.mjs` matcher and `updatedInput` are absent (P47 not run, accepted); the `rm -rf` row exists in `guard-core.ts:246-249` but is reachable only when the command also matches `git *`, `glab mr*` or `*.ambicode/task*` | partly accepted |
| B12 | Headless guard | 30 §6: a guard `ask` in headless → `stop:blocked`, counted | no headless handling in the guard; no step text tells the model to record `route stop --reason blocked --detail "permission-denied: …"` (step 07 follow-up on 03-E13) | documented |
| B13 | Task route | 24: `fix.when: gate.review-offer.is(run)`; waiting key per D15 | `fix.when: revised`; `openAt` raised gates, D15 amended in-session (PLAN-1/PLAN-2) — **no amend-07 file and no CHANGELOG entry exist**; the report says "the amendment file is the dispatcher's" | accepted, record missing |
| B14 | Review limits and evidence | 41: `prompt.ts`, `report.ts`, `limits.ts` kept byte-for-byte; quality review without requirements | limits null = unlimited; route envelope passed in-process as evidence; reviewer argv gains `--tools`/`--json-schema` from the runner; `snapshot/target.ts:43` `gitCommonDir()` → `gitDir()` (changes which index is copied in a linked worktree; probably a fix, never recorded) | accepted except `target.ts` |
| B15 | Workers | 17 §1: run/inline/skip gate, `workers.approved` | `worker run <id>` runs any definition under `<plugin>/workers/` with no gate; `workers.approved` is never read (harmless: no worker ships); worker route steps throw `internal` (`execute.ts:283`) | undocumented |
| B16 | Init | 20: one question with separate MCP-server, runner and `search.index` choices; model steps 2 and 6 | `key=value` text under *Adjust*; listing the servers and reading back the doctor table moved into skill and payload text; `ConsentBinding.set` unused, values bound through the print's `Values:` line; step 09 says both "the writer never re-detects" (Decisions) and "apply re-detects after consent; only the override set is bound" (follow-up N6) | accepted (amend-09), N6 contradiction open |
| B17 | `prepare` | 31: the whole command aliases `route start` for one release | only `--activity investigate` is aliased (`prepare.ts:41-51`); other activities run the old prepare, including the LSP guidance (A5) | undocumented |
| B18 | Headless visibility | 12 §2.4: "headless set by the model" in the start message and `route status` | shown only in the report's Not verified (`report.ts:89`); `route status` lists neither mode/channel nor the automatic revises (`status.ts:47-60`) | undocumented |
| B19 | Gate print | R12: three unanswered advances, then the default | the print says "Do not run a route command before then" (`gates.ts:131-133`); a dismissed question gets no hook answer, and the three advances need commands the model was told not to run | undocumented |

## 4. Small differences that keep the intent (FITS)

- Ledger field names: `search {hits, bytes}`, `worker.worker`, `note.note`, `requirement.capture: full|list`, `step` statuses `failed|repeated`, `format.outcome`. `route` was added on check, revise and exit (step 00 contract). Ids come from the writer, not `<session8>`. Old `L<n>` ids are still read.
- Expansion hit keys live in the search capture files, not the ledger (04-X). AC ids are positional (D10).
- The guard keeps its own strict ledger reader, which must stay equivalent to `readLedgerStrict` (step 02 follow-up). It denies the plan-body Write when the ledger is over 1 MiB; the design only warns. Its `.gitignore` deny matches a `.gitignore` in any subdirectory.
- `--from` resolves relative to the task directory only (02-D3).
- Index freshness is measured by drift, not HEAD (amend-05 P3, N7). `delta(base)` is not built. Impact rows need a numeric depth ≤ 1.
- The `scope` gate offers only `pause`, which exits as `human`. The `sources` gate offers *use these* / *none — stop*. Rules' *Apply with changes* is now `revise draft`. All are non-acting.
- `report-step` has `onFail: revise fix`, bounded by `fix.repeat`. Task `wallMinutes` is 90 (design 45).
- The `index.present` predicate is always false (`fold.ts:88`), because no route uses an index step yet.
- `estimate` history is all or nothing: fewer than 5 timed reviews means "no history". There is no warm index rebuild after `review`, only after `check`. `plan check` ignores bare paths; it checks only `path:LINE` anchors.
- The report is thinner than the 13 §4 skeleton: no hashes or relation labels on requirements, no layer timings, no answer times, revisions show only the last reason.
- Step files are named `steps/<chain>-<step>.md`. `--show` prints a stored payload by key, not "the rest" of a capped reply.
- Delivery also writes: re-injection can append `step delivered` or raise `budget-exhausted`, where 12 §8 calls a re-print delivery-only.
- Hook timings: the MCP hook with no route takes 108 ms against a ≤ 90 ms budget (user: keep as a reported deviation). The 1 MiB plan-body check takes 51–52 ms against 50 ms.
- Rules `SKILL.md` is 2,994 B (cap 2.5 KB). Every other body fits; investigate is 900 B.
- Artifact files are capped at 9 per minute (refactoring F9, new `artifact-collision` code).

## 5. Documentation gaps

1. **v6 is stale for every item in §2 and most of §3.** The fix is a v7 with a CHANGELOG, not edits to v6. The refactoring already edited path strings inside v6 in place; its README says so, and line numbers next to those paths were not re-derived.
2. **No amendment record for step 07** (B13). The step 09 deviations that 03c superseded (09-E1/E2/E4/D6) are in the step report only, not in the CHANGELOG. The CHANGELOG stops at V41 (step 08).
3. **The refactoring README calls the layout L0–L3 without qualification** (see A1).
4. **Open questions that are written down but never answered:**
   - session-5-1's choices 1–6 (A2);
   - step 09 N6 against its Decisions (B16);
   - step 01's `LEDGER_LIMIT` timing (51–52 ms);
   - the hook-path bundle size (MCP hook at 108 ms).

---

## 6. Suggested order

1. **Decide A3 (exit on completion) and A8 (crash repair).** Both are engine correctness under 12 §8, are small, and touch the ownership and busy logic that A2 depends on.
2. **Decide A7b (`draft-ok` acting) and B1–B3** (repeat reset, `--fresh` reach, consent window). Each is a one-line rule with an existing fixture pattern.
3. **Remove or move the LSP guidance** (A5, B17: finish the `prepare` alias or delete it). Move the declaration patterns behind the profile, or declare them in config.
4. **For A6,** record in the `map` ledger entry which ranking rules fired. Then decide whether the constants go into config, or whether R14 is narrowed to layer selection.
5. **For A1,** pick a direction (a `RouteView` contract or registration) and add an import-direction test.
6. **Write v7 of the design** covering A2, A4, A5, A7a, B7, B13 and B14.
7. **A9 stays the user's call:** which decision runs (6-P, 7-T, 8-F/0-R, 5-I) to authorize before the plan, task and review routes are treated as shipped.

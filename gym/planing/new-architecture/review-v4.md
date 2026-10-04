# Review of `new-architecture/v4` (2026-10-04)

Fourth round, under the approval criteria the user set. I read CLAUDE.md, review-v1/v2/v3, all 25
v4 files, the measurement directory (README with provenance note, `results.log`, `queries.log`),
and re-checked every code, log and eval citation v4 makes against HEAD. Tools: `sed`, `grep`,
`wc`, `ls`, `diff`, `git stash list/show`, one read-only `node -e` over a results JSON, and one
read-only unit test (`node --test evals/scripts/src/evals-bench.test.mjs`, fails at HEAD as M22
says). No eval, no probe, nothing spent. Numbering continues from review-v3 (last item 100).

## 1. Verdict

**REWORK — narrow.** Criterion: "any critical" (two). Counts: **2 critical, 3 high, 7 medium**.

Everything review-v3 asked for landed in the text (§3), the six new decisions are applied
faithfully (§5), and the ten spot-checked v1/v2 must-items still hold (§4). What blocks approval is
one wrong claim about the eval harness that the deciding measurement depends on (#101), one
provenance hole in the acceptance rule that stood unnoticed since v3 (#102), and three
contradictions in the route DSL and fold (#103–#105), two of them created by v4's own fixes.
Every finding below carries exact replacement text; applying the twelve edits as written should
make the next round an APPROVE without further discovery.

## 2. Findings

Severity per the criteria. "Why new" per rule 2: (a) introduced by a v4 change, (b) newly
verifiable, (c) missed by an earlier review.

| # | Cat | File §section | What is wrong | Evidence | Why new / prior item | Exact fix |
|---|---|---|---|---|---|---|
| 101 | **critical** | 33 §0.2, §1–2; 41 step 0 | **The deciding measurement cannot be gated as written.** 33 §0.2 says `evals:gate` "refuses a changed prompt — the check is scoped to `prompt.md`", so the plugin arm can run `prompt.with.md` while the cached 2026-10-02 baseline stays the naked reference. The gate does not check `prompt.md`; it compares the **prompt each run recorded**: `withBaseline` refuses when `cached.promptMarkdown !== evalCase.promptMarkdown`, and `promptMarkdown` is written by `claude plugin eval` per case from the prompt it actually served (a results file at HEAD carries it, 6,491 chars for one case). A plugin-arm run on `prompt.with.md` records the typed prompt → the gate refuses → 33 §1's decision point (41's point of no return) has no gated number. 41 step 0's "measured by: `evals:gate` accepts the cached baseline against a plugin-arm run" cannot be true without a gate change the text does not list. | `evals/scripts/src/evals-bench.mjs:670-676` (`:674` the refuse); `evals/evals-core/results/eval-2026-10-02T17-32-47-811Z.json` case keys include `promptMarkdown`; `evals/evals-core/README.md:198-204`; `33-measurement.md:17-25`; `41-migration.md:8` | **(a)** v3 33 §0.2 ran a **new** two-arm baseline on the new prompts, so no gate mismatch existed; v4 (D19) keeps the cached baseline and adds the "scoped to `prompt.md`" claim. Not a D19 problem: no new run is needed, a harness change is. | 33 §0.2, replace "`evals:gate` compares the baseline's **naked** prompt (`evals-core/README.md:198-204` refuses a changed prompt — the check is scoped to `prompt.md`), so the cached 2026-10-02 baseline remains the naked reference" with: "`evals:gate` refuses a case whose **recorded** prompt differs from the baseline's (`withBaseline`, `evals-bench.mjs:674`, compares `promptMarkdown`, which `claude plugin eval` records from the prompt it served). The runner therefore records the naked `prompt.md` as `promptMarkdown` for every case and the served `prompt.with.md` under a new `pluginPromptMarkdown` field; `withBaseline` keeps comparing `promptMarkdown`, so the cached 2026-10-02 baseline is accepted and a changed naked prompt is still refused. This is a step-0 harness change with its test." 41 step 0 "Measured by": append "(after the `promptMarkdown` change in 33 §0.2)". |
| 102 | **critical** | 12 §2 step 4, §3.3, §3.4; 13 §3; 30 §6 vs R3 | **An acting option is honoured on a record the model can create.** `route start --answer <gate>=<option>` appends `preanswer {via: prompt}`, consumed as `acceptance {via: prompt}`, and §3.4 honours acting options from `via: prompt` unconditionally (promote a plan, run the reviewer, run a `propose` check, apply packs). `route start` has two entry points (12 §2 "Entry points": the hook, and **the model** via the skill body's fallback line). A model that runs `$A route start plan ORD-17 --answer plan-accept=Accept` in an interactive session produces an acceptance nobody made, and `note promote` runs on it. The same flag on `route next` is `via: flag` and refused interactively (§3.3) — the asymmetry is in one table. `Engine.start` already carries `channel: 'hook'\|'cli'` (12 Interfaces) and nothing uses it. R3 forbids exactly this: "an acceptance the model typed as a flag". | `modules/12-route.md:75-79, 85-86, 124, 136-137, 144-148, 249`; `modules/13-evidence.md:70-72`; `01-goals-and-constraints.md:99` | **(c)** missed by review-v3 (and v2): v3 12 §2.4 "for each `--answer`, append `acceptance {gate, answer, via: prompt}`" and v3 §3.4 honoured acting from `via: prompt` the same way; v4 only renamed the record to `preanswer` (#78). Graded by the letter of the critical criterion ("an acting option honoured without a human/headless record"); the fix is one sentence. | 12 §2 step 4, after "append **`preanswer {gate, option, via: prompt}`** (#78)": insert "— **only when `channel: hook` (the text is the user's own prompt) or `--headless`**; from `channel: cli` in an interactive route a `--answer` naming an **acting** option is recorded `declined {via: flag, reason: acting-needs-human}` and no preanswer is kept (R3); a non-acting option is kept". 12 §3.3 `--answer` row, "Records" cell: "`acceptance\|declined {via: flag}`; at `route start` from the hook or headless: `preanswer {via: prompt}`; at a model-run interactive `route start`: acting options → `declined {acting-needs-human}`". 13 §1 `preanswer` row: append "written only for a hook-channel or headless start (12 §2.4)". |
| 103 | high | 32 §3 Schema rules vs 24 step 6, 32 §4 `check-only-unauthorized`, 12 §3.5 | **The DSL rule forbids two revises the routes rely on.** 32 §3: "`onAnswer` and `onFail` targets are earlier step ids". 24 step 6: `review-run` (step 6) `onFail: revise fix` — `fix` is step 7, later. 32 §4 / 12 §3.5: `check-only-unauthorized` `onAnswer: {approve: revise $raisedBy}` — `$raisedBy` is the step whose own command raised the gate (task `red`, `review-run`), i.e. the same step, not an earlier one. A zod-validated route file written as 24 describes fails the build it is validated by. Also unsaid: on the first `review` with findings `fix` has never run, so the "evaluation → `revise fix`" is how `fix` is **entered** (its `check`/`review` kinds already exist in its window from steps 4 and 6), and that first revise consumes one of `fix`'s two repeats — say so, or the "two fix rounds" row in 24's table is one. | `32-artifacts.md:99-100`; `skills/24-task.md:30-31, 50`; `32-artifacts.md:120-125`; `modules/12-route.md:160-161, 208-210` | **(a)** v3 32 §3 had the same "earlier step ids" rule, but v3 had no `revise fix` and no `$raisedBy` (that was #77's gap); v4's #77 fix added both without touching the rule. | 32 §3 Schema rules, replace "`onAnswer` and `onFail` targets are earlier step ids" with: "`onAnswer` and `onFail` targets are step ids of the same route: an earlier step, the firing step itself (`$raisedBy`, 12 §3.5), or — for an `onFail` evaluated at a command tail — the step that consumes its result (task `review-run` → `fix`); a target later than the next step is refused at build". 24 step 6, after "`fix` under its `repeat` → `revise fix`": insert "(this is also how `fix` is entered the first time, since its kinds already exist in its window; the first entry counts as `fix`'s first execution, the second `revise fix` as its second; the third is refused with `limit`)". 24 ceremony table last row label: "review run, two fix rounds (`fix` at `repeat`: entered once, revised once)". |
| 104 | high | 12 §2 step 3 (resume) vs 30 §8 | **Adoption ignores the args hash.** 12 §2.3: same session + same `hash(args)` → re-print; **another session → adopt**, no args condition; same session + different args → supersede. So `/ambicode:investigate ORD-17 "question B"` in a new session adopts the open route for "question A" and continues at its `read` step with A's map. 30 §8 says the opposite for the same situation: "Two `/ambicode:investigate ORD-17 …` with different questions → different args hash → a second route on the same slug". The two files disagree on the dedup mechanism, and the 12 reading sends the model to the wrong question. | `modules/12-route.md:65-74`; `30-harness.md:104, 108`; v3 `modules/12-route.md:62-65` (dedup keyed on `hash(args)` for every case) | **(a)** v3's dedup key was `(slug, skill, epoch, hash(args))` for every start; v4's #79 fix added the session bullets and dropped the hash condition from the cross-session one. | 12 §2 step 3, second bullet, replace "from **another** session (a new `claude` session, a restart) → **adopt** it" with "from **another** session **with the same `hash(args)`** (a new `claude` session, a restart) → **adopt** it"; add a fourth bullet: "from another session with **different** args → a new `route` beside the open one (another session's route is never superseded from here; `route status` and `note list` show both, P54)". 30 §8 row "Two `/ambicode:investigate ORD-17 …` with different questions": append "in any session". |
| 105 | high | 32 §3 (`plan-step`, `plan-check`, `promote`) vs 12 §1 `produces`, §4 fold | **Kind-level `produces` marks two plan steps done before they run.** 12 §4: a code step is done when "every kind in produces exists in evidence" (the window since the last covering `revise`). `plan-step` `produces: [policy]`: a `policy` entry (before-work, from `ground`) is already in its window → done → the before-report rules and the navigation line are never delivered. `promote` `produces: [note]` with the comment "done when the promoted note exists": `note {plan-draft}` from `plan-check` is in the same window → `promote` is done before it runs → on *Accept* **no plan is promoted** and the route completes with a draft, the exact outcome D11's promotion exists to avoid. 32 §3's comment contradicts 12 §4's rule. (The same kind-level reading is what lets task's `fix` be "done" before it runs, #103.) | `modules/12-route.md:43, 179`; `32-artifacts.md:68-71, 76-79, 90-94`; `skills/23-plan.md:36` | **(c)** missed by review-v2 and review-v3: v3 32 §3 has the identical `plan-step`/`promote` steps and comment, and v3 12 §4 the identical rule. Not a design choice that was examined; the fold's `produces` was reviewed only for model steps (v1 #6). | 12 §1 `produces` row: "ledger kinds this step must leave behind, each optionally qualified by one field value — `note{plan}`, `note{plan-draft}`, `policy{before-report}`, `check{green}` — and matched with the qualifier by the fold; a `model` step may name them (then it is done when they exist)". 12 §4 pseudo-code: "done := code ? every (kind, qualifier) in produces exists in evidence". 32 §3: `plan-step` → `produces: [policy{before-report}]`; `plan-check` → `produces: [note{plan-draft}, worker]`; `promote` → `produces: [note{plan}]   # done when the promoted note exists`; Schema rules: "`produces` are known kinds, optionally `kind{value}` on a field 13 §1 lists for that kind". 24 step 7 `fix` ledger cell: "`check{green}`, `review`". |
| 106 | medium | 13 Failure modes vs 12 §2.3, 12 Failure modes | Stale row: "Two sessions append → … folds are per session" while 12 §2.3 adopts and 12's own row says "the fold is over the union". | `modules/13-evidence.md:133`; `modules/12-route.md:67-71, 273` | traces to #79 (partially landed: 13 not updated) | 13 row → "lines whole; ids carry the session, so no collision; a fold spans sessions only through a `route {resumes}` chain (12 §2.3), otherwise it is per session". |
| 107 | medium | 40 P33 vs 30 §1 | P33 still says "Hook spawns ≈ 1.6 s per run" after 30 §1 was recomputed to typical ≈ 0.5 s / maximum ≈ 2.5 s. No decision depends on it. | `40-open-problems.md:41`; `30-harness.md:26-29`; v3 `40-open-problems.md:41` identical | traces to #88 (landed in 30 §1; P33 not updated; CHANGELOG does not claim P33) | P33 "Problem" cell → "Hook spawns ≈ 0.5 s typical, ≈ 2.5 s maximum per investigate run (30 §1), + 89 ms per unbound MCP call; two spawn figures disagree (89 vs ~190 ms)." |
| 108 | medium | 31 vs 12 §3.1; CHANGELOG #95 | 31 says "The ⤵ list is exactly 12 §3.1's evidence-writing list (#95)" but the `rules discover\|apply\|revert` and `init` rows carry no ⤵, while 12 §3.1 lists `rules apply` and `init --apply`. CHANGELOG #95 says "31's ⤵ mirrors it". Graded medium (a could-item partially landed) rather than high: the category definition reserves the CHANGELOG-mismatch high for must/should items. | `31-cli.md:26, 39, 45`; `modules/12-route.md:93-95`; `CHANGELOG.md:44` | traces to #95 (partial) | 31 row 26: "`rules discover\|apply ⤵\|revert`"; row 39: "`init` (`--apply` ⤵)". |
| 109 | medium | 22 step 4; 13 §4 report example | "`map` repeat ≤ 2" and "Map pass 2: repeat limit (2)": `map` is a module call inside `ground`, not a step; #86 moved `repeat` to step ids (`ground 2`). | `skills/22-investigate.md:36`; `modules/13-evidence.md:99`; `CHANGELOG.md:35` | traces to #86 (partial: two leftovers) | 22 step 4 gate cell → "`ground` repeat 2 (12 §5)"; 13 §4 line → "Ground: repeat limit (2)". |
| 110 | medium | 13 §1; 41 Compatibility; CHANGELOG #91, §C | "Today's **one** kind is `note` … the only `appendLedger` writer at HEAD" is wrong: `src/review/bundle.ts:391` appends `{kind: 'review', reviewId, status, …}` when a task directory exists. HEAD has two kinds, `note` and `review`. Review-v3 #91 asserted "the only `appendLedger` writer … is `note`" and was wrong too (its grep missed `bundle.ts`); CHANGELOG §C's "#68 … one kind" inherits it. No decision changes. | `src/review/bundle.ts:389-392`; `src/cli/commands/note.ts:78`; `modules/13-evidence.md:51-53`; `41-migration.md:49-50` | **(b)** newly verifiable: `grep -rn "appendLedger(" src` lists `note.ts:78`, `bundle.ts:391` and the definition `task/ledger.ts:17`; review-v3's citation of the same grep omitted `bundle.ts` | 13 §1: "Today's **two** kinds are `note` (`note.ts:78`) and `review` (`src/review/bundle.ts:391`, written when a review runs with a task directory); `prepare.ts:138` is a `policyProvenance` entry, not a ledger line (#91)". 13 "What changes": "Ledger 2 → 21 kinds". 41 Compatibility: "(two ledger kinds, `note` and `review`)". CHANGELOG §C last bullet: "two kinds at HEAD, `note` and `review` (review-v4 #110)". |
| 111 | medium | 32 §3 `ground` comment vs 12 §4 (D14) | "`repeat: 2  # one automatic re-run (e.g. a scope answer)`": a scope answer is a human revise (`onAnswer` on the `scope` gate, `via: gate`), which starts a new cycle and does not count against `repeat` under D14. The example names the one case the bound does not cover. 12 §4 and 22 step 3a are right; this is a wrong comment, not a weakening. | `32-artifacts.md:62`; `modules/12-route.md:198-201`; `skills/22-investigate.md:35` | **(a)** v3's comment was correct under v3's single bound; D14 made it wrong | Comment → "`# one automatic re-run (code/model revise); a human scope answer starts a new cycle (D14)`". |
| 112 | medium | 31 `map` row; 10 Failure modes | 31 lists `--layers a,b,c (route callers only, D15)` as a **CLI** flag. No CLI invocation can be a route step: route steps call `Search.map` in-process (10 Interfaces), and every CLI call is the model or a human at a terminal. 10 Failure modes already says a typed `--layers` is refused. The flag has no legitimate caller. | `31-cli.md:15`; `modules/10-search.md:142, 162` | **(a)** v3's flag was "override, recorded"; v4 restricted it (#83) without removing it from the CLI | 31 `map` row flags: drop `--layers a,b,c`; Purpose cell → "map by the configured layers; prints the list first; a typed `--layers` is refused (`search-layers-not-for-model`, D15) — a route step passes `layers` through `Search.map` in-process". |

Citations verified correct against HEAD (all other `file:line` v4 makes): `git.ts:217-229`,
`dependents.ts:25-33, 35-40`, `prepare-on-skill.ts:20, 61-62`, `guard-core.ts:31, 33`, `hook.ts:33`,
`note.ts:78`, `prepare.ts:138` (a `policyProvenance` entry), `main.ts:120`, `compatibility.md:383-387,
395`, `evals-bench.mjs:9, 169, 189, 201, 704, 971`, `evals-core/README.md:198-204`, `skills/plan/SKILL.md:5`,
`stash@{0}` (four files), `benchmarks/{BE,FE}/.ambicode/config.yaml:28` (`null` / `claude_ai_Atlassian`),
12 packs / 823 lines, skill bodies 4.2–10.6 KB (four model-facing 5.9–10.6), 26 case directories,
`package.json` `test:unit` includes `evals/scripts/src/*.test.mjs` (so `verify` fails at HEAD, M22,
reproduced). Logged numbers quoted in 10 §3 match `results.log`/`queries.log` (875/148/1218/98/914/4037
ms; `git grep -w` 70/151 ms; `relates` 115 ms); the "unlogged re-run" labels are where review-v3 put
them. Wrong: 13 §1's "one kind" (#110). Unverified platform claims remain labelled as such in v4
(P2, P9, P17, P37, P47, P48, Git Bash on Windows); I did not probe them.

## 3. Verification of review-v3 items #75–#100

**fixed** = the text says it; **partially** = some of it; **accepted-changed** = a different fix with
its reason in CHANGELOG. CHANGELOG §B matches the text everywhere except where noted.

| # | Sev | Status | v4 location | Note |
|---|---|---|---|---|
| 75 | must | fixed (D14) | 12 §1 (`maxRevises`), §4 "Bounds, two kinds", §5; 23 step 8 "(N left)"; 32 §3; 33 §8 fixture | — |
| 76 | must | fixed (D17) | 14 "`args.hasRequirement`"; 22 step 1; 24 step 1; 25 step 2; 30 §6; 33 §2 | benchmark configs untouched, as ruled |
| 77 | must | fixed, new problem | 24 steps 6–7; 25 step 5; 12 §3.5, §4; 32 §4; 16 §2 | the new `revise fix` / `$raisedBy` break 32 §3's target rule (#103) |
| 78 | should | fixed | 12 §2 step 4, §3.4, §4; 13 §1 `preanswer`; 33 §8 "**acceptance**"; P42 | the provenance hole is older than this fix (#102) |
| 79 | should | fixed, new problem | 12 §2 step 3, Failure modes; 30 §8; 31; P54 | adoption drops the args hash (#104); 13's row stale (#106) |
| 80 | should | fixed | 32 §4 (11 entries incl. `requirements-not-captured-twice`, `project-ambiguous` default *stop*, `decision:*`); 12 §3.5; 15 §4 "or missing" | I matched every raised gate named in 10, 12, 14, 16, 20, 22–25 against the registry: complete |
| 81 | should | fixed | 14 §2 ("stop here and run `route next`"; gate before the child reads); 22 step 2 and table (+2) | — |
| 82 | should | fixed | 12 §3.1 (definition); 22–25 tables; 02 §5; 00 "1–4 + gates"; 22/24 `check-only-unauthorized` rows | 23 is 3 + N ceremony + 1 work; CHANGELOG §D's "+2 + 1" for *Revise* matches the text |
| 83 | should | fixed (D15) | 10 Purpose, Interfaces, Failure modes; 31 | the dead CLI flag remains (#112) |
| 84 | should | fixed | 16 §2, Failure modes; 12 §3.4; 15 §1 row; 31 `check` | — |
| 85 | should | fixed | 17 §1 ("plain `code` step with no gate"), appendix; 23 step 7; 32 §3 | — |
| 86 | should | partially | 12 §1 (`"*"`, `$answer`; defaults by step id); 22 step 3 `ground (repeat: 2)`, 3a; 32 §3 `ground: repeat: 2` | two leftovers name `map` (#109) |
| 87 | should | fixed (D19) | 33 §1–2; 41 steps 0, 3; 22 Measured acceptance | the gate itself cannot accept the cached baseline as written (#101) |
| 88 | should | fixed | 30 §1 (typical 0.5 s / max 2.5 s, 89 vs ~190 ms, start work 1–3 s); 12 §2 step 5; 33 §7 | P33 not updated (#107) |
| 89 | should | accepted-changed (D18), reason in CHANGELOG | 01 §4, R16; 10 Purpose; 20 step 1; 33 "cannot show"; P57 | — |
| 90 | could | fixed | 14 §1; 30 §1; P53; 33 §7 | — |
| 91 | could | fixed as proposed, but the proposal was wrong | 13 §1; 41 Compatibility | HEAD has `note` and `review` (#110); review-v3's own error |
| 92 | could | fixed | 01 §1 | — |
| 93 | could | fixed | 10 §3 agentmap row "(unlogged re-run, #93)" | — |
| 94 | could | fixed | 12 §3.3; 14 §3, §5; 31 "Removed" | — |
| 95 | could | partially | 12 §3.1 one list; 31 ⤵ on 9 of 11 | `rules apply`, `init --apply` lack ⤵ while 31 and CHANGELOG claim a mirror (#108) |
| 96 | could | fixed | 20 step 3 | — |
| 97 | could | fixed | 12 §3.3 `--default` row | — |
| 98 | could | fixed | 12 §1 `when` row; 32 §3 comment | — |
| 99 | could | fixed | 33 §5 | — |
| 100 | could | fixed | 50 last row "none: dropped"; 20 Open problems (P24 named only as closed) | — |

CHANGELOG §C (v3 changelog mismatches) and §D (not changed, with reasons) are accurate. One
CHANGELOG-vs-text mismatch: #95 (medium, #108). No must/should item is claimed fixed and absent.

## 4. Spot-check of ten must-items from review-v1 and review-v2

| Item | Still holding in v4? | Location |
|---|---|---|
| v1 #3 — no fall-through defaults; defaults only on a recorded headless or `--default` | yes | 12 §3.4 (re-print, `never-asked`/`unanswered` on record), §3.3 `--default` (headless or asked) |
| v1 #5 — Stop hook checks only (a) after `route stop`, (b) report header, (c) note file | yes | 15 §3 |
| v1 #7 — `acceptance {via}`; a `plan` only through acceptance honoured per the rule | yes | 13 §3 (`note promote`; `note save --kind plan` does not exist); 12 §3.4 — with the provenance gap of #102 |
| v1 #8 — MCP hook appends `requirement` only; ground runs once on `route next` | yes | 14 §3 step 3; 22 step 3 "(once)" |
| v1 #13 — allow row for `steps/plan-body.md` during a plan route | yes | 15 §1; 23 "What the model loads" (`Write` grant); 41 Kept |
| v1 #14 — `check` repeat 5 per phase | yes | 12 §1, §5 |
| v2 #42 — the fold can go back, bounded, in the six places | yes | 12 §4; 11 §4; 17 §2; 21 step 5; 22 step 3a; 23 steps 7–8; 24 steps 6–7; 25 step 5 — with #103/#105 on the DSL text |
| v2 #44 — `--default` one meaning; headless acts only via `--answer` | yes | 12 §3.3; 30 §6; 24 step 5; 25 step 4 |
| v2 #47 — capture reduces disk, not context | yes | 30 §3; 14 §2–3; 17 appendix |
| v2 #48 — the harness never writes source or outside `.ambicode/` except `format` (model-run) and `.gitignore` on acceptance | yes | 16 §3; 30 §9; 20 step 4; 10 §4 |

Also checked, holding: v2 #46 (per-arm prompts, 33 §0.2 — but see #101 for the gate) and v2 #49
(args envelope, 14 §3, 32 §6).

## 5. User decisions D7–D19

| # | Status | Where, and what I checked |
|---|---|---|
| D7 | faithful | 01 §1, 22 Purpose and Measured acceptance, 33 §2 say the same bar: tie within the band at ≤ 1.15x; the win is cost and the note; turns reported |
| D8 | faithful | No LSP or language service in any route or module: 10 Purpose, 16 §6, 22–25 Trigger/No-LSP sections, 50 (entry conditions). `impact.md` deleted (41). Nothing beyond LSP was removed under its name |
| D9 | faithful | `search.layers` written by `init` (20 step 1, §Config), printed and recorded (`map` ledger with per-layer ms/hits, 13 §1, 32 §2), shown in `route status` and the report (12 Outputs, 13 §4), refused when unknown (10 Failure modes) |
| D10 | faithful | 33 §1 and 41 step 3: cost ratio and recall decide; turns reported; "the user decides"; `eval-gate` still fails CI (P52); no script rolls back (33 §9, 30 §9) |
| D11 | faithful | 23 step 7 saves `plan-draft` at the tail of `plan check`, before the gate; 13 §3; 33 §8 fixture (`acceptance`, not `preanswer`). The promotion step that D11 leads to is the one #105 shows skipped by the fold — a defect in the engine text, not a weakening of the decision |
| D12 | faithful | 50 (`ExitPlanMode` with an entry condition); 30 §1 "Not in the matrix" |
| D14 | faithful, not over-extended | 12 §1 (`maxRevises` default 3), §4 (human cycle resets `repeat`; "(0 left)" → `declined {max-revises}`), §5; 23 step 8 "(N left)"; 32 §3; 33 §8 (two check failures then *Revise* re-opens design; a model `--revise` cannot consume the allowance); 30 §8 two rows. The one wrong example comment is #111 |
| D15 | faithful | 10 Purpose, Interfaces (`layers?` "route callers only"), Failure modes (`search-layers-not-for-model`); 31. The leftover CLI flag (#112) is a labelling issue, not a model path |
| D16 | faithful | R13 generalised; 33 header, §1–6 and §9 each end in "the user decides"; 41 every decision point presents |
| D17 | faithful | 14 "`args.hasRequirement`" (headless: `--requirement` only); 22 step 1, 24 step 1, 25 step 2; 30 §6; 33 §2. Benchmark configs untouched (33 §0 lists no scaffold change) |
| D18 | faithful, not over-extended | R16; 10 Purpose and Interfaces (adapters); 20 step 1 (adapters detected at init: "TypeScript and Python today, any ecosystem the adapter table names"); 01 §4 (Python "not a non-goal"); 33 "cannot show"; P57. Measurement stays on TypeScript, stated. 10 §1/§2 describe adapter content (a TypeScript `export` filter, FE i18n keys) inside the module doc — adapter details, not a route or step text; see Not raised |
| D19 | faithful | 33 §0.2, §1, §2; 41 step 0 "no new baseline"; 01 D13 superseded; P56 states the single-baseline band. The harness defect that makes the gate refuse (#101) is a code fact, not a departure from the decision: it is fixed by a harness change in step 0, not by a run |

No decision weakened; none over-extended.

## 6. Not raised

- 12 cross-references "§2.3"/"§2.4" point at numbered steps inside §2, not sub-sections; readable, cosmetic.
- Version labels "v3" remain in 17 Purpose, 20 "Config written by init (v3)", 31 title, 50 line 3, P13, P51 — cosmetic; no mechanism depends on them.
- 10 §1 harvest row ("`export` filter in TypeScript") and 10 §2 (`assets/i18n/*.json`) name an ecosystem inside a module doc; R16 forbids it in routes, modules and step texts. These describe what the adapter does, and D18 is the governing decision; not a weakening. The author may want to prefix "(adapter: TypeScript)" for consistency.
- `hooks/hooks.json` at HEAD matches `mcp__.*([Aa]tlassian|[Jj]ira|[Cc]onfluence|[Rr]ovo).*` while 30 §1 writes `mcp__.*`: a designed change (#52), consistent with P53; not a citation error.
- `disable-model-invocation: true` is on init and rules only at HEAD; 01 D2 "Every skill is …" is a design consequence, not a claim about HEAD.
- 25 step 5: two waiting keys approved one after the other produce two human revises of `review-run`; each is a new cycle under D14, so the second re-run is legal; the gate text should name a single re-run command carrying both `--approve` keys. Design detail, no contradiction.
- 12 §3.2 step 2 "Third → advance with `limit`" lets a model skip a `produces`-bearing step after three refusals; accepted in round 1 (R12, "never wedges") and unchanged.
- 02 §5's "Ceremony turns: 3" and 22's tables agree; 23's and 24's tables agree with 12 §3.1 — no count finding.

## 7. What I did not check

- No eval, no probe, no `npm run verify`, no `compare.mjs`; P2, P9, P17, P37, P47, P48 and the Windows assumption stay unverified platform facts, labelled as such in v4.
- I ran one read-only unit test to reproduce M22 and one `node -e` that printed the key names of a results JSON (no case content); I did not read or copy any prompt or benchmark data (NDA).
- I did not diff v3 → v4 file by file; where a finding says "introduced by v4" I quoted the v3 lines I compared (`grep`/`sed`), and the v3/v4 file sets are identical.
- I did not read `src/review/*`, `src/checks/*`, `src/page/*` beyond `bundle.ts:385-396`; 41's "touched seams" are taken from the design.
- I did not re-measure hook spawn times, the 30,000-char Bash window, or the 20-fixture count for init; I did not count tokens (all context figures are bytes, as in the design).
- I did not walk the rules and init routes step by step; their gates were checked only through the registry/declared-gate match for #80.

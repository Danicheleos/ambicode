# Review of `new-architecture/v5` (2026-10-04)

Fifth round, second under the approval criteria. I read CLAUDE.md, review-v4 (the twelve findings
with their fix texts), all 25 v5 files, `diff -r v4 v5`, the measurement README, and re-checked the
code citations the v5 diff touches against HEAD `adcf783`. Tools: `diff`, `grep`, `sed`, `wc`,
`ls`, `git` read commands. No eval, no probe, no `verify`, nothing spent. Numbering continues from
review-v4 (last item 112).

## 1. Verdict

**APPROVE.** Deciding criterion: 0 critical, 0 high, 3 medium (≤ 8); #101–#112 all landed (three
with a deviation the CHANGELOG states); the review-v3 items the diff touches still hold; D7–D19
applied faithfully, none weakened or over-extended; the ten v1/v2 must-items hold.
Counts: **0 critical, 0 high, 3 medium.**

Each medium below carries exact replacement text so it can be applied without another round.

## 2. Findings

| # | Cat | File §section | What is wrong | Evidence | Why new / prior item | Exact fix |
|---|---|---|---|---|---|---|
| 113 | medium | 00-README "What version 4 changed" | The paragraph ends "today's ledger has one kind, not two" — the claim #110 corrected. v5's own 13 §1 says two kinds (`note`, `review`). A README sentence; no decision depends on it. | `v5/00-README.md:39`; `v5/modules/13-evidence.md:51-53`; `src/review/bundle.ts:391` (`kind: 'review'`), `src/cli/commands/note.ts:78` (`kind: 'note'`) | traces to #110 (partial: the fix text listed 13, 41 and CHANGELOG, not the README; the author edited the README header for v5 and left this line) | 00-README line 39, replace "today's ledger has one kind, not two." with "today's ledger was counted as one kind (`note`) — corrected in v5 to two, `note` and `review` (#110)." |
| 114 | medium | 12 Failure modes (two rows) vs 12 §2 step 3 | After #104 adoption requires the same `hash(args)`, but two summary rows still say adoption is unconditional: "A new session on an open route → adopted (§2.3)" and "Two sessions, one slug, both live → each `route start` adopts". With different args §2.3 now says "a new `route` beside the open one". Same file, rows defer to §2.3 — wording, not a mechanism conflict. | `v5/modules/12-route.md:279-280` vs `:66-78`; v4 `12-route.md` had the same rows and an unconditional §2.3, so they agreed in v4 | **(a)** introduced by the #104 edit: §2.3 gained the condition, the rows did not | Row "A new session on an open route" → "adopted when `hash(args)` matches (§2.3), else a new route beside it; `--fresh` to restart". Row "Two sessions, one slug, both live" → "same args: each `route start` adopts and the fold is over the union; different args: two routes side by side (P54); ids carry the session (13 §1); `O_APPEND` keeps lines whole". |
| 115 | medium | 12 §4 fold (human line) vs 12 §3.4, 12 §2 step 4, 16 §2 | `declined {via: flag, reason: acting-needs-human}` is written when the model types an acting option interactively, and §3.4 / 16 §2 say the gate is then **re-printed** — i.e. it is not an answer. The fold's human line counts any `declined` for the gate as done. Read literally, a model-run interactive `route start plan … --answer plan-accept=Accept` (now recorded `declined` by #102) makes `plan-accept` done before it is asked; the human is never asked, `promote`'s `when` is false, the route completes with a draft. Nothing acts and nothing is spent (so not critical), but the human loses the gate. | `v5/modules/12-route.md:188` ("acceptance\|declined\|default-taken for its gate exists") vs `:79-83`, `:153-155`; `v5/modules/16-checks-review.md:36-38` | **(c)** missed by review-v3 and review-v4: v4 §3.4 already wrote the same `declined {acting-needs-human}` + re-print for `route next`; #102 added a second writer at `route start` without touching the fold line | 12 §4 human line → "human ? acceptance\|declined\|default-taken for its gate exists in evidence — a `declined {reason: acting-needs-human}` does **not** count (the gate is re-printed, §3.4; the entry is the record that a model tried to act)". 12 §3.4 acting bullet, after "and re-prints the gate": add "(that `declined` is not a gate answer in the fold, §4)". |

Citations the v5 diff introduces or moves, verified at HEAD: `evals-bench.mjs:674`
(`if (cached.promptMarkdown !== evalCase.promptMarkdown) refuse(...)` inside `withBaseline`),
`src/review/bundle.ts:391` (`appendLedger(... { kind: 'review', ...})` when `taskDirectory !== null`),
`src/cli/commands/note.ts:78` (`kind: 'note'`), `grep -rn "appendLedger(" src` → exactly `note.ts:78`,
`bundle.ts:391`, and the definition `src/task/ledger.ts:17`; `evals-core/README.md:198-204` (gate
refuses a baseline differing in model, Claude Code version or prompt). All correct. All other
citations are unchanged from v4 and were verified in review-v4 §2.

## 3. Verification of review-v4 items #101–#112

**as written** = the fix text landed verbatim (modulo item tags like "(#101)"); **stated deviation**
= extra or altered text, with the reason in CHANGELOG. Surroundings = the places the edit could have
broken.

| # | Status | v5 location | Surroundings checked |
|---|---|---|---|
| 101 | as written + stated deviation | 33 §0.2 (`33-measurement.md:20-28`); 41 step 0 "Measured by" appended as asked (`41-migration.md:8`) | Deviation: 41 step 0's **Step** cell was also rewritten (v4 said "the `evals:gate` prompt check **unchanged**", which would have contradicted the new §0.2); CHANGELOG row 101 says "41 step 0 (both cells)". Surroundings consistent: 30 §6 (`:85-90`), 22 Measured acceptance (`:66-70`), 01 D13/D19 (`:78, 84`), M22 (`:59`) all still say the naked `prompt.md` is unchanged and the cached baseline is the reference. Implementability: the results JSON is written by `claude plugin eval` (`--json`, `evals-bench.mjs:977-1032`) and read back by the runner, which already post-processes it (`withBaseline` at `:1033`, harvest), so "the runner records `promptMarkdown`" is a post-run rewrite or a gate-time mapping inside `evals-bench.mjs` — a harness change, as 33 §0.2 says; where it lands is unstated (see Not raised) |
| 102 | as written + stated deviation | 12 §2 step 4 (`12-route.md:79-83`); 12 §3.3 `--answer` row (`:131`); 13 §1 `preanswer` row (`13-evidence.md:34`) | Deviation: §3.4's acting bullet gained "(a preanswer exists only from a hook-channel or headless `route start`, §2.4, #102)" (`:152-153`); CHANGELOG row 102 names it. `Engine.start` still carries `channel: 'hook'\|'cli'` (`:256`), now used. 30 §6 (`:76-79`, headless), 23 Open problems P42 (`:80-82`, headless), 12 P2 fallback (`:292-294`), 16 §2 (`:35-38`) consistent. R3 (`01:99`) now holds for `route start`. One loose end is #115 (the fold counts the new `declined`) |
| 103 | as written | 32 §3 Schema rules (`32-artifacts.md:99-102`); 24 step 6 insert (`24-task.md:30`); 24 ceremony table last row (`:50`) | Every revise target in 22–25 and 32 §4 satisfies the new rule: `revise design`, `revise plan-write`, `revise draft`, `revise ground` (earlier); `revise $raisedBy` (the firing step); `revise fix` from `review-run` (the next step, consumed at the `review` tail). The inserted "entered the first time" text agrees with #105's qualifiers: `check{green}` (step 4) and `review` (step 6) exist in `fix`'s window before `fix` runs, so `fix` is reached only through `revise fix`; `repeat: 2` = entered once + revised once, third refused — matches 12 §4 examples (`:215-216`) and 12 §5 |
| 104 | as written | 12 §2 step 3 bullets 2 and 4 (`12-route.md:67-78`); 30 §8 row (`30-harness.md:104`) | 30 §8 and 12 §2.3 now agree ("in any session" → a second route). 30 §8 "session dies … adopts" (`:108`) retypes the same command, consistent. 31 `route start` row (`31-cli.md:11`) and P54 (`40:62`) consistent. Two 12 Failure-modes rows were not updated → #114 |
| 105 | as written | 12 §1 `produces` row (`12-route.md:43`); 12 §4 both `done` lines (`:186-187`); 32 §3 `plan-step`, `plan-check`, `promote` (`32-artifacts.md:71, 79, 94`); Schema rule (`:103`); 24 step 7 ledger cell (`24-task.md:31`) | Each qualifier names a value of a field 13 §1 lists for that kind: `note{plan}`/`note{plan-draft}` → `note.kind` (`13:47`), `policy{before-report}` → `policy.stage` (`:41`), `check{green}` → `check.phase` (`:43`). 23 step 7/9 ledger cells (`note {plan-draft}`, `note {plan, promotedFrom}`) and 22 step 6 (`note`, no earlier note in the investigate route's own entries, 12 §4 `:180-181`) consistent. `promote` on *Accept* now runs (D11 outcome restored) |
| 106 | as written | 13 Failure modes (`13-evidence.md:133`) | matches 12 §2.3 and 12 Failure modes "the fold is over the union" |
| 107 | as written | 40 P33 (`40-open-problems.md:41`) | matches 30 §1 (`:26-31`); no other "1.6 s" in v5 (`grep`: only M21's 11.6 s and 10 §3) |
| 108 | as written | 31 rows `rules` (`31-cli.md:26`) and `init` (`:39`) | ⤵ now on 11 commands = 12 §3.1's list of 11 (`12-route.md:100-102`); 31's "exactly 12 §3.1's list" (`:45`) is now true |
| 109 | as written | 22 step 4 (`22-investigate.md:36`); 13 §4 (`13-evidence.md:99`) | no remaining "`map` repeat" (`grep`) |
| 110 | as written + stated deviation | 13 §1 (`13-evidence.md:51-53`); 13 "What changes" (`:142`); 41 Compatibility (`41-migration.md:50`); CHANGELOG §C #68 (`CHANGELOG.md:85`) | Deviation: CHANGELOG §B #91 row also corrected (`:69`), with the reason "this file's own claims" (row 110). 02 §4 "21 kinds" unaffected. The README sentence was missed → #113 |
| 111 | as written | 32 §3 `ground` comment (`32-artifacts.md:62`) | agrees with 12 §4 bounds (`:199-210`) and 22 step 3a |
| 112 | as written | 31 `map` row (`31-cli.md:15`) | agrees with 10 Purpose (`10-search.md:10`), Interfaces (`:142`, `layers?` route callers only), Failure modes (`:162`); no other CLI `--layers` in v5 (`grep`: 00/01/10/31 mention it only as refused or route-only) |

Review-v3 items the v5 diff touches, re-checked and still landed: #77 (24 steps 6–7, 12 §3.5, 32
§4), #78 (12 §2.4, §3.4; 13 §1), #79 (12 §2.3, Failure modes; 30 §8; 31; P54 — wording in #114),
#83 (31), #86 (22 steps 3–4; 32 `ground`), #87 (33 §1–2; 41 step 0; 22), #88 (30 §1; P33), #91
(13 §1; 41 — now correct), #95 (31 ⤵ 11/11). The others are untouched by the diff and were verified
in review-v4 §3.

## 4. Diff audit (`diff -r v4 v5`)

File sets are identical (25 `.md` each). Every hunk:

| File | Hunk | Traces to |
|---|---|---|
| `00-README.md` | header paragraph (version 5, review list, "applies the twelve edits and nothing else"); CHANGELOG row in the file table | v5 bookkeeping |
| `CHANGELOG.md` | new v4 → v5 section (12 rows + "Not changed" paragraph + rule); §B #91 row; §C #68 bullet | v5 bookkeeping; #110 (both stated in row 110) |
| `30-harness.md` | §8 row "different questions, in any session" | #104 |
| `31-cli.md` | `map` row | #112 |
| `31-cli.md` | `rules … apply ⤵`; `init (--apply ⤵)` | #108 |
| `32-artifacts.md` | `ground` comment | #111 |
| `32-artifacts.md` | `plan-step`, `plan-check`, `promote` `produces` | #105 |
| `32-artifacts.md` | Schema rules (targets; `kind{value}`) | #103, #105 |
| `33-measurement.md` | §0.2 | #101 |
| `40-open-problems.md` | P33 | #107 |
| `41-migration.md` | step 0 Step cell and Measured-by cell | #101 (Step cell = stated deviation) |
| `41-migration.md` | Compatibility "two ledger kinds" | #110 |
| `modules/12-route.md` | §1 `produces` row | #105 |
| `modules/12-route.md` | §2 step 3 bullets 2, 4 | #104 |
| `modules/12-route.md` | §2 step 4 | #102 |
| `modules/12-route.md` | §3.3 `--answer` row | #102 |
| `modules/12-route.md` | §3.4 acting bullet parenthetical | #102 (stated deviation) |
| `modules/12-route.md` | §4 `done` lines | #105 |
| `modules/13-evidence.md` | §1 `preanswer` row | #102 |
| `modules/13-evidence.md` | §1 "two kinds" paragraph | #110 |
| `modules/13-evidence.md` | §4 "Ground: repeat limit (2)" | #109 |
| `modules/13-evidence.md` | Failure modes "Two sessions append" | #106 |
| `modules/13-evidence.md` | "Ledger 2 → 21 kinds" | #110 |
| `skills/22-investigate.md` | step 4 gate cell | #109 |
| `skills/24-task.md` | step 6 insert; step 7 ledger cell; table last row | #103; #105; #103 |
| `.DS_Store` | binary differs | Finder artefact, gitignored (`.gitignore:28`), not design text |

No hunk traces to nothing. The CHANGELOG's "Not changed from review-v4 §6" paragraph matches: none
of those items appears in the diff.

## 5. Spot-check of ten must-items from review-v1 and review-v2

| Item | Holding in v5? | Location |
|---|---|---|
| v1 #3 — no fall-through defaults; defaults only on a recorded headless or `--default` | yes | 12 §3.4 (`:145-150`), §3.3 `--default` (`:132`) |
| v1 #5 — Stop hook checks only (a) after `route stop`, (b) report header, (c) note file | yes | 15 §3 (`:60-67`) — file unchanged |
| v1 #7 — `acceptance {via}`; a `plan` only through an honoured acceptance | yes, and the #102 hole is closed | 13 §3 (`:67-73`); 12 §3.4 (`:151-155`); 12 §2.4 (`:79-83`) |
| v1 #8 — MCP hook appends `requirement` only; ground once on `route next` | yes | 14 §3 step 3 (`:82-83`); 22 step 3 "(once)" |
| v1 #13 — allow row for `steps/plan-body.md` during a plan route | yes | 15 §1 (`:33`); 23 "What the model loads" (`:21-22`); 41 Kept (`:44`) |
| v1 #14 — `check` repeat 5 per phase | yes | 12 §1 (`:48`), §5 (`:226`) |
| v2 #42 — the fold can go back, bounded, in the six places | yes; the DSL rule now admits every declared target (#103) | 12 §4; 11 §4; 17 §2; 21 step 5; 22 step 3a; 23 steps 7–8; 24 steps 6–7; 25 step 5 |
| v2 #44 — `--default` one meaning; headless acts only via `--answer` | yes | 12 §3.3; 30 §6 (`:76-81`); 24 step 5; 25 step 4 |
| v2 #47 — capture reduces disk, not context | yes | 30 §3 (`:45-48`); 14 §2–3; 17 appendix |
| v2 #48 — the harness never writes source or outside `.ambicode/` except model-run `format` and `.gitignore` on acceptance | yes | 16 §3; 30 §9 (`:118-122`); 20 step 4; 10 §4 |

Also holding: v2 #46 per-arm prompts (33 §0.2, now with a gate that can accept the cached baseline)
and v2 #49 args envelope (14 §3, 32 §6).

## 6. User decisions D7–D19

| # | Status | Where, and what I checked |
|---|---|---|
| D7 | faithful | 01 §1 (`:11-12`), 22 Purpose and Measured acceptance, 33 §1–2: tie within the band at ≤ 1.15x; win = cost + the note; turns reported. Untouched by v5 |
| D8 | faithful | No LSP or language service in any route or module (10, 16 §6, 22–25, 50). Untouched |
| D9 | faithful | `search.layers` in config written by `init`, printed, recorded with per-layer ms/hits, shown in `route status` and the report (10 §1, 13 §1, 32 §2/§5, 12 Outputs). Untouched |
| D10 | faithful | 33 §1, 41 step 3: cost ratio and recall decide, turns reported, the user decides; `eval-gate` fails CI (P52); nothing rolls back (33 §9, 30 §9). Untouched |
| D11 | faithful, and the defect that undercut it is closed | 23 step 7 saves `plan-draft` at the `plan check` tail before the gate; 13 §3; 33 §8. With #105, `promote` (`produces: [note{plan}]`) now runs on *Accept* instead of folding as done |
| D12 | faithful | 50 (`ExitPlanMode` entry condition); 30 §1 "Not in the matrix". Untouched |
| D14 | faithful, not over-extended | 12 §1 `maxRevises`, §4 bounds, §5; 23 step 8 "(N left)"; 32 §3 (`ground` comment now names a code/model revise, #111); 33 §8 fixtures; 30 §8 two rows |
| D15 | faithful | 10 Purpose/Interfaces/Failure modes; 31 `map` row now has no `--layers` flag and names the refusal (#112). The override exists only in-process from a route step |
| D16 | faithful | R13; 33 header, §1–6, §9; 41 every decision point presents. Untouched |
| D17 | faithful | 14 "`args.hasRequirement`" (headless: `--requirement` only); 22 step 1, 24 step 1, 25 step 2; 30 §6; 33 §2. Benchmark configs untouched (33 §0 lists no scaffold change). Untouched by v5 |
| D18 | faithful, not over-extended | R16; 10 Purpose/Interfaces; 20 step 1 adapters; 01 §4; 33 "cannot show"; P57. Untouched |
| D19 | faithful | 33 §0.2 now says the cached 2026-10-02 baseline is accepted through a **harness change** (recording `promptMarkdown` from the unchanged `prompt.md`), "holds without a run"; 41 step 0 "no new baseline"; 01 D13 ("the harness change stays in step 0") and D19; P56 single-baseline band. No run is added; the naked prompt does not change. Not over-extended: the change touches only how the runner records the prompt, not the baseline or the cases |

No decision weakened; none over-extended.

## 7. Not raised

- 33 §0.2 "the runner records the naked `prompt.md` as `promptMarkdown`": the raw field is written by `claude plugin eval` into the `--json` file the runner reads afterwards (`evals-bench.mjs:977-1032`), so the recording is a post-run rewrite or a mapping at `evals:gate` time; implementable in either place, location unstated — review-v4's own fix text applied as written.
- 31 `route start` row says "`--answer` records `preanswer`s (#78)" without the #102 qualifier; it is a one-line summary and 12 §2.4 holds the rule; no contradiction.
- 17 §1 "`workers.approved: [id]` is a preanswer for *run*" names a config-sourced preanswer that 13 §1's row (`route start --answer` only) does not list; no model worker ships and the DSL has no worker gate yet (17 §1, 12 §3.2.4); stood since v3.
- 24 ceremony table work-command column ("one fix round: + `check` ×1, `review` ×1" while a fix round adds a second `review`): pre-existing from v3/v4, work not ceremony, no decision depends on it; review-v4 §6 already recorded "no count finding".
- Code steps with no `produces` (`template` in 32 §3; investigate's report step) are vacuously done under 12 §4's "every … in produces"; 12 §2.5 and §3.2.3 run reachable code steps regardless. Pre-existing since v3; #105 did not change it.
- `.DS_Store` differs between v4 and v5: Finder artefacts, gitignored.
- The review-v4 §6 items (the "§2.3/§2.4" cross-references, leftover "v3" labels in 17/20/31/50/P13/P51, ecosystem names in 10 §1–§2 under D18, the 25 step 5 double approval, 12 §3.2 "third → advance with `limit`") are unchanged in v5 and stay not raised, as the CHANGELOG records.
- 30 §8 "The session dies … `/ambicode:plan` again in a new session adopts the open route": the same command retyped has the same `hash(args)`, so it agrees with #104.

## 8. What I did not check

- No eval, no probe, no `npm run verify`, no `compare.mjs`; P2, P9, P17, P37, P47, P48 and the Windows assumption stay unverified platform facts, labelled as such in v5.
- I did not read or copy any prompt, case or benchmark content (NDA); the only harness lines I read are `evals-bench.mjs:160-210, 665-680, 780-815, 960-1010` and `evals-core/README.md:196-206`.
- I did not re-verify the citations the v5 diff does not touch (`git.ts`, `dependents.ts`, `prepare-on-skill.ts`, `guard-core.ts`, `hook.ts`, `main.ts`, `compatibility.md`, `skills/plan/SKILL.md`, `stash@{0}`, benchmark configs, pack and body sizes); review-v4 §2 verified them against the same HEAD.
- I did not walk the init and rules routes step by step beyond confirming their files are unchanged.
- I did not re-measure anything in `measurements-2026-10-03/`; the README's provenance note is unchanged and 10 §3's labels match it.

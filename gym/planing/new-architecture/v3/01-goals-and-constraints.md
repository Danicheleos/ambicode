# Goals, measured facts, decisions, non-goals

## 1. The goal, as a number, one bar per skill

The plugin earns its place when the same user, on the same model, gets a measurably better result
than without it, at a cost they would pay. Each skill has **one** bar, stated here and repeated
verbatim in its skill file and in [33-measurement.md](33-measurement.md). A bar that is missed is a
**decision point**: the numbers are presented and the user decides (D10, R13).

```
investigate   recall(with) within the noise band of recall(without)   cost <= 1.15x   turns reported against the route's ceremony budget
              (confirmed by the user, D7: the win is cost against v0.4.0 and a cited note the plan route reads; not a recall win)
plan          composite above the naked arm on >= 3 epics x 3 runs: better than naked beyond naked's run-to-run spread on >= 2 of
              {existing-file recall, anchor validity by `plan check`, AC coverage} and not worse beyond the spread on the third;
              a tie on AC coverage is the expected outcome of expansion (the naked model already expands)
task          pass(with) - pass(without) >= the suite's detectable effect (~20 pp at 10 cases x 3 runs)   cost <= 1.2x
              inside the detectable band = inconclusive, presented with the cost of a larger suite
review        claim: safe publication, checked coverage, validated findings; measured by `complete` share >= 90% (no waiting check),
              location validity 100%, accepted rate tracked. Finder claim: live-reviewer thread recall vs naked at <= 1.5x cost.
all           0 text-only "never" rules; 100% of cited path:line exist; every gate (declared or raised) has a tested release and a
              non-acting default; every loop is a bounded `revise`
```

Today against those bars (Sonnet 5.5, `archive/baseline-2026-10-02.md`):

```
investigate   recall 0.720 vs 0.697 (band 0.101): tie     cost 1.42x: FAIL     turns +4.7: reported
review        invalid for the plugin arm (replay-miss in 10/24 and 16/24 runs)
task          no suite; 1 Edit/Write in 7,709 tool calls across 712 traces
plan          one epic, one run per arm (real-run): full chain 21/30 files, 44 anchors; naked 16/30, 18 anchors, more ACs
```

## 2. Measured facts the design rests on

| # | Fact | Number | Source |
|---|---|---|---|
| M1 | The with-arm pays for steps that do no navigation: `Skill` call, `ToolSearch select:LSP` (nothing in the sandbox), `note save`, reading `requirements-mcp.md`, `config`. | 3 of 4 extra calls in the be-vs-5546 pair; +4.7 turns, 1.42x | baseline §Example 1 |
| M2 | A weaker model skips prose steps. | `prepare` ran 26/29 on Opus, 3/50 on Sonnet, same body | skill-gap-plan §1 |
| M3 | A hook makes the step happen regardless of the model. | hook-delivered `prepare` in 7/7 runs that saved a note (slug evidence) | baseline §Localize correction |
| M4 | Prose "never" rules fail even on Opus; a stated reason held. | "never truncate" violated 28/31; B2 wording cut 0/4 | skill-gap-plan iteration 2 |
| M5 | Term shortlist from prose is useless; from code identifiers it is exact. | 1 irrelevant candidate vs 15/15 in the MR | real-run B2 |
| M6 | Offline shortlist recall is weak on the FE repo. | recall@15 BE 0.499, FE 0.123; non-source files 38% of slots | known-gaps G10 |
| M7 | Agents read through Bash, batched, not `Read`. | Bash reads 164 vs Read 85 (Opus); 177 vs 24 (Sonnet) | skill-gap-plan §1 |
| M8 | The model does not load LSP unless told; told, it makes ≤ 1 call and greps. | L arm 0/4 LSP calls; A arm 1,0,1,0; `findReferences` 0 of 8 plugin-arm localize runs | direction §Step 2 walk |
| M9 | A cold language server under-reports references with no warning. | 2/11 refs at once, 11 after 5 s (532 files); 1/22, 22 after 11 s (2,338) | known-gaps G25 |
| M10 | Word-boundary grep solves symbol-user questions with unique names. | N and L recall 1.00 precision 1.00 in 4/4; A 0.75 | known-gaps G27 |
| M11 | The requirement procedure cost requirements. | naked read 3 child tickets via JQL; both plugin arms read only the epic (session A with 5 fields, the neutral arm with `*all`) | real-run B1, §4 |
| M12 | The plugin's own guard denied a legitimate save. | `cd X && node ambicode.mjs note save <<EOF` denied; +20k output tokens | real-run B3; `guard-core.ts:31,33` |
| M13 | The plan gate has no headless release. | 95 KB plan left as "draft", unsaved | real-run B4 |
| M14 | Output windows. | Bash tool shows 30,000 chars; hook inline ≤ 9,800 chars, ≥ 10,400 to a file behind a preview | probes-2026-09-30; `prepare-on-skill.ts:20` |
| M15 | Hook spawn cost. | guard 34 ms median; `$A hook` 89 ms; `node -e 0` 29 ms | skill-gap-plan iteration 5 slice 1 |
| M16 | Payload sizes. | compact `prepare`: investigate 4.1 KB, plan 13.3–14.0, task 16.2–16.5; rules alone 5.8 | skill-gap-plan G6 |
| M17 | Modules per activity. | task loads 5; SkillsBench 1–3 modules +19 pp vs 4+ +10 pp | best-practices B1 |
| M18 | Reviewer isolation and validation hold. | `--tools Read,Grep,Glob`, safe mode, snapshot; one bad location voids the result | best-practices C6, D4 |
| M19 | The investigation note is cheap and precise. | $0.36, 1.0 min, 9 LSP calls; the plan built on it had every anchor in range (plan scorer) | real-run §5 |
| M20 | Big-ticket plans peak context. | 214k of 500k, the 78 KB plan emitted twice after a guard false positive | real-run §5 session B |
| M21 | Index tools (measured 2026-10-03). **Logged**: cold index FE (2,338 ts) codeindex 5.7 s, agentmap 6.1 s, scip-typescript 11.6 s; warm 0.2–0.5 s; agentmap `relates` 115/199 ms; `git grep -w -l` 70/151 ms with spawn. **Unlogged re-run** (stdout not saved, #50): codeindex `refs` 236/483 ms; language service first references 0.7 s (BE) / 2.4 s (FE), RSS 368/777 MB; grep, codeindex and the language service agree 1.00/1.00 on two unique names. | — | [measurements-2026-10-03](../measurements-2026-10-03/README.md) incl. its provenance note; 33 §0.5 re-runs `compare.mjs` |
| M22 | The eval harness at HEAD. | `evals-bench.mjs:9` imports `reuse-score.mjs` and `:704` calls `scoreReuse`; `reuse-cases.mjs`, `reuse-score.mjs` and both tests are not committed (all four in `git stash@{0}`); `npm run test:unit` includes that test file, so `verify` fails at HEAD; every case prompt is a plain question served to **both** arms (`arm: both`, `:169,189,201`) | verified 2026-10-03/04; `evals/evals-core/cases/*/prompt.md` |
| M23 | The slim investigate body (walk, n = 4, a mechanics read). | B2 vs A: prepare ran 4/4 vs 0/4, cut 0/4, P 0.35 vs 0.22, R 0.31 vs 0.23, cost 1.18 vs 1.26, **turns 20.3 vs 18.0** | skill-gap-plan iteration 2 |

## 3. Decisions taken by the user (inputs)

| # | Decision | Consequence |
|---|---|---|
| D1 | (2026-10-03) LSP only in `task`, after base context exists; not in investigate or review. | **Superseded by D8.** |
| D2 | **The user launches everything.** No model-invoked skills, no automatic tool selection by the model. | Every skill is `disable-model-invocation: true`; the route starts from the typed `/ambicode:<skill>` through `UserPromptSubmit`. Trade stated: a natural-language "review my change" goes to Claude Code's built-in `code-review`, not to AMBICODE. The eval prompts must type the command in the plugin arm (M22). The ticket hook does nothing when no route is active. How code chooses search layers is D9. |
| D3 | **Helpers and subagents only with the user's approval.** | Workers are gated; the default is *inline*; nothing spends without a human. |
| D4 | **SCIP/LSIF/repo map: consider adoption; do not write from scratch.** | 10 §3: three tools measured; one adapter (codeindex) behind an interface, off by default until 33 §3. |
| D5 | **Modular, layered; consider a framework; build our own harness while the plugin works.** | 02 §2–3. Internal framework: routes as data, modules behind interfaces; the harness is the route engine. |
| D6 | **The real-run's git and write denials were imposed by the user for the test.** | The `git status` denial is not a plugin defect. B3 and B4 remain defects and are fixed. |
| D7 | (2026-10-04) **Investigate's bar is a tie at lower cost** (option 1a). "It is already fairly precise; with the modules in place we can tune it alone later." | 01 §1 as written; 22 says the win is cost and the note; the module seams make investigate tunable in isolation. |
| D8 | **LSP goes to the backlog entirely** — the LSP tool, passive diagnostics, and a language-service child (`refs --exact`). "Try it when the skills show good results without it." | No LSP or language service in any skill; `refs` is `git grep -w` with collision flags; review dependents are the name search or the index; [50-backlog.md](50-backlog.md) holds the items with entry conditions; probes P36/P24 dropped; P11/P13/P30 closed. |
| D9 | **Code may choose search layers deterministically (option 3a), provided the choice is explicitly represented, analyzable and editable.** | `search.layers` per mode in config, written explicitly by `init`; `map` refuses unknown layer names, prints the list first, records `layers` with per-layer ms and hits; `route status` and the report show them. P34 closed. |
| D10 | **The point of no return is judged on cost ratio and recall; turns are reported. The rollback decision is the user's** (option 4a + "решение об откате принимает юзер"). | 33 §1 and 41 step 3: a failed criterion presents the numbers and stops; no script abandons a component. Generalized to every decision point (R13). |
| D11 | **A plan is saved as a draft before anyone is asked to accept it**, so an unexpected end of the agent loses nothing (from option 5c). | 23 step 7: `note save --kind plan-draft` at the tail of `plan check`, before the gate; acceptance promotes. |
| D12 | **`ExitPlanMode` as an acceptance channel is deferred** (option 5c). | Backlog; `AskUserQuestion` + `--answer` only. |
| D13 | **The harness change (per-arm prompts, restore the stash files) and a second baseline ≈ $28 are approved as step 0** (option 6a). | 41 step 0; the $28 run happens on an explicit go. |

## 4. Non-goals

No RAG or embeddings; no GitHub provider; no fine-tuning; no automatic publication, commit, push or
ticket transition; no Markdown rule loader at runtime; **no LSP or language service of any kind in
v3** (D8; backlog); no automatic rollback (D10).

## 5. Design rules derived from §2 and §3

| Rule | From | What it forbids |
|---|---|---|
| R1 Code runs every fixed step; the model is asked only for judgment. | M2, M3 | A body that says "run X" where a hook or the CLI could run X; a model-built envelope when the hook already has the payload. |
| R2 One step's text in context at a time. | M1, M16, M17 | Loading the body plus two shared references up front. |
| R3 Evidence comes from the record. | M4, D1 of best-practices | A self-reported navigation line; "tests pass" from memory; an acceptance the model typed as a flag. |
| R4 Every gate has a release and a **non-acting** default; a default is taken only on record. | M13, review C2 | A headless fall-through that writes config or spends on a reviewer. |
| R5 Bounded by design. | M14, M16 | "Never truncate"; anything over the window goes behind `--show` or into a file. |
| R6 Read batched when nothing is known; spans once the map exists. | M7 | "Read spans with offset/limit" as the first instruction of a cold start. |
| R7 Search with code-shaped terms; pass 2 uses identifiers pass 1 found, by code, with no index. | M5, M6 | A shortlist from prose, delivered once. |
| R8 Expand requirements one level with field lists: children read, siblings listed. | M11, #47 | An envelope limited to the typed URL; a `*all` JQL. |
| R9 Parse commands structurally, never with a regex over the whole string. | M12 | A guard that matches a heredoc body. |
| R10 Nothing is mandated before it is measured. | §1, M8, M10 | "LSP is required"; an index a skill needs to run; a recorder nobody timed. |
| R11 A tool that lied once is distrusted first next time. | M9 | Trusting the LSP tool's first `findReferences`. |
| R12 The engine never wedges and never acts: an unanswered gate re-prints, then takes the non-acting option on record. | review C2–C4 | A route that waits forever, or one that runs the reviewer because nobody answered. |
| R13 A decision point presents; the user decides. | D10 | A kill criterion that deletes or disables a component; a result file without the loser's numbers. |
| R14 Every automatic choice code makes is declared, printed and recorded. | D9 | A layer picked by a heuristic nobody can read in config or the ledger. |
| R15 Loops are `revise` entries with a `repeat` bound. | review-v2 #42 | "≤ 2 rounds" in prose with no step to run the second round in. |

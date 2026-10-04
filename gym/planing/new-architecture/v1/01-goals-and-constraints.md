# Goals, measured facts, decisions, non-goals

## 1. The goal, as a number

The plugin earns its place only when the same user, on the same model, gets a measurably
better result than without it, at a cost they would pay. Each skill has its own bar
([33-measurement.md](../v1/33-measurement.md) owns the gates):

```
investigate   recall(with) >= recall(without) + noise band   cost <= 1.15x   turns <= without + 2
plan          AC coverage, anchor validity and file recall above the naked arm on >= 3 epics x 3 runs
task          pass(with) > pass(without) beyond the spread on a hidden-test suite   cost <= 1.2x
review        thread recall >= naked arm with a live reviewer; `complete` on >= 90% of runs without a waiting check
all           0 text-only "never" rules; 100% of cited path:line exist; every gate has a tested release
```

Today's numbers against those bars (Sonnet 5.5, `archive/baseline-2026-10-02.md`):

```
investigate   recall 0.720 vs 0.697 (band 0.101): tie     cost 1.42x: FAIL     turns +4.7: FAIL
review        invalid for the plugin arm (replay-miss in 10/24 and 16/24 runs)
task          no suite exists; 1 Edit/Write in 7,709 tool calls across 712 traces
```

## 2. Measured facts the design rests on

Every architectural choice below cites one of these rows. A reviewer who thinks a choice is
wrong should attack the row, not the choice.

| # | Fact | Number | Source |
|---|---|---|---|
| M1 | The with-arm pays for steps that do no navigation: `Skill` call, `ToolSearch select:LSP` (finds nothing in the sandbox), `note save`, reading `requirements-mcp.md`, `config`. | 3 of 4 extra calls in the be-vs-5546 pair; +4.7 turns, 1.42x on average | baseline §Example 1 |
| M2 | A weaker model skips prose steps. | `prepare` ran 26/29 on Opus, 3/50 on Sonnet, same skill body | skill-gap-plan §1 |
| M3 | A hook makes the step happen regardless of the model. | hook-delivered `prepare` present in 7/7 runs that saved a note (slug evidence) | baseline §Localize correction |
| M4 | Prose "never" rules fail even on Opus. | "never truncate" violated 28/31; B2 wording that gave the *reason* held 4/4 | skill-gap-plan iteration 2 |
| M5 | Term shortlist from ticket prose is useless; from code identifiers it is exact. | 1 irrelevant candidate vs 15/15 in the MR | real-run B2 |
| M6 | Offline shortlist recall is weak on the FE repo. | recall@15 BE 0.499, FE 0.123; non-source files took 38% of slots | known-gaps G10 |
| M7 | Agents read through Bash, batched, not through `Read`. | Bash reads 164 vs Read 85 (Opus); 177 vs 24 (Sonnet) | skill-gap-plan §1 |
| M8 | The model does not load LSP unless told; told, it makes one call and greps anyway. | L arm 0/4 LSP calls; A arm 1,0,1,0; `findReferences` 0 of 12 localize runs | direction §Step 2 walk |
| M9 | A cold language server under-reports references with no warning. | 2 of 11 refs at once, 11 after 5 s (532 files); 1 of 22, 22 after 11 s (2,338 files) | known-gaps G25 |
| M10 | Word-boundary grep solves symbol-user questions on these repos. | N and L arms recall 1.00 precision 1.00 in 4/4; A arm 0.75 | known-gaps G27 |
| M11 | The requirement procedure cost requirements. | naked read 3 child tickets via JQL; both plugin arms read only the epic (5 fields) | real-run B1 |
| M12 | The plugin's own guard denied a legitimate save. | `cd X && node ambicode.mjs note save <<EOF` denied; +20k output tokens | real-run B3 |
| M13 | The plan gate has no headless release. | 95 KB plan left as "draft", unsaved | real-run B4 |
| M14 | Output windows. | Bash tool shows 30,000 chars whole; hook `additionalContext` inline ≤ 9,800 chars, ≥ 10,400 goes to a file behind a preview | probes-2026-09-30; prepare-on-skill.ts |
| M15 | Hook spawn cost. | standalone guard 34 ms median; CLI bundle `hook` 89 ms; bare `node -e 0` 29 ms | skill-gap-plan iteration 5 slice 1 |
| M16 | Payload sizes. | compact `prepare`: investigate 4.1 KB, plan 13.3–14.0 KB, task 16.2–16.5 KB; rules alone 5.8 KB | skill-gap-plan G6 |
| M17 | Module count per activity. | task loads body + 2 shared files + contract + prompts = 5; SkillsBench 1–3 modules +19 pp vs 4+ +10 pp | best-practices B1 |
| M18 | Reviewer isolation and finding validation hold. | `--tools Read,Grep,Glob`, safe mode, snapshot; one bad location voids the result | best-practices C6, D4 |
| M19 | The investigation note is cheap and precise. | $0.36, 1.0 min, 9 LSP calls, every anchor in range | real-run §5 session A |
| M20 | Big-ticket plans peak context. | 214k of 500k, with the plan written twice | real-run §5 session B |
| M21 | Index tools, measured on 2026-10-03 while writing this (see [modules/10-search.md](modules/10-search.md) §3). | cold index FE (2,338 ts): codeindex 5.7 s, agentmap 6.1 s, scip-typescript 11.6 s; warm 0.2–0.5 s | [measurements-2026-10-03/](../measurements-2026-10-03/README.md) |

## 3. Decisions taken by the user (inputs, not open for redesign)

| # | Decision | Consequence in this design |
|---|---|---|
| D1 | **LSP only in `task`**, where base context already exists; not in `investigate`, not in `review`. | Search module layers: text + shortlist + index for every skill; LSP is a `task`-only layer, loaded after the map exists (symbols known), used for references of symbols about to change and diagnostics after edits. `review` gets dependents from the index, not from LSP. The `requirements.lsp` mandate disappears from investigate and review. |
| D2 | **The user launches everything.** No automatic skill selection, no model-invoked skills. | Every skill is `disable-model-invocation: true`. The route starts from the typed `/ambicode:<skill>` command through `UserPromptSubmit`. Trigger evals are retired. Listing cost drops to the user-invoked set. |
| D3 | **Helpers and subagents only with the user's approval.** | Workers are proposed as a gate with a release (run / do it inline); a config flag can pre-approve per worker. |
| D4 | **SCIP/LSIF/repo map: consider adoption; do not write from scratch.** | §3 of the search module compares three off-the-shelf tools with numbers measured today and names one, behind an interface, optional until the eval in 33-measurement passes. |
| D5 | **Modular, layered; consider a framework; build our own harness while the plugin works.** | [02-overview.md](02-overview.md) §2–3. The framework is internal: routes as data, modules behind interfaces. The harness is the route engine driving the model one step at a time through hooks and CLI output. |
| D6 | **The real-run's git and write denials were imposed by the user for the test.** | The `git status` denial in real-run §4 is not a plugin defect. B3 (the plugin's own guard denying `note save`) and B4 (no headless release) remain defects and are fixed here. |

## 4. Non-goals

- No RAG, no embeddings, no network index. The harness notes (`archive/harness-and-search.md`)
  put RAG last and only for documentation corpora; nothing measured here needs it.
- No GitHub provider. The refusal stays.
- No fine-tuning (best-practices §2: unavailable for the models used, and not a skill lever).
- No automatic publication, commit, push, or ticket transition. Human-only, unchanged.
- No Markdown rule loader at runtime. YAML packs stay the only policy format.
- No attempt to make the eval sandbox prove LSP value: LSP is task-only and `task` is measured
  on its own suite with the tools it really has.

## 5. Design rules derived from §2

| Rule | From | What it forbids |
|---|---|---|
| R1 Code runs every fixed step; the model is asked only for judgment. | M2, M3 | A skill body that says "run X" where a hook or the CLI could run X. |
| R2 One step's text in context at a time. | M1, M16, M17 | Loading the whole skill body plus two shared references up front. |
| R3 Evidence comes from the record. | M4, best-practices D1 | A self-reported `Navigation:` line; "tests pass" from memory. |
| R4 Every gate has a release, including headless. | M13, CLAUDE.md "Making changes" | A plan that cannot be saved because nobody clicked. |
| R5 Bounded by design. | M14, M16 | Payloads that rely on "never truncate". Anything over the window goes behind `--show`. |
| R6 Read batched when nothing is known; read spans once the map exists. | M7 | "Read spans with offset/limit" as the first instruction of a cold start. |
| R7 Search with code-shaped terms; the second pass uses identifiers the first pass found. | M5, M6 | A shortlist from prose compounds, delivered once and never revised. |
| R8 Expand requirements one level; list siblings, read children. | M11 | An envelope limited to the URL typed. |
| R9 Parse commands structurally, never with a regex over the whole string. | M12 | A guard that matches a heredoc body. |
| R10 Nothing is mandated before it is measured. | §1, M8, M10 | "LSP is required"; an index that must exist for a skill to run. |
| R11 A tool that lied once is distrusted first next time. | M9 | Taking the first `findReferences` of a session at face value. |

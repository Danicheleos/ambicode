# Migration from v0.4.0: order, the point of no return, what is touched

> **v7 note.** This migration is done. The v6 gaps were then closed by the 18-step plan in [../gap-report-plan.md](../gap-report-plan.md) (commits "Resolve gaps: Step N"); the steps below are kept as the record of the original order, not as future work.

Each step ships with its tests (CLAUDE.md). Effort letters are guesses; the total is a guess too
and is said so. Every "decision point" presents numbers to the user; nothing rolls itself back (D10).

| # | Step | Effort | Measured by | Decision point |
|---|---|---|---|---|
| 0 | Restore the **four** files from `stash@{0}`; green `verify`; per-arm prompts (`prompt.with.md` for the plugin arm; `prompt.md` **unchanged**; the runner records `prompt.md` as `promptMarkdown` and the served prompt as `pluginPromptMarkdown`, so `evals:gate` keeps accepting the cached 2026-10-02 baseline as the naked reference — **no new baseline**, D19, #101); probe P37; probe P47; `compare.log`; ledger copy-out; live reviewer tier. No model spend beyond the ≤ $1 probes. | S–M | the suite loads; P37 passes; `score` reads ledgers; `evals:gate` accepts the cached baseline against a plugin-arm run (after the `promptMarkdown` change in 33 §0.2, #101) | P37 fails in the sandbox → sandbox arms start routes from the body's fallback line (stated in every result) |
| 1 | Guard parser (15 §2) with the M12 fixtures; plan-body allow row; `.gitignore` deny during init; `updatedInput` only if P47 held. | S | fixtures | — |
| 2 | Evidence v4: 21 kinds incl. `revise` and `preanswer`, with `route {channel, trusted}`, `step {status}`, `gate`/`acceptance {object}`, `envelope {asked, missingAsked}` (G1, G2, G5, G6); session-scoped ids; `note list`; `plan-draft` first; `note promote` with the **bound** predicate and its recovery (13 §3, G2); `--from`; `--iteration`; `report`. | S–M | unit; S3 and S10's promote half (33 §8) | — |
| 3 | **Route engine with the investigate route only**, built to the execution contract of 12 §8 (one six-step sequence for start / next / command tail / gate hook / resume; `step {completed}` records, G6): `when` incl. `gate.<id>.*`, declared + raised gates (the full `gates.yaml`, with `policy {review: stop}` on the three missing-source gates, G5), marker binding via the AskUserQuestion hook (probes P2/P48 first) with `object` on the gate print and the answer (G2), `revise`/`onAnswer`/`onFail`/`repeat` with the **target-step** bound (G3), human cycles and `maxRevises` (D14), `preanswer` from **trusted** channels only (`hook`/`harness`; `--headless` is a mode, G1, P58), the init exemption in start (G4), resume by adoption, `route-busy` (G2), one flag vocabulary, tail-advance from evidence-writing commands, dedup with args hash, supersede; MCP capture hook (`mcp__.*`, binding inside); envelope from captures or args with `missingAsked` (G5); `hasRequirement` defined (headless: `--requirement` only, D17); `map` with explicit layers (route-only override, D15) and regex pass 2; `grepWords`; body ≤ 2 KB; `prepare` aliased. | M–L | 33 §1: `evals:walk`, then `evals:decide` (plugin arm, ≈ $14) against the cached baseline: cost ≤ 1.15x and recall within the band; turns reported; 33 §8 S1, S2, S9, S10, S11, S12 | **Point of no return.** Criterion fails → numbers presented; **the user decides** whether the engine proceeds, is cut down, or is abandoned (then steps 4–5 ship on v0.4.0's slash and MCP hooks, which they can, #73). |
| 4 | Requirements v3 complete: template with field lists, expansion, `acs`, binding rule in the hook, `search*` capture (list-only hits are not captures of the listed documents), `asked`/`missingAsked` coverage and `requirements-partial` (G5), conflict gate via `--answer`. | M | 33 §4's AC coverage (tie expected); S7 (33 §8) | — |
| 5 | Search v3 complete: `refs` (grep -w) with collision flags, `find`, `relates`, `IndexAdapter` with `none` + `codeindex`, detached build with the ignore check, offline recall script, colliding-name impact cases. | M | 33 §3 offline, then decide | codeindex gains < 0.05 over the regex harvest → stays `none`; the user may enable per repo |
| 6 | Plan route + `plan check` with `onFail` re-entry (bounded by `plan-write`'s `repeat`, G3) + draft-first + `plan-accept` with `object: note{plan-draft}` and the bound `promote` (G2) + decision gates + hand-labelled ACs + the one-process real-run runner + the `Write(plan-body.md)` grant. | M | 33 §4 (composite defined); S3, S4, S5, S11 (`plan` half), S13 (33 §8) | not a win → presented; scout appendix proposed only if traces point at context/cost |
| 7 | Task route: `check --only` with summaries and the `--approve` rule, model-run `format`, baseline scoping, caller inventory with collisions, `review-run` → `fix` re-entry, Stop hook; probe P17 first. | L (the suite is the largest item) | 33 §5 with the detectable effect stated | inconclusive at 10 × 3 → the user chooses: enlarge (≈ $90–270) or cut task to baseline + guard + review offer |
| 8 | Review route: estimate gate (acting preanswer from a trusted start only, G1), index `relates` dependents, **every** missing-source outcome stops (`policy: {review: stop}` on three gates + the `requirements-missing` refusal of `ground`, G5, #143), `review-run` re-entry on approval, verbatim coverage, selection metrics. | S–M | 33 §6 live tier (conditional on P37(b) or P58 for the plugin arm's `estimate=run`); S7, S8, S14 (33 §8) | finder claim not supported → the user decides the description |
| 9 | init bootstrap without a config (12 §2.1 exception, G4), `--apply --set` (config + `.gitignore` on acceptance whose `answer` carries the values, explicit `search.layers`, ecosystem adapter detection R16, *Adjust* re-ask), `doctor`, config v4 migration; rules drafts/quotes/apply/revert with `revise draft` (bounded by `draft`'s `repeat`, G3). | M | fixtures; S6 (33 §8) | — |
| 10 | Experiments behind flags: `review.onInvalid: drop`; appendix workers after P21. Backlog items (50) open only on their entry conditions. | S each | eval | — |

**Total effort, I'd guess**: 8–12 engineer-weeks to step 8, of which the task suite (step 7) is 2–3
on its own; steps 0–3 are 2–3 weeks and produce the numbers the user decides on.

## Deleted

`skills/shared/prepare-output.md`, `skills/shared/requirements-mcp.md`,
`skills/review/references/impact.md` (the LSP procedure; nothing replaces it in v4 — backlog),
`READING_ORDER`, `requirements.lsp`, `evals/evals-triggers` as a gate (cases kept as negatives for
"nothing fires on a plain question"), the regex guard, the `prepare` command after one deprecation
release, model-invocable descriptions, the `PostToolUse(Skill)` hook entry, the `PostToolUse(Edit|Write)`
hook entry until a pack opts in, the forced-prompt eval twins, `note save --kind plan`.

## Kept, with the seams this design touches named

| Files | Kept | Touched by |
|---|---|---|
| `src/modules/review/reviewer/prompt.ts`, `report.ts`, `src/modules/review/snapshot/*`, `src/platform/providers/*`, `src/modules/review/publication/*`, `policies/*.yaml`, `prompts/reviewer-role.md`, `src/modules/review/page/templates/*.eta` **except `review.eta`** (#70) | byte-for-byte | — |
| `src/modules/review/bundle/bundle.ts` | pipeline unchanged | `--task` baseline scoping (16 §4), `--estimate` dry mode (16 §5), tail advance |
| `src/modules/review/findings/validate.ts` | rules unchanged | `review.onInvalid: drop` branch, off by default (16 §7) |
| `src/modules/review/reviewer/claude-reviewer.ts` | invocation unchanged | generalized into the process runner (17 §1) |
| `src/modules/checks/run/run.ts`, `select.ts`, `authorize.ts` | selection and authorization unchanged | `--only` forced selection and runner summary parsing (16 §2); `format` (16 §3); tail advance |
| `src/modules/review/page/*`, `src/modules/review/page/templates/review.eta` | page unchanged | `metrics.jsonl` on submit (16 §8) |
| `src/modules/policy/*` | resolver unchanged | `stage()` projection, `--drafts` checks (11) |
| `src/modules/search/text/locate.ts`, `dependents.ts` | scoring and name search unchanged | pass 2 by a global regex harvest with declaration counts (10 §1); `grepWords` in `src/platform/git/git.ts` |
| `skills/plan/SKILL.md` | judgments | `allowed-tools` gains `Write(.ambicode/task/*/steps/plan-body.md)` (#57) |

## Compatibility

`.ambicode/config.yaml` v1/v2 loads with a notice until `init --apply` migrates it (`requirements.lsp`
and `task.lspPlugins` dropped with a notice; `search.layers` written explicitly). v0.4.0 task
directories (two ledger kinds, `note` and `review`, #110) fold as "no route"; new routes start beside the old notes;
`note list` shows both. Review artifacts unchanged.

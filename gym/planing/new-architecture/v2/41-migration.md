# Migration from v0.4.0: order, the point of no return, what is touched

Each step ships with its tests (CLAUDE.md). Effort letters are guesses; the total is a guess too
and is said so.

| # | Step | Effort | Measured by | Kill |
|---|---|---|---|---|
| 0 | Restore `reuse-score.mjs` from `stash@{0}`; green `verify`; typed-command prompts; probe P37; ledger copy-out; replay re-key or live tier; second baseline. | S–M | the suite loads; the probe passes; `score` reads ledgers | P37 fails in the sandbox → sandbox arms start routes from the body's fallback line (stated in every result) |
| 1 | Guard parser (15 §2) with the M12 fixtures; `updatedInput --task`; plan-body allow row. | S | fixtures | — |
| 2 | Evidence v2: kinds, `note list`, `plan-draft`, `--from`, `--iteration`, `report`, `plan` refusal without acceptance on record. | S–M | unit | — |
| 3 | **Route engine with the investigate route only**: `when`, gates on human steps, non-acting defaults, session-filtered fold, dedup with args hash, supersede; MCP capture hook; code-built envelope; regex pass 2 in `map`; `grepWords`; body ≤ 2 KB; `prepare` aliased. | M–L | 33 §1 (walk → decide): cost ≤ 1.15x, turns ≤ budget + 2, recall within the band | **Point of no return.** Fail → the engine is abandoned; steps 4–5 ship on v0.4.0's hook plumbing (the `Skill`/slash/MCP prepare hooks), which they can. |
| 4 | Requirements v2 complete: template, expansion, `acs`, binding rule, `search*` capture. | M | 33 §4's AC coverage (tie expected) | — |
| 5 | Search v2 complete: `refs --exact` (one child per call), `find`, `relates`, `IndexAdapter` with `none` + `codeindex`, detached build with the ignore check, offline recall script. | M | 33 §3 offline, then decide | codeindex gains < 0.05 over the regex harvest → ship `none` only, keep the interface |
| 6 | Plan route + `plan check` + hand-labelled ACs + the one-process real-run runner. | M | 33 §4 | — (the scout appendix opens only if §4 points at context/cost) |
| 7 | Task route: `check --only` with summaries, `format`, baseline scoping, caller inventory, Stop hook; probes P17, P36 first. | L (the suite is the largest item) | 33 §5 | pass gain inside the spread → cut task to baseline + guard + review offer |
| 8 | Review route: estimate gate, index dependents, verbatim coverage, selection metrics. | S–M | 33 §6 | finder claim killed → description and 01 §1 say "publication and coverage" |
| 9 | init `--apply --set`, `doctor`, config v2 migration; rules drafts/quotes/apply/revert. | M | fixtures | — |
| 10 | Experiments behind flags: `review.onInvalid: drop`; appendix workers after P21. | S each | eval | — |

**Total effort, I'd guess**: 8–12 engineer-weeks to step 8, of which the task suite (step 7) is 2–3
on its own; steps 0–3 are 2–3 weeks and decide whether the rest happens.

## Deleted

`skills/shared/prepare-output.md`, `skills/shared/requirements-mcp.md`,
`skills/review/references/impact.md` (its retry rule becomes `refs --exact`'s one-process answer),
`READING_ORDER`, `requirements.lsp`, `evals/evals-triggers` as a gate (cases kept as negatives for
"nothing fires on a plain question"), the regex guard, the `prepare` command after one deprecation
release, model-invocable descriptions, the `PostToolUse(Skill)` hook entry, the `PostToolUse(Edit|Write)`
hook entry until a pack opts in, the forced-prompt eval twins.

## Kept, with the seams this design touches named

| Files | Kept | Touched by |
|---|---|---|
| `src/review/prompt.ts`, `report.ts`, `src/snapshot/*`, `src/providers/*`, `src/publication/*`, `policies/*.yaml`, `prompts/reviewer-role.md`, `templates/*.eta` | byte-for-byte | — |
| `src/review/bundle.ts` | pipeline unchanged | `--task` baseline scoping (16 §4), `--estimate` dry mode (16 §5) |
| `src/review/validate.ts` | rules unchanged | `review.onInvalid: drop` branch, off by default (16 §7) |
| `src/review/claude-reviewer.ts` | invocation unchanged | generalized into the process runner (17 §1) |
| `src/checks/run.ts`, `select.ts`, `authorize.ts` | selection and authorization unchanged | `--only` forced selection and runner summary parsing (16 §2); `format` (16 §3) |
| `src/page/*`, `templates/review.eta` | page unchanged | `metrics.jsonl` on submit (16 §8) |
| `src/policy/*` | resolver unchanged | `stage()` projection, `--drafts` checks (11) |
| `src/code-intelligence/locate.ts` | scoring unchanged | pass 2 by regex harvest; `grepWords` in `src/git/git.ts` |

## Compatibility

`.ambicode/config.yaml` v1 loads with a notice until `init --apply` migrates it (`requirements.lsp`
→ `task.lspPlugins`). v0.4.0 task directories (2 ledger kinds) fold as "no route"; new routes start
beside the old notes; `note list` shows both. Review artifacts unchanged.

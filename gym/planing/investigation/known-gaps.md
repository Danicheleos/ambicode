# Known gaps

Kept up to date as the iterations of [skill-gap-plan.md](skill-gap-plan.md) land.
Last edit: 2026-10-02, after phase 5 slices 1 and 2. G1–G8 come from
[archive/lsp-flow-report-2026-10-02.md](archive/lsp-flow-report-2026-10-02.md); G9 onward were
found after it. Evidence is from headless `claude -p` runs on the BE scaffold
(mostly n = 1, a mechanics read, not a rate) and from the 712 eval traces. Real
ticket ids are left out on purpose.

Status: **open** (nothing done), **partial** (mitigated, not closed),
**fixed** (built and tested), **parked** (decided to wait), **unmeasured**.

## Reading code and LSP

| # | Gap | Evidence | Status | Next |
|---|---|---|---|---|
| G1 | A typed `/ambicode:…` command is expanded without a Skill tool call, so `PostToolUse(Skill)` never fires. | Headless runs: no Skill tool call, no `prepare`, 0 LSP calls. | **partial**: `UserPromptSubmit` now prepares for `/ambicode:(investigate\|plan\|task)`, tested. Interactive prompt shape unverified; a leading sentence, another spelling or natural language gets no hook. | Type it three ways in an interactive session. A transcript check (`transcript_path` is in the hook input) could detect an active skill. |
| G2 | `requirements.mcpServer: atlassian` does not match the connected `claude.ai Atlassian Rovo`. | 1 of 2 identical ticket runs stopped to ask which server. The colon binding form (`plugin:atlassian:atlassian`) is untested against the underscore segment. | open | Decide the binding rule with its owner; test both forms. |
| G3 | `findReferences` is blind without installed dependencies. | The scaffold has no `node_modules`; references often return only the definition and the agent greps. | open, **unmeasured** on a real repo | One run on a repository with dependencies installed. |
| G4 | Small files (15–43 lines) were read whole after `documentSymbol`, not as link-blocks. | d1/d2 runs. Large files were read in blocks. The 300-line whole-file limit is a guess. | open | Test a 100–300 line file. |
| G5 | One early `grep` still precedes the first LSP call in some runs. | 2–3 of the runs after the reading order moved into the hook message. | open; fix **parked** | The Grep gate: deny once per epoch, only after `prepare` was delivered. Probed: a deny reason is obeyed, hook context arrives too late. |
| G6 | `plan` and `task` payloads exceed the 9,800-character inline window and arrive as a file behind a preview. | 13.7 KB and 16.3 KB on the BE scaffold. The reading order sits at the top and was seen. | open | Cut rules from those payloads, not the order. |
| G7 | `review` does not use the reading order or LSP. | It builds its snapshot in the CLI and has no `prepare`. | open | `findReferences` on changed symbols to find callers outside the diff (a proposal, untested). |
| G8 | No measured effect of any of this against the naked model. | The contrast run in the plan hit the account's session limit and is not valid. `evals:walk` cannot load `typescript-lsp`. | open, **unmeasured** | A short contrast, 8–12 runs, after G1 and G3. |
| G9 | The model sometimes re-reads what it has. The Read tool stops identical repeats ("Wasted call — file unchanged since your last Read"); a sub-range, a Bash `cat`/`sed` or an overlapping range is not stopped. | 9 of 712 eval runs `cat`ed a file already read; 0 of 723 Reads were fully covered repeats. | open, low priority | A tracker only if a later measurement shows it matters. |
| G10 | FE shortlist recall is weak. | FE@15 0.123 against BE@15 0.499. FE true files share no vocabulary with the ticket. | open | Link-blocks per candidate in the payload, then the term transformer, only if the contrast shows value. |
| G11 | The delivery of the reading order depends on hooks only. A `prepare` rerun by the model through the CLI has no reading order. | The order is in the hook header, not in `prepare --json`. | open | Decide whether the CLI header should carry it too. |
| G12 | LSP use cannot be measured in the eval sandbox. | Evals load only the plugin under test; `typescript-lsp` is not available there. The walk report also counts `prepare` by Bash calls only, so hook delivery looks like "never ran". | open | Count hook events in the trace, or measure with headless runs like these. |

## Enforcement (phase 5)

| # | Gap | Evidence | Status | Next |
|---|---|---|---|---|
| G13 | `plan` labels any save "accepted". | `--kind plan` adds "**plan** — accepted" with nothing checking that the human accepted. A direct request in a Haiku run got the label. | open | The ledger and the `AskUserQuestion`/`ExitPlanMode` probe, then a deny unless an acceptance entry exists. |
| G14 | Bash path tricks evade the guards. | `bash -c "git commit"` and a task-directory path assembled at run time are not seen. | open, accepted for a guard that asks | None planned. |
| G15 | The Bash check on the task directory is a pattern, so a harmless redirect that names the directory (`grep … x > out.txt`) is denied. | Tests cover the common shapes. The deny message says what to do. | partial | Tighten if a real run shows a false deny. |
| G16 | The task slug is chosen by the model, so the skills can disagree. | An investigation saved under a kebab of the question; a plan for the same ticket uses the ticket id. | open | `--task-open <request\|id>` mints the slug once (iteration 4, not built). |
| G17 | `task` keeps `Edit(**)` and `Write(**)` for any repository path. | No workspace-trust gate (E2). The guard covers the task directory and git writes, not the rest. | open | The `ask` on edits outside the prepared set; it needs the prepared paths stored where a hook can read them. |
| G18 | Hooks still start the 259 KB bundle where they could not use the standalone guard. | `PostToolUse(Edit\|Write)` costs about 89–143 ms per edit and is inert (no pack opts in). | open | Convert to a standalone script (iteration 5 remainder). |
| G19 | No ledger and no Stop hook. | The navigation line, "red before green" and "accepted" are still self-reported. | open | Iteration 6. |
| G20 | A guard `ask` is refused in non-interactive runs. | In headless `-p` the commit/push `ask` stops the command. Past evals ran 0 guarded git writes in 5,301 Bash calls, so no eval has been affected. | partial | Watch eval traces for refused git writes. |

## Measurement and process

| # | Gap | Evidence | Status | Next |
|---|---|---|---|---|
| G21 | Most checks are n = 1. | Run-to-run spread on one case was R 1.00 and 0.67 on identical runs. | open | Treat every row above as a signal to confirm. |
| G22 | The scaffold differs from a real project (no dependencies, no build). | G3. | open | A second scaffold with dependencies. |
| G23 | `evals:decide` and `evals:baseline` have not been run. | Out of scope for these iterations. | parked | Only on an explicit go. |

## Fixed in this round

| # | Fix |
|---|---|
| F-a | The model never loaded `LSP` unless told in the prompt. Fixed by the reading order in the hook message; 5–6 LSP calls and a correct `Navigation:` line in the runs after. |
| F-b | "No LSP tools in this session is complete" licensed skipping the load. Now "counts only if `ToolSearch select:LSP` found none". |
| F-c | Bare-question runs with no ticket got no `prepare` (the typed-command case, G1). `UserPromptSubmit` prepares them. |
| F-d | Notes carried guessed timestamps (`T12-00`, `T00-00`). `note save` stamps the clock. |
| F-e | Skills could write anywhere in `.ambicode/task/`. Direct writes are denied; `note save` is the way in. |
| F-f | Git write commands ran without asking. A standalone guard asks first (34 ms median against 89 ms for the CLI bundle). |

# Open problems, conflicts and unknowns (one list)

Kinds: **conflict**, **bottleneck**, **unknown**, **unmeasured**. Numbers continue from v1; v1 entries
resolved by the review are marked **closed** with what closed them, so the numbering stays citable.

| # | Kind | Problem | Where | Current answer | What settles it |
|---|---|---|---|---|---|
| P1 | conflict | A route engine is a workflow engine; rigid procedure can displace reasoning. | 12 | Fold-derived state; the engine enforces code-ran, gate-released-on-record, report-consistent; interactive semantics fixed (12 §3.4); the model can stop or supersede a route. | 33 §1–2 before anything is built on the engine; 41's point of no return. |
| P2 | unknown | `AskUserQuestion` hook payload; `ExitPlanMode` acceptance. | 12, 23 | `--answer` and non-acting defaults as the other channels. | Probes before 41 step 6. |
| P3 | conflict | A present human not asked. | 12 | Three unanswered calls, then the non-acting option on record; re-answerable. | Real sessions. |
| P4 | — | **closed**: the `Skill` entry hook is removed (dead under D2); the remaining unknown is P37. | | | |
| P5 | — | **closed**: no recorder ships (13 §5). | | | |
| P6 | unknown | The model may strip the hash comment. | 13 §4 | Normalized diff. | First 20 real runs. |
| P7 | — | **closed**: no paraphrase check; the envelope is code-built from captures (14 §3). | | | |
| P8 | unknown | Capture must know each MCP server's response shape. | 14 §3 | Fixtures from the two servers seen. | A third server. |
| P9 | unknown | The Stop hook reads the transcript (undocumented format). | 15 §3 | Fails open; only report-shaped stops are read. | A fixture per Claude Code version. |
| P10 | unmeasured | No number shows the index helping; grep tied on two unique names. | 10 §3 | `none` by default; pass 2 works without it. | 33 §3 (vs the regex harvest). |
| P11 | bottleneck | `refs --exact` 777 MB RSS on FE. | 10 | One child per call, all names per call, cap 3,000 `.ts/.tsx`. | Measure at 4,000 and 8,000 files. |
| P12 | bottleneck | codeindex grammars 17 MiB; offline regex tier unmeasured. | 10 | Documented. | 33 §3 offline with and without grammars. |
| P13 | unmeasured | Python has no exact layer. | 10 | Stated in `refs`. | A Python benchmark. |
| P14 | unknown | agentmap `relates` 65 of 179. | 10 §3 | Not shipped. | — |
| P15 | conflict | Staged rules can arrive late. | 11 §2 | `code-style` with `before-work` when ≤ 8 rules. | Late-rule findings in task reviews. |
| P16 | unknown | Duplicate threshold tuned on 12 packs. | 11 §4 | Warning only. | More packs. |
| P17 | unknown | `Stop` output fields. | 15 | The repo's probe shows `Stop` accepted in `hookSpecificOutput` on 2.1.278 (`docs/compatibility.md:383-387`); `additionalContext` there is open; file fallback. | One probe before 41 step 7. |
| P18 | unmeasured | Edits unmeasured; edit-time asks ship off. | 15, 24 | Off. | 33 §5. |
| P19 | bottleneck | Replay-miss blocks measuring review. | 16, 25 | Re-key or live tier. | 33 §0.6. |
| P20 | minor | Estimate history needs 5 reviews. | 16 | "no history". | — |
| P21 | unknown | Subagent MCP inheritance. | 17 appendix | Nothing ships that needs it. | Probe if revived. |
| P22 | unmeasured | Worker cost additive. | 17 appendix | Nothing ships. | 33 §4. |
| P23 | unmeasured | AC splitter precision. | 14 §4 | Signal only; hand labels for the plan eval. | Label 30 tickets. |
| P24 | unknown | `claude plugin list` per environment. | 20 | "unknown" degrade. | Smoke per platform. |
| P25 | conflict | Batched reads vs per-candidate confirmation. | 22 | Citations are checked, not reading. | Accepted. |
| P26 | unmeasured | `plan check` anchor forms. | 23 | Identifier anchors checked at ±3; prose ranges get the range check; counts corrected. | Count forms across the §4 runs. |
| P27 | conflict | Briefs with no failing-first test. | 24 | `limit {no-red}` with a stated observation. | Human judgment. |
| P28 | bottleneck | Background index not ready. | 24 | Grep fallback, stated. | Frequency on the task suite. |
| P29 | unmeasured | Python review dependents are names only. | 25 | Stated. | — |
| P30 | conflict | No LSP in review vs the missed-caller weakness. | 25, 10 | Default configuration: dependents unchanged (name search); index path measured with planted breaks. | 33 §6. |
| P31 | conflict | `active-route` pointer vs "no hidden state". | 30 §2 | Duplicates the ledger; scan fallback. | Delete if the scan is < 20 ms over 50 dirs. |
| P32 | unmeasured | Peak context per run. | 30 §3 | Caps on fixed text; variable parts listed. | 33 §7. |
| P33 | bottleneck | Hook spawns ≈ 1.6 s per run. | 30 §1 | Standalone guard; no recorder. | 33 §7. |
| P34 | conflict | "No automatic tool selection" vs code choosing search layers. | 10, 01 D2 | The model does not pick tools; code does, deterministically, and says which. | **Confirm with the user.** |
| P35 | unmeasured | The central claim: ceremony falls to the route budget at ≤ 1.15x. | 02 §5 | Mechanism stated; per-route budgets. | 33 §1 first. |
| P36 | unknown | Whether the LSP plugin pushes diagnostics after `Edit` (the only LSP use left). | 10, 24 | Passive; absence is not a gap. | Probe before 41 step 7. |
| P37 | unknown | `UserPromptSubmit` for a typed `/ambicode:…` interactively and in the sandbox: the only entry point. | 12, 30 §6 | Skill-body fallback line. | Probe first (33 §0.3). |
| P38 | conflict | The navigation line now says "model reads not recorded": honest, less informative. | 13 §5 | Accepted. | Reader feedback. |
| P39 | conflict | Two envelope trust levels (`captures` in real sessions, `model` in the sandbox). | 14 §3 | Labelled apart in reports and `score`. | — |
| P40 | unknown | Windows: Git Bash assumption for the parser. | 15 §2 | Smoke test. | The Windows CI job. |
| P41 | bottleneck | Runner summary parsing per adapter. | 16 §2 | `null` → `*-unproven`, visible. | Adapter fixtures per runner version. |
| P42 | conflict | Headless chain investigate → plan → task stops at the draft by default. | 23, 24 | `task --from-draft` (recorded) is the deliberate release; the task suite needs no plans. | — |
| P43 | unmeasured | The plan and task suites cost ≈ $50–70 and $30–90 per decision plus construction (base-commit scaffolds, dependencies, hidden tests). | 33 §4–5 | Stated; construction is 41's largest item. | A walk-sized dry run of each before the first decision. |
| P44 | unknown | Compaction re-attaches skill bodies "first 5,000 tokens each" per the docs; not re-probed on the current version. | 30 §5 | Bodies ≤ 2.5 KB, so either way they survive. | — |

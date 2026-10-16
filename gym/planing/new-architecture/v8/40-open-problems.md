# Open problems, conflicts and unknowns (one list)

> **v7 note.** Items closed while closing the gap report are listed in [CHANGELOG.md](CHANGELOG.md) (v7 section) with their open items; an entry here that the CHANGELOG closes is closed.

Kinds: **conflict**, **bottleneck**, **unknown**, **unmeasured**. Numbers continue from v1 and v2;
entries resolved by a review or a user decision are marked **closed** with what closed them, so the
numbering stays citable.

| # | Kind | Problem | Where | Current answer | What settles it |
|---|---|---|---|---|---|
| P1 | conflict | A route engine is a workflow engine; rigid procedure can displace reasoning. | 12 | Fold-derived state with re-entry; the engine enforces code-ran, gate-released-on-record, report-consistent; the model can stop, supersede or `--revise` a route. | 33 §1–2 before anything is built on the engine; the user decides at 41's point of no return (D10). |
| P2 | unknown | `AskUserQuestion` hook payload: question text (with the marker and its instance id) and chosen option present, so the hook can bind the answer. | 12 §3.4 | `--answer` fallback after asking for **non-acting** options only; acting options have no model-typed fallback (C1) — if P2 fails, acting answers exist only as trusted preanswers and 41 step 3 presents that to the user (D10). | Probe before 41 step 3. |
| P3 | conflict | A present human not asked. | 12 | Three advances with `asked = 0` → `never-asked`, non-acting, re-answerable; `onAnswer` applies on the late answer. | Real sessions. |
| P4 | — | **closed**: the `Skill` entry hook is removed (dead under D2); the remaining unknown is P37. | | | |
| P5 | — | **closed**: no recorder ships (13 §5). | | | |
| P6 | unknown | The model may strip the hash comment. | 13 §4 | Normalized diff. | First 20 real runs. |
| P7 | — | **closed**: no paraphrase check; the envelope is code-built from captures or args (14 §3). | | | |
| P8 | unknown | Capture must know each MCP server's response shape. | 14 §3 | Fixtures from the two servers seen. | A third server. |
| P9 | unknown | The Stop hook reads the transcript (undocumented format). | 15 §3 | Fails open; only report-shaped stops are read. | A fixture per Claude Code version. |
| P10 | unmeasured | No number shows the index helping; grep tied on two unique names (unlogged re-run). | 10 §3 | `none` by default; pass 2 works without it. | 33 §3 (vs the regex harvest), after `compare.log` exists. |
| P11 | — | **closed (backlog)**: `refs --exact` and its 777 MB RSS are out of v3 (D8). | 50 | | |
| P12 | bottleneck | codeindex grammars ("17 MiB" per its README, unchecked); offline regex tier unmeasured. | 10 | Documented. | 33 §3 offline with and without grammars. |
| P13 | — | **closed (backlog)**: Python exact layer — no exact layer for any language in v3. | 50 | | |
| P14 | unknown | agentmap `relates` 65 of 179. | 10 §3 | Not shipped. | — |
| P15 | conflict | Staged rules can arrive late. | 11 §2 | `code-style` with `before-work` when ≤ 8 rules. | Late-rule findings in task reviews. |
| P16 | unknown | Duplicate threshold tuned on 12 packs. | 11 §4 | Warning only. | More packs. |
| P17 | unknown | `Stop` output fields. | 15 | The repo's probe shows `Stop` accepted in `hookSpecificOutput` on 2.1.278 (`docs/compatibility.md:383-387`); `additionalContext` there is open; file fallback. | One probe before 41 step 7. |
| P18 | unmeasured | Edits unmeasured; edit-time asks ship off. | 15, 24 | Off. | 33 §5. |
| P19 | bottleneck | Replay-miss blocks measuring review. | 16, 25 | Live tier, $8–16 per decision. | 33 §0.7. |
| P20 | minor | Estimate history needs 5 reviews. | 16 | "no history". | — |
| P21 | unknown | Subagent MCP inheritance. | 17 appendix | Nothing ships that needs it. | Probe if revived. |
| P22 | unmeasured | Worker cost additive. | 17 appendix | Nothing ships. | 33 §4. |
| P23 | unmeasured | AC splitter precision. | 14 §4 | Signal only; hand labels for the plan eval. | Label 30 tickets. |
| P24 | — | **closed**: `claude plugin list` is not consulted (no LSP advice, D8). | | | |
| P25 | conflict | Batched reads vs per-candidate confirmation. | 22 | Citations are checked, not reading. | Accepted. |
| P26 | unmeasured | `plan check` anchor forms. | 23 | Identifier anchors checked at ±3; prose ranges get the range check; counts corrected. | Count forms across the §4 runs. |
| P27 | conflict | Briefs with no failing-first test. | 24 | `limit {no-red}` with a stated observation. | Human judgment. |
| P28 | bottleneck | Background index not ready. | 24 | Grep fallback, stated. | Frequency on the task suite. |
| P29 | unmeasured | Python review dependents are names only. | 25 | Stated. | — |
| P30 | — | **closed**: review dependents are the name search by default, `relates` with an index; no language service (D8); the index path is measured with planted breaks (33 §6). | | | |
| P31 | conflict | `active-route` pointer vs "no hidden state". | 30 §2 | Duplicates the ledger; scan fallback. | Delete if the scan is < 20 ms over 50 dirs. |
| P32 | unmeasured | Peak context per run; whether field lists are obeyed. | 30 §3 | Caps on fixed text; variable parts listed; capture does not reduce context (#47). | 33 §7. |
| P33 | bottleneck | Hook spawns ≈ 0.5 s typical, ≈ 2.5 s maximum per investigate run (30 §1), + 89 ms per unbound MCP call; two spawn figures disagree (89 vs ~190 ms). | 30 §1 | Standalone guard; no recorder. | 33 §7. |
| P34 | — | **closed by the user (D9)**: code chooses search layers deterministically; the choice is declared in config, printed on every run, recorded in the ledger and editable. | 10 §1 | | |
| P35 | unmeasured | The central claim: ceremony falls to the route budget at ≤ 1.15x. | 02 §5 | Mechanism stated; budgets recounted under 12 §3.1 (#45). | 33 §1 first. |
| P36 | — | **closed (backlog)**: LSP diagnostics push probe (D8). | 50 | | |
| P37 | unknown | `UserPromptSubmit` for a typed `/ambicode:…` interactively, in the sandbox, and under `claude -p` (#136): the only entry point. | 12, 30 §6 | Skill-body fallback line. | Probe first (33 §0.3). |
| P38 | conflict | The navigation line says "model reads not recorded": honest, less informative. | 13 §5 | Accepted. | Reader feedback. |
| P39 | conflict | Two envelope trust levels: `captures` (real sessions) and `args` (sandbox, pasted text). | 14 §3 | Labelled apart in reports and `score`. | — |
| P40 | unknown | Windows: Git Bash assumption for the parser. | 15 §2 | Smoke test. | The Windows CI job. |
| P41 | bottleneck | Runner summary parsing per adapter. | 16 §2 | `null` → `*-unproven`, visible. | Adapter fixtures per runner version. |
| P42 | conflict | Headless chain investigate → plan → task stops at the draft by default. | 23, 24 | `task --from-draft` (recorded) or `route start --answer plan-accept=Accept` from a **trusted** start (the `claude -p` prompt through the hook, G1): a `preanswer` consumed at the gate, surviving revisions (#78), bound to the draft present at the gate (G2); it accepts an artifact nobody has seen and the report says so. | — |
| P43 | unmeasured | The plan and task suites cost ≈ $32–45 and $30–90 per decision plus construction. | 33 §4–5 | Stated; construction is 41's largest item. | A walk-sized dry run of each before the first decision. |
| P44 | — | **closed**: the "first 5,000 tokens" compaction claim is dropped (no source); bodies ≤ 2.5 KB. | 30 §5 | | |
| P45 | conflict | `revise` + `repeat` interplay: a route author can write a loop that never converges within `repeat` and ships Known limitations instead. | 12 §4 | Accepted; every declared revise is driven to its limit in 33 §8. | Fixtures; the first 20 real plans. |
| P46 | conflict | Model-raised decision gates: the model chooses slug and options; only default and release are fixed. It may ask nothing material. | 12 §3.5, 23 | The composite is the measure, not the gate count. | 33 §4. |
| P47 | unknown | `updatedInput` on `PreToolUse` is unverified. | 15 | Nothing depends on it; every step text carries `--task`. | Probe before 41 step 1. |
| P48 | unknown | Whether `PostToolUse(AskUserQuestion)` may return the next step as `additionalContext`. | 12 §6, 30 §1 | Contract allows `PostToolUse` (`hook.ts:33`); payload is P2. Fallback: +1 `route next` per gate. | Probe before 41 step 3. |
| P49 | unmeasured | The task suite at 10 × 3 detects only ≈ 20 pp. | 33 §5 | Stated; the inconclusive band is presented with the cost of enlarging. | The user's choice after the first decision run. |
| P50 | conflict | The plan composite (≥ 2 of 3 beyond the naked spread) can still flip on a different noise definition. | 33 §4 | One definition fixed before the first run. | Report the per-metric spreads with every result. |
| P51 | unmeasured | Colliding names have no exact answer in v3: `collides: true` + a reading instruction (model-obeyed, M2). | 10, 24, 25 | The honest substitute; the backlog item is the fix. | Colliding-name impact cases (33 §3). |
| P52 | conflict | Decision points do not act (D10): a failing criterion stops with a report. A run can end "inconclusive" and nothing changes until the user reads it. | 33 | Intended; `eval-gate` still fails CI on a fired criterion so the result cannot be missed. | — |
| P53 | bottleneck | The MCP hook spawns on every `mcp__*` call in **every** session (the work is route-gated), not only on four tokens. | 14 §1, 30 §1 | 89 ms per call; exits early without a route or when unbound. | 33 §7 counts no-route spawns. |
| P54 | conflict | Resume by adoption folds over two sessions' entries: a second **live** session on the same slug sees the first's steps as done. | 12 §2.3 | Intended for a restart (D11); only for skills owning no file — `plan` adopts by an explicit `--adopt` (H2); `route status` names the sessions; `--fresh` restarts. | Real sessions; two-people fixture (S11). |
| P55 | unknown | `maxRevises: 3` is a guess; a fourth human round needs `route start --fresh` (draft kept). | 12 §5, 23 | Printed as "(N left)". | How often "(0 left)" appears in real plans. |
| P56 | unmeasured | The noise band (0.101) comes from one baseline and no second run is planned (D19). | 33 §0.2 | Stated with every result that uses the band. | A second baseline if the user ever asks. |
| P57 | unmeasured | Language-agnostic by construction (R16), measured only on TypeScript (D18): adapters for other ecosystems have no number. | 10, 20, 33 | Stated; an unknown ecosystem degrades to shortlist + grep. | A benchmark in another ecosystem, when the user wants one. |
| P58 | unknown | Can the eval harness hand a per-run token to the model's Bash children inside the `claude plugin eval` sandbox, so a model-typed fallback start can be `channel: harness` (trusted)? | 12 §2.4, 30 §6, 33 §0.4 | If not, acting preanswers in the sandbox exist only when P37(b) holds; review and task evals are conditional on one of the two and say so (G1). | Probe with P37, same case. |
| P59 | conflict | `route-busy` refuses a second live `plan` route on one slug from another session, whatever the args, narrowing P54. | 12 §2.3, 23 step 1 | Accepted: `steps/plan-body.md` and the drafts are per task; two people use two task directories (`--task <slug>-2`); an abandoned plan route is taken over with `--adopt` (position kept) or `--fresh`, never timed out (#141, H2); the former owner is refused at write time. | Real sessions (S11); revisit if the extra `--adopt` turn after a crash bites. |
| P60 | — | **closed (C2)**: binding to the latest `gate` entry was a recorded wrong lookup, not a platform unknown. Every print appends a `gate` entry whose id is the instance in the marker; the answer binds to that instance and copies its `object`; an unresolvable marker is `unbound` and re-asked, never acted on. | 12 §3.4, 13 §1 | | S13 |

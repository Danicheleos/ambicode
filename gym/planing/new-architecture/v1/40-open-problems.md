# Open problems, conflicts and unknowns (one list)

Numbered as cited in the module and skill files. Each row says what kind of problem it is:
**conflict** (two commitments pull apart), **bottleneck** (a cost or limit), **unknown** (a
platform or behaviour fact not probed), **unmeasured** (a prediction with no number yet).

| # | Kind | Problem | Where | Current answer | What settles it |
|---|---|---|---|---|---|
| P1 | conflict | The route engine is a workflow engine; the skills forbade one because rigid procedure displaces reasoning. | 12 §Open | State is a fold of the ledger; the engine enforces only code-ran, gate-released, report-consistent; the model can stop a route. | 33 §1–2: if the route arm loses recall, the engine is too prescriptive. |
| P2 | unknown | Gate answers reach the ledger only via a `PostToolUse(AskUserQuestion)` hook; `ExitPlanMode` as a hook payload not probed. | 12, 23 | `--accept/--decline` flags as the second channel; default-taken as the third. | One interactive probe each. |
| P3 | conflict | Headless default releases vs a present human whose answer arrives late. | 12 | Defaults are always the conservative option (draft/skip/decline/inline). | Observe in real sessions; if a human ever loses work to a default, add an explicit `--wait` mode. |
| P4 | unknown | Three entry hooks for one route start; dedup by (slug, skill, epoch). | 12 | Idempotent start. | Test against both probes (Skill tool fires / does not fire for a typed command). |
| P5 | bottleneck | The optional recorder hook spawns per Read/Grep/Glob/LSP call. | 13 §5 | Standalone bundle, ~34 ms; ships behind a flag. | 33 §7: ≤ 2 s per 30-call run or it goes. |
| P6 | unknown | Whether the model pastes the generated report sections unchanged, hash comment included. | 13 §4 | Normalized-diff fallback in the Stop hook. | First 20 real runs. |
| P7 | unknown | Raw-hash normalization across MCP servers (ADF, markdown, HTML). | 14 §3 | Fixtures from the two servers seen. | A third server's payload. |
| P8 | bottleneck | JQL search payloads (53 KB seen) in the main context. | 14 | The hook strips `search*` to key + summary; children are read one by one. | Measure context per plan run (peak was 214k). |
| P9 | unknown | The Stop hook reads the transcript, an undocumented format. | 15 §3 | Fails open; diagnostic entry on failure. | Fixture test per Claude Code version in `compatibility.md`. |
| P10 | unmeasured | No number shows the symbol index helping any plugin task; grep tied on the two unique-name probes. | 10 §3 | `search.index: none` by default. | 33 §3. |
| P11 | bottleneck | `refs --exact` held 777 MB RSS on the 2,338-file repo. | 10 | Child process; `exactMaxFiles: 3000`. | Measure at 4,000 and 8,000 files. |
| P12 | bottleneck | codeindex grammars are 17 MiB wasm fetched at init; offline gets the regex tier. | 10 | Documented; regex tier precision unmeasured. | Run the §3 offline recall with and without grammars. |
| P13 | unmeasured | Python has no exact reference layer. | 10 | Said plainly in `refs` output. | A Python benchmark, if the team ever has one. |
| P14 | unknown | agentmap `--relates` returned 65 of 179 importers with no truncation flag. | 10 | Prefer codeindex; test every adapter against the language service. | Read agentmap's source or file an issue. |
| P15 | conflict | Staged rule delivery can deliver a rule after the act it governs. | 11 §2 | `code-style` goes with `before-work` when ≤ 8 rules apply. | Count late-rule findings in task reviews. |
| P16 | unknown | Built-in duplicate detection by edit distance, threshold tuned on 12 packs. | 11 §4 | Warning, not error. | More packs. |
| P17 | unknown | Whether `Stop` can carry `additionalContext` (guide says yes; not probed here; `PostCompact` cannot). | 15 | File fallback `stop-check.md`. | One probe. |
| P18 | unmeasured | Edits are unmeasured (1 Edit/Write in 7,709 tool calls); every edit-time ask rule ships off. | 15, 24 | Off by default. | 33 §5. |
| P19 | bottleneck | The eval's replay reviewer misses any snapshot the agent did not build before; review is unmeasurable. | 16, 25 | Re-key by changed-file hashes or pay a live tier. | 33 §0. |
| P20 | minor | `review --estimate` needs 5 prior reviews for cost history. | 16 | "no history" line. | — |
| P21 | unknown | Do plugin subagents inherit the session's MCP servers? The collector depends on it. | 17 | Fallback: main session fetches; hook strips search payloads. | One probe with a plugin `agents/` entry and a Jira tool. |
| P22 | unmeasured | Workers add cost; the scout is justified only by a plan-eval gain. | 17 | Proposed, never default. | 33 §4 three arms. |
| P23 | unmeasured | AC splitting precision on prose tickets. | 14 §4 | Signal for `plan check`, not a gate. | Label 30 tickets. |
| P24 | unknown | `claude plugin list` availability from the CLI in every environment (sandbox, Windows). | 20 | Degrades to "unknown". | Smoke test per platform. |
| P25 | conflict | Batched reading vs per-candidate confirmation evidence. | 22 | The Stop hook checks citations, not reading. | Accepted. |
| P26 | unmeasured | `plan check` anchor rule covers identifier-quoting anchors; prose range anchors get only the range check. | 23 | Documented in the plan's limitations. | Count anchor forms across the §4 runs. |
| P27 | conflict | Red/green for briefs with no failing-first test (config, docs). | 24 | `limit {no-red}` with a stated observation; visible in the report. | Human judgment over real reports. |
| P28 | bottleneck | Background index build may not be ready when a step needs it. | 24 | Fall back to grep and say so. | Measure how often on the task suite. |
| P29 | unmeasured | Python review dependents come from names only (no LSP, D1; no exact layer, P13). | 25 | Stated in the report's "not covered". | — |
| P30 | conflict | D1 says no LSP in review, yet the review's measured weakness is a caller the diff does not touch; the index substitutes with import-level precision, the exact layer with compiler precision but TypeScript only. | 25, 10 | `relates` + `refs --exact` on TypeScript; names elsewhere. | 33 §6 with planted caller breaks. |
| P31 | conflict | "No hidden state" vs `active-route` in session state (a convenience pointer). | 30 §2 | It duplicates the ledger's latest `route`; readers fall back to the scan. | Delete it if the scan is cheap enough (< 20 ms over 50 task dirs). |
| P32 | unmeasured | The context budget table (30 §3) is a design cap, not a measurement; the v0.4.0 column sums file sizes, not tokens in context. | 30 | Ceiling tests enforce the caps. | Peak-context per run from traces, both arms. |
| P33 | bottleneck | 24 CLI spawns per run at 89 ms each (~2.1 s) plus the index build hidden behind the first turn. | 30 §1 | Standalone bundles for the hot paths (guard, recorder). | 33 §7. |
| P34 | conflict | The user's instruction "no automatic tool selection" vs the route choosing layers (grep / index / exact) by rule inside `map`. | 10, 01 D2 | Read as: the model does not pick tools; code does, deterministically, and says which it used. The user can pin `search.index` and `--mode`. | Confirm the reading with the user. |
| P35 | unmeasured | The whole design's central claim (02 §5): overhead falls to +2 turns. | 02 | A prediction with a mechanism. | 33 §1 first, before anything else is built on it. |

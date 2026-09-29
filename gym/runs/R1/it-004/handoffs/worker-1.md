# worker handoff — it-004 — 2f4376e
Transcribed by the lead from the worker's final message (claude-sonnet-5-5). The worker wrote no files (read-only investigation). The lead independently re-derived the reviewer argv (`--output-format json` at `src/review/claude-reviewer.ts:266-267`; `stream-json` appears 0 times in non-test `src`), the archived turns and cost (14 / $1.107, 3 / $0.402, 2 / $0.326), and the recording keys (`case, model, output, recordedFrom, snapshotId`).

## Ran
- `node --test src/review/reviewer-boundary.test.ts src/review/replay-reviewer.test.ts` → exit 0; 25 / 25 pass
- `git diff --stat gym/R1/it-003 -- . ':!gym'` → empty
- `jq` over: the archived VS-6735 `result.json` `.reviewer` blocks; `fixtures/reviewer-envelopes/*.json`; `benchmarks/reviewer-recordings.json` (keys only); `evals/evals-core/results/traces/*.jsonl` (event types and counts only)
- `git log 6bde81c..gym/R1/it-001 -- src/review prompts policies src/config src/cli src/ports src/contracts hooks scripts` → empty
- log parsing of `it-001/scratch/record-*.log`, `it-003/scratch/*record-*.log`, `gym/planing/investigation/cache/record-{1,2}.log`

## Numbers
| field | value | from |
|---|---|---|
| reviewer output format | `--output-format json`, one document | `src/review/claude-reviewer.ts:266-267` |
| reviewer tools and permissions | `--tools Read,Grep,Glob`; `--disallowedTools Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent`; `--permission-prompts none --safe-mode --restricted`; no `--max-turns` | `claude-reviewer.ts:243-271` |
| stdout cap | 4 MiB, then `truncated` (fail) | `claude-reviewer.ts:186,301-310` |
| envelope fields read | `num_turns`, `duration_api_ms`, `usage.output_tokens`, `total_cost_usd`, `usage.output_tokens_details.thinking_tokens` (+ `type`, `subtype`, `is_error`, `result`, `structured_output`, `errors`) | `claude-reviewer.ts:154-161,412-425` |
| `ReviewerUsage` | strict, 5 fields; `thinkingTokens` has `.default(null)` | `src/contracts/review.ts:108-114` |
| precedent for an additive usage field | `thinkingTokens` in `f751954`, no schema bump | `git show f751954` |
| `REVIEW_SCHEMA_VERSION` | 1 (`z.literal`), never changed | `contracts/review.ts:6,141` |
| env allowlist | 26 names at lines 74-104 (the brief's ":88" was approximate) | `claude-reviewer.ts:74-104` |
| fixture envelopes | 6 JSON files, no `usage` object, no tool field | `fixtures/reviewer-envelopes/` |
| archived reviews (0.3.4) | turns 14 / 3 / 2; cost $1.107 / $0.402 / $0.326; status `ok`, model `sonnet`, timeout 900 s | `archive/…/reviews/*/result.json` |
| `.reviewer.tools` | the allowed list from argv, not the calls made | `src/cli/commands/review.ts:275-281` |
| recordings | keys `case, model, output, recordedFrom, snapshotId`; no usage, turns or cost | `benchmarks/reviewer-recordings.json` |
| replayed review status | already `partial`, with a replay gap | `review.ts:257-259` |
| recorder cost source | `review.reviewer.usage?.costUsd`, printed to stderr only | `evals-record-core.mjs:127,129,152-154` |
| recording cost, 0.3.3 vs 0.3.4 | mean ≈ $0.49 vs ≈ $0.10; same-snapshot pairs 0.33 / 0.35 → 0.09 / 0.07 (be-6261), 0.49 / 0.50 → 0.07 / 0.10 (fe-6253) | record logs |
| reviewer-code commits between the eras | none; the only non-gym commit is `509c0a5` (version bump, skills, eval scripts) | `git log`, `git show --stat 509c0a5` |
| agent traces: `num_turns − tool_use` | 1 in 167 runs, 2 in 183, never 0 or 3+ (agent runs on claude-opus-5-5, not the reviewer) | 350 traces |
| agent trace size | median 182,501 B, p90 337,212 B, max 562,052 B | `ls -l` |

## Findings
**Q1 (read):** the reviewer runs with `--output-format json`, and the code parses one final JSON document. The only per-call information it sees is `num_turns`. No tool-call count or list is read anywhere, and no fixture or archived result carries one. `.reviewer.tools` lists the allowed tools, not calls made.
**Q1 (inferred, unverified):** whether the json envelope also carries `modelUsage` or `permission_denials`. The agent stream traces' `result` event has them, but those come from agent runs. Also unverified: whether `stream-json` needs `--verbose`.
**Q1 (inferred):** the reviewer answers through one StructuredOutput tool call (`prompts/reviewer-role.md:73`), so a review that read nothing still makes 1 tool call, which means ≥ 2 turns if the agent-trace relation holds. The VS-6735 runs with 2 and 3 turns are consistent with reading little or nothing.

**Q2 options:**
| option | files | keeps | breaks or risks | tests |
|---|---|---|---|---|
| A. `stream-json` (+ `--verbose`, inferred) and count `tool_use` blocks by name | `claude-reviewer.ts` (argv, NDJSON parse, error path); additive `toolCalls` on `ReviewerUsage` (`.nullable().default(null)`); `review.ts`, `report.ts`; `docs/compatibility.md`; new stream fixtures; help stubs in 3 tests; `evals-reviewer.mjs:196-216` | strict schema (additive), schema version, env allowlist, tool flags, recordings (they store `output` only), T2 (replay has `usage: null`) | `--verbose` would show up in `isolation` unless filtered; stdout grows with every Read result, so the 4 MiB cap is more likely (unmeasured); the parse path changes; the stream shape is unverified in this repo | NDJSON fixtures (answer only; Read×3 + answer; error); truncated and unparsable streams; argv and help refusal; allowlist pinned; legacy result parses; replay stays `partial` with only the replay reason |
| B. keep `json` and infer from `num_turns` (`turns ≤ 2` ⇒ at most one tool call, the answer) | `src/cli/commands/review.ts`, `src/review/report.ts`, tests | every contract; no new field | an upper bound only; cannot name tools; for turns ≥ 3 cannot tell 0 reads from 1; null turns must read as "unknown"; the turns relation is unverified for the reviewer | boundary fixtures with turns 2 and 3; `TimedReviewer` turns 2 / 3 / null; replay does not flag; turns ≥ threshold stays `complete` |
| C. the reviewer self-reports `filesRead`, checked against the snapshot | strict `REVIEWER_JSON_SCHEMA` and `ReviewerOutput`, `prompts/reviewer-role.md`, `validate.ts` | env, timeout, argv, `ReviewerUsage` | the self-report is untrusted and checking it proves only that the file exists; the prompt and schema change, so every T3 recording must be redone; old recordings read as "read none" unless the field is `.optional()` | schema, validator and replay tests |
| D. a recorder sidecar with per-case `usage` (gitignored) | `evals/scripts/src/evals-record-core.mjs` and its test | every product contract; the recordings format | answers the cost-drop measurement only; flags nothing | the sidecar holds `costUsd` and `turns` |
Hooks are not viable: the reviewer runs with `--safe-mode`, which loads no hooks (`claude-reviewer.ts:247`).

**Q3 cost drop:**
- **Read:** recordings store no usage, and the recorder logs cost to stderr only. No reviewer code or defaults changed between the eras. The snapshot ids are identical, so the drop does not come from `--exclude`. The 0.3.3 recordings (16:52–17:07Z) predate the recorder's commit (`509c0a5`, 18:29Z), so they ran from uncommitted working-tree state that cannot be reconstructed. Within 0.3.4, cost tracks turns on VS-6735 (3 points).
- **Inferred:** the per-case wall seconds are grouped because `spawnSync` blocks the `-j 4` workers, so per-case durations cannot be compared across eras.
- **Candidate causes, none confirmable from files:** fewer reads or turns; prompt-cache state; the CLI version or what the `sonnet` alias resolves to; the uncommitted 0.3.3 state.

**Q4 recommendation for WP3 item 2:** no option records tool names while provably keeping every contract without a paid capture.
1. Implement B first as an inferred upper bound, worded "at most one tool call, the answer itself", not "read no file". `turns == null` reads as unknown.
2. Add D alongside, so per-case usage stops being lost.
3. Do A only after one real, budgeted `stream-json` reviewer capture ($0.10–0.40) gives a fixture.

Minimal files for B: `src/cli/commands/review.ts`, `src/review/report.ts`, `src/review/review.test.ts`, `src/review/replay-reviewer.test.ts`, `src/review/reviewer-boundary.test.ts`.

## Could not do
- Capture a real reviewer `stream-json` output (needs a `claude` call; forbidden for the worker).
- Recover the 0.3.3 recordings' turns and usage (overwritten, never stored).
- Verify the turns-to-tool relation for the reviewer; measure a 16-Read stdout against 4 MiB.

## Claims without evidence
- (none; unverified CLI behaviour is marked "inferred" in Findings)

## Corrections after the verifier (lead, 2026-09-29; the text above is unchanged)
- Recorder cost: read at `evals-record-core.mjs:112`, printed to stderr at `:145` (the cited `127,129,152-154` are wrong; 152-154 write the recordings file).
- Env allowlist: 25 names at `claude-reviewer.ts:74-104` (not 26). `--safe-mode` is line 248; the comment at 247 says it loads no hooks.
- "509c0a5 is the only non-gym commit between the eras" is false as written: `3b01dc0` (`.gitignore`), `1935b4d` (`CLAUDE.md`) and `bfadeef` (`src/hook/run-hook.test.ts`) also touch non-gym paths. None is in a reviewer path; the empty `git log` over `src/review prompts policies src/config src/cli src/ports src/contracts hooks scripts` stands.

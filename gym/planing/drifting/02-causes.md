# What drifts, when, and why

Evidence: the 24 attempt timelines in `eval-replay/evals/analysis/drift-2026-10-09/attempts/`
(seven notation cases × 3 plus `17/be-vs-6140`), the engine source as of commit 7386278, and the
bare run 30_2248. Counts are over those 24 attempts unless stated.

## Per metric

| Metric | When it drifts | Mechanism | Evidence | Layer that can fix it |
|---|---|---|---|---|
| First context tokens | never | identical prompt, contract, step, map | 19/19 cases in band | — |
| Tool calls, model requests, turns | from tool 1 | **Tool choice.** `read` vs raw `cat`/`sed`/`grep` vs native Read/Grep/Glob. Each choice has its own failure modes and byte volume | 11/24 attempts have zero `read` receipts (5721 ×3, 5075 ×3, 4606 ×3, 5973 R1/R2, 5941 R3, 6406 R1/R2) | guard + hook (D5) |
| | tool 1–3 | **zsh glob.** `grep … --include=*.ts` aborts with `no matches found`; the `;`-chain continues, so the call "succeeds" with nothing, and the model retries | **21/24** attempts; 5973 R2 four times; the "failed tool calls" metric shows 0 | guard rewrite (D2), ruler (D0) |
| | tool 1–4 | **Wrong cwd.** `Grep path:"src"` from `/home/cwd`; `cd repo` when already inside; `ls src/…` before any `cd` | 6140 R1 T2, 17-R2 T3, 5075 R3 T2 | guard `--task` injection, header root line (D1) |
| | any | **Malformed `read` operands.** `path:130:260` → "not found" → the same call again with `-` | 17-R2 (1 operand), 17-R3 (3 operands) | `parseReadOperand` (D1) |
| | after a big read | **Host output cap.** Unbounded grep/cat > ~30 KB is persisted by Claude Code; the model sees a 2 KB preview and re-reads | 6140 R2 T4 (46.8 KB), 5075 R3 T6 (31.9 KB) | reading through `read` (D5), which caps at 24 KB |
| | after a batch read | **Budget cut.** 11 whole files in one `read` hit 24,000 B; continuation spans are re-read; one continuation was sent to `/dev/null` and then repeated | 5973 R3 T3 (5 truncated), 5941 R1 T2–T5 | `read` outline + dedupe (D4), lead spans (D3) |
| | mid-run | **Hypothesis branches and analogue choice.** One run follows verify-access-token, another the lm-lift analogue | 5721 R2, 4606 R2 | partly D3 (leads with spans), otherwise model judgment |
| | accounting | harness turns = API requests + one per extra tool in a parallel wave | 6140 R2: 7 + 2 = 9 | report only |
| Agent cost, peak context | after the first read | **Byte volume.** Whole files vs spans; the same span served twice; unbounded grep output in context | 5973: 27,292 B (R1) vs 74,830 B (R3), peak 34k vs 57k; 5941 R3 66,455 B of whole-file Reads; 6140 R2 +23 KB re-grep | D4, D5 |
| Wall, API seconds | always | follows requests and bytes; the rest is API latency | 0/19 in band | not controllable; report only |
| Precision | at answer time | **Evidence promoted to change.** Files read to understand the code are listed under `## Files` | ReportHelper.ts/.spec in 5/6 plugin runs of 6140, 0/3 bare; 5973 3/3; 5075 extras are all evidence files | Stop check (D6) |
| | at answer time | **Unread assumptions listed.** "I did not read it", "would be a new file" | 6140 R3 backup.service, R2 niosh.service.spec; 5941 R3 OrginizationApi.spec; 4606 3/3 push-pull-backup spec | D6 (served-or-creation rule) |
| | at answer time | **Hedged entries.** "only if…", "possibly needed" vary run to run | 6140 R2, 17-R1; 6406 R3 scss | D6 (undecided list) |
| | scorer | "Files that need no change" counted as changes | 6140 R3 .43 → .75; fixed in Phase A (`changeLines`) | done |
| Recall | at answer time | **Seen, then reasoned out of scope.** Same evidence, different scope line | est-niosh 3/3 in 5973; location-select 2/3 in 6406; PermissionHelper read and cited but not listed in 5721 R1; ReportController cited and omitted in 4606 R2 | D6 (per-lead decision), the rest is judgment |
| | during exploration | **Never seen.** The family was never opened | 58% of missing truth cohort-wide; lm-lift/lm-lower specs in 5973; ConfirmationDialog/readonly-input in 6406; OrganizationValidators.spec in 5941 | D3 narrows the start; discovery itself is stage 3a, out of scope here |

## The free choices the model makes today, in one `read` step

1. Which tool reads source (`read`, Bash `cat|sed|head`, native Read/Grep/Glob).
2. The working directory and path prefix for every call.
3. Which leads to open, whole file or span, and the span grammar.
4. How much to read in one call, and whether to re-read after a cut or a host cap.
5. Whether a file read for evidence is a change, an assumption, or left out.
6. Whether a lead it did not open is mentioned at all.

Each is a point where code can decide once and the same way on every run. 1–4 are exploration
(resource metrics); 5–6 are selection (quality metrics).

## Why the plugin drifts where the bare model does not (6140, 6406)

The bare model lists exactly the files it would edit. The plugin step adds a map with eight leads
("leads, not answers: open those that fit"), a "same feature" list and the files-question rule
("each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests) + any
file its requirements may need, naming that assumption"). The runs that read a lead or a consumer
(ReportHelper, est-niosh, location-select) then have to decide what to do with it, and the decision
is not the same twice. The engine today neither records that decision nor asks for it. This is a
plugin-made degree of freedom and the plugin can close it (D6) without truth and without new prose.

## Not controllable by the plugin

- API latency and wall time beyond request count and bytes.
- Parallel-wave turn accounting in the harness.
- The model's judgment on a genuinely ambiguous scope once the evidence and the decision point are
  identical; D6 makes the decision explicit and recorded, it cannot make it right.

## Seams in `src/` (as of 7386278; working tree clean)

| Seam | Where | Today |
|---|---|---|
| `read` operand grammar | `src/modules/search/text/read-many.ts:30–36` | `^(.+?):(\d+)(?:-(\d+))?$` only |
| `read` path resolution | `read-many.ts:41–63` | cwd → repo root → unique tracked suffix; an extra prefix fails |
| `read` budget | `read-many.ts:11–12` | 24,000 B per call, max 28,000; no per-route sum, no outline, no dedupe |
| `read` receipt | `src/cli/commands/search/search.ts:118` | `search{command:'read', names, hits, bytes, truncated}` |
| map leads rendering | `src/modules/search/text/map.ts:476–503` | `path:line — reason`, 8 leads, 1,200 B cap, no spans; spans exist in the JSON map (`spansPerCandidate = 3`) |
| step run notes | `src/harness/engine/engine.ts:286` | the `Mode:` line; engine-level fixed lines go here |
| guard task injection | `src/hook/guard/guard-core.ts:346` | `TASK_COMMANDS` = route/report/note; `read|map|refs|find|relates` missing |
| guard visibility | `hooks/hooks.json` `if` list | `git *`, `glab mr*`, `*.ambicode/task*`, `*ambicode.mjs*`, `rm *`; no Read tool, no `cat|sed|grep` |
| guard bundle | `src/architecture.test.ts:28` | 70 KiB cap, 642 B headroom |
| Stop check | `src/harness/engine/stop.ts:128–149` | `citationsOnly`: cited `path:line` exists; block once (`limit{stop-block}`) |
| per-step tool accounting | `src/platform/claude/transcript.ts:91–143` | `turn{tools, commands, context}` only at Stop |
| dead knob | `guard.askOutsideMap` in `src/types/modules/config.ts` | read by no code |
| policy slot | `before-work`/`before-report` for investigate | both null; 4,096 / 1,536 B available |

# 00 — Audit of the investigation notes

Audited on 2026-09-28 against branch `tuning`, HEAD `3e5e146`, working tree clean apart
from the staged `gym/planing` changes (`git status --short`). Notes audited:
`gym/planing/investigation/investigation_2026-09-28T20-45.md` (v1, 227 lines) and
`…T22-45.md` (v2, 625 lines; supersedes v1 and carries its items as O1–O17, N1–N36).
Method: every claim re-derived from the cited file, artifact or transcript by three
read-only checks (code in `src/`, eval and archive artifacts, VS-6735 cycle transcripts),
plus commands run in this session. Verdicts: **C** confirmed (with the citation that
proves it), **X** contradicted (with what contradicts it), **U** unverifiable (with the
command that would settle it). Only **C** rows feed the plan
([01-goals-and-metrics.md](01-goals-and-metrics.md)); X and U rows are in §6.

## 1. Baseline measurements taken during the audit

```
npm run typecheck           exit 0, 3.3 s
npm run test:unit           ℹ tests 751 / pass 750 / fail 0 / skipped 1 / 20.5 s   (skip: Windows shim F1, src/ports/process.test.ts)
npm run verify              exit 0, 29.7 s wall; "✔ Validation passed"; dist/ambicode-0.3.4.zip sha256 c8c5b7b3f57e8785fb26207e4beac2aea8f00eaaa3dc8ee61591f08c0efdec7f
```
`CLAUDE.md:115` says "751 tests" — **stale** (X); the notes' 750/751 is right (C).

## 2. Code claims

v2 §4.2 and §3, verified in `src/`.

| Item | Verdict | Evidence |
|---|---|---|
| O8 MR mode hard-codes `includeSiblingContext: false` | C | `src/review/bundle.ts:378-379` (also `:186`); plumbed `src/snapshot/remote-target.ts:24,46` → `src/contracts/provider.ts:213` → `src/providers/gitlab/provider.ts:243,658` |
| O8 local mode mirrors same-directory neighbours | C | `src/snapshot/snapshot.ts:230-268` (message `:273`); caps `MAX_CONTEXT_DIRECTORY_LISTS=25`, `MAX_CONTEXT_FILE_READS=100` (`:105-106`); `src/snapshot/target.ts:70` |
| O9 `configurationProvenance` unused for local reads | C | defined `remote-target.ts:144-176`; the only uses are text at `:69,70,113` |
| O10 one unverifiable location voids the review | C | `src/review/prompt.ts:384-387`; `prompts/reviewer-role.md:49-50`; enforced `src/review/validate.ts:7-8,90-96` |
| O10 "below medium confidence → do not report" | C (prose only) | `prompts/reviewer-role.md:62-65`; not enforced in code (`validate.ts:78` copies `confidence`) |
| O10/N30 single `claude --print`, no `--max-turns`, `usageOf` records 5 fields, no tool record | C | `src/review/claude-reviewer.ts:243-271` (argv), `:412-425`; `src/contracts/review.ts:108-114` strict object; `grep -rn max-turns src/` → none; `src/cli/commands/review.ts:93` `tools` = declared list |
| O11 `src/checks/adapters/` empty | C, misleading | directory has 0 files, but adapters live in `src/checks/adapters.ts` |
| O11 MR checks need a digest-pinned image | C | `src/checks/remote.ts:15-18,30-31,117-120` (v1's `:1-5` are imports) |
| N28 `related` selector runs from the working tree | C (vitest only) | `src/checks/adapters.ts:90`; jest (`:73`) records no such limitation; MR mode refuses `related` (`remote.ts:279-283`) |
| N29 null check → `partial` | C, by design | `src/cli/commands/review.ts:234-236,249,267-268`; `src/checks/run.ts:82-85,118,380` |
| N25/N26/O17 defaults 300 s/50/2,000/524,288; ceiling 262,144 not configurable | C | `src/config/defaults.ts:5-9,41`; `src/snapshot/snapshot.ts:56,66,82,87`; `src/cli/commands/config.ts:87`; `docs/review.md:385-389` |
| N4 `retrievedAt` only a non-empty string; printed as provenance | C | `src/contracts/requirements.ts:11`; `src/review/report.ts:88`; `src/review/prompt.ts:219` |
| N23 `ambicode review --help` → `bad-argument` | C (parser replayed) | `src/cli/main.ts:165-167`; `src/cli/target-option.ts:16`; `src/cli/args.ts:39,84-87` |
| N24 `--task` only picks a directory; review knows no iteration | C | `src/cli/target-option.ts:26`; `bundle.ts:202-212`; `grep -rni iteration src/review/` → none |
| O13 shortlist = substring matching over paths and `git grep` | C, incomplete | `src/code-intelligence/locate.ts:185,189-211,269`; also co-change `:290-363`, >60 % filter `:392-397` |
| N7 terms auto-derived by word frequency when no `--term` | C | `locate.ts:431` `termsFromRequirements`; `src/cli/commands/prepare.ts:312,330` |
| item 3(b) "raise `--limit`" on `prepare` | X | `prepare` has no `--limit` (`prepare.ts:40-44`); `PREPARE_SHORTLIST_LIMIT = 10` (`locate.ts:18`, `prepare.ts:320`); `--limit` belongs to `locate` (default 20, `locate.ts:15`) |
| N8 `prepare` accepts a missing path silently | C | `prepare.ts:73` → `src/composition/root.ts:174-187`; only notice is `paths-outside-project` (`src/policy/resolve.ts:52`) |
| O16 contract injected once per epoch, hash-cited | C | `src/hook/run-hook.ts:94-102,108`; hash truncated to 32 hex (`src/util/hash.ts:4`) |
| O16 "2.7 KB" | X | `prompts/shared-operating-contract.md` = 2,275 B (`wc -c`); injected text ≈ 2,573 B; no `builtin/` directory exists |
| O16 "cache-stable" | U | no code says it; injected text has no session-varying field; would need Claude Code cache-hit telemetry |
| §2.2 prompt section list | C, incomplete | `src/review/prompt.ts:59-68`: scope(134), guidance(152; smells via `policies/common-quality.yaml:185-187`), requirements(189), discussions(236, MR only), evidence(334: files 337, checks 348, omissions 366, change 369), output(373) |
| items 7/16: no `updatedAt` cache, no CLI stamping, no pre-flight size check in `prepare` | C (all absent) | `src/requirements/normalize.ts:16-17`; `prepare.ts:446-454` caps pack prompts only (`prompt-too-large`) |

## 3. Eval and archive artifact claims

v2 §4.1 and §5, verified in `gym/planing/investigation/cache/` (below: `cache/`), `evals/`, `archive/`, `benchmarks/`.

| Item | Verdict | Evidence |
|---|---|---|
| O1 two sweeps, 18 cases, 1 run/arm: localize F1 0.64/0.65 then 0.69/0.63; review recall 0.09/0.25 then 0.09/0.16 | C | `cache/perrun-1330.txt`, `cache/perrun-sweep1.txt`; recomputed: 13-30 with 0.637 / without 0.654; 16-18 0.694 / 0.630; review 0.094/0.250 and 0.094/0.156 (`npm run evals:score`) |
| O1 be-vs-5928 without-arm 1.00 → 0.50 | C | `perrun-1330.txt:22`, `perrun-sweep1.txt:21` |
| O2 `helper-ran` 0/8 in both sweeps; 15/16 refusals cite "you asked me not to edit" | C | grader `tool_used Bash` matching `ambicode(\.mjs")? review`; 16-18 fe-vs-6292 never fired the skill (`cache/timeline-sweep1-all.txt:471`) |
| O3 sandbox reviewer "Not logged in" | C (not where cited) | absent from `cache/*.txt|log|json`; primary evidence `evals/evals-core/results/traces/e-ohRUIC.jsonl:12`; `evals-bench.mjs:607` |
| O3 recordings 5/8 | C | `benchmarks/reviewer-recordings.json` has 5 entries; `cache/record-2.log:9` "wrote 5 … refused 3" |
| v1 "3 FE cases recorded with `--exclude 'main/assets/i18n/**'`" | X | no entry carries `--exclude` in `recordedFrom` (`evals-record-core.mjs:107`); claim exists only in `cache/notes-eval-analysis.md:186` |
| O4 LSP 0 uses in sandbox; tools list | C | 0 LSP `tool_use` in 128 traces; 71/71 sweep traces list `Task,Bash,Glob,Grep,Read,Skill,TaskStop,ToolSearch` (20 older traces differ) |
| O5 MR !2696: 3 and 4 findings; $1.52/369 s, $1.83/438 s | C | `archive/logs/3.1/MR_2696_VS-5813_2026-09-28T19-13/result.json`, `archive/logs/3.4/MR_2696_VS-5812_2026-09-28T19-51/result.json` (`.findings|length`, `.reviewer.usage.costUsd`, `.reviewer.durationMs`) |
| O5 prompt 287 KB / 238 KB diff / 10.6 KB policy / 16 KB file list | C | `inputs.promptBytes` 287,031 (user prompt 280,988 + system 6,043); diff 238,224 B; policy 10,617 B; changed files 16,520 B |
| O5 "both runs cite zero `ruleRefs`" | X | 3.1 `result.json:1993-1995` `angular-state/subscription-lifetime`; 3.4 `:1835-1837` `common-quality/need`, `:1857-1859` |
| O6 19 human threads: 10/4/3/2 | C | `cache/notes-eval-analysis.md:130-146`; `benchmarks/{BE,FE}/reviews/**/threads.json` sum to 19; split re-derived |
| O7 recorded reviewer hits 1 of 8 human threads | U | not in `cache/notes-*.md` or `benchmarks/reviews-summary.json`; current recordings: 1 clear (be-vs-6261 `cycleTimeSec`) + 1 arguable |
| O12 12 packs, all `inherited`, 3–15 reviewer rules | X in letter | `policies/common-checks.yaml:3` is `authority: team` with `rules: []`; reviewer-judged rules per pack 2–13, 5 rules are `kind: command` |
| O12 no `team` pack with rules in benchmark or prod config | C | `benchmarks/{BE,FE}/.ambicode/config.yaml` builtin packs only, `policyFiles: []`, every command and check null |
| O14 skill body sizes 7,003/9,808/10,565/9,285/9,921 B; no worked example | C | `wc -c skills/*/SKILL.md` (init 4,199); `grep -i example` hits only URLs, pointers, templates |
| O14 `allowed-tools` keep Read/Grep/Glob unrestricted | C | `skills/{init:5,investigate:4,plan:5,review:4,rules:6,task:5}/SKILL.md` |
| N13 task skill "one plan iteration per run" at `:97`, `:145` | X in part | `skills/task/SKILL.md:96-97` is the one-iteration scope rule; `:144-146` limits pipeline runs per iteration, not plan scope |
| O15 `requirements-mcp.md` never mentions parents | C | `grep -ni "parent\|epic" skills/` → none |
| item 12 `audit-mrs.mjs` collects threads | C | `benchmarks/audit-mrs.mjs:1-6,23,82`; per-version `threads.json` from `prepare-reviews.mjs:1-12` |
| item 6 trigger map 24/24; always-on −54 % | C | `.ambicode/task/ambicode-refactor/notes.md:30,52-58`; sweeps 10-01/10-13/11-06 consistent 24/24; descriptions 3,070 → 1,391 B (−54.7 %) |
| item 1 I5/I6 "wording moved nothing" (9/36 → 9/36); I8 `locate` 0/18 | C, nuance | `notes.md:130-138` (I5 was an output reshape with one measured effect), `:189-191`, `:249-256`; the 0/18 script is not in the repo |
| item 9 plumbing: `evals:record`, replay env, per-run scoring | C | `package.json:21-24`; `src/review/replay-reviewer.ts:13`; `src/cli/commands/review.ts:60`; `evals-bench.mjs:526-555,603-615` |
| any existing grader for fabricated provenance, reviewer tool use, iteration scope, recall@10, questions/session | none | grep over `evals/`, `fixtures/` → 0 hits; closest: `p2-investigate-boundary-shortlist/graders/shortlist-requested.md` |

## 4. VS-6735 cycle claims

v2 §2 and §3, recomputed from the JSONL transcripts.

Scripts S1–S12 that reproduce every number are in the verifier's report; the lead
re-creates them as `gym/runs/<campaign>/tools/transcript-metrics.py` in iteration 0
([02 §2](02-loop-protocol.md)). Transcripts: 3 in `cache/VS-6735/`, 2 in
`~/.claude/projects/-Users-KillBill-Documents-projects-inseer-inseer-frontend/`.

| Item | Verdict | Evidence |
|---|---|---|
| §2.1 rows/tool calls/tokens/spans per session | C exact, **caveat** | 73/35, 68/36, 180/84, 173/88 and all token sums match; but each API response is split into several rows repeating `usage`, so "assistant messages" = rows (32/28/78/77 responses) and token totals are 2.1–2.9× the deduplicated values (output 30,577 / 42,300 / 125,268 / 103,979) |
| §2.1 tool mix Bash 163, Write 34, MCP 18 (getJiraIssue 15), Ask 8, Read 7, Edit 6, ToolSearch 6, LSP 1, Grep/Glob/Agent/Skill 0 | C | counts by `tool_use.name` |
| N14 human-wait 8 / 539 (3,135,12,3,383) / 4 / 35 s; 1/5/1/1 questions | C | `AskUserQuestion` → `tool_result` by id; 35 s is 35.99 floored |
| §2.1 4 permission denials (`xargs wc -l` ×2, `node -e`, `python3 -c`) | C | one "has been denied" per transcript |
| N2 15 `getJiraIssue` calls for 4 keys (4+4+3+4) | C | it1–3 never fetched VS-6738 |
| N4 `retrievedAt` fabricated in 4/4 sessions | C | 12:00Z / 21:05Z / 21:20Z / 22:00Z vs fetches 18:45:56 / 18:52:52 / 19:12:00 / 19:56:20Z; values post-date `result.json.createdAt` |
| N5 `mcpServer` label "atlassian" ×3 sessions, "plugin:atlassian:atlassian" ×1 | C | Bash inputs; every answer to the question was "plugin:atlassian" |
| N9 Read with offset/limit 0 of 7; `cat -n` 30; `sed -n` 66 | C / minor X | 0/7 exact; raw counts are 33 and 68 (22 and 47 calls); 30/66 only under narrower rules |
| N11 one LSP call, returned only the declaration | C | 18:49:04Z `findReferences` `advanced-table-view.model.ts:14` → "Found 1 reference: …:14:3" = `isDefault: boolean;` |
| N17 task sessions ran 0 vitest/eslint/tsc | **X** | it4–6 20:06:49Z `npx tsc -p tsconfig.json --noEmit` (clean); vitest 0, eslint 0, prettier ×4 |
| N18 plan's `tsc -p tsconfig.spec.json` gate: 133 errors / 52 spec files, 0 in touched files | U (not re-run) | settle with `cd <FE> && git stash list && npx tsc -p tsconfig.spec.json --noEmit 2>&1 \| grep -c "error TS"` |
| N19 lint failure is one pre-existing `no-unexpected-multiline` | U (not re-run) | settle with `npx eslint main/shared/modules/advanced-table/components/advanced-table/advanced-table.component.spec.ts` at base and HEAD |
| §2.2 reviews table (files/lines/bytes/turns/cost/findings/checks, all `partial`) | C | `cache/VS-6735/reviews/*/result.json`: 34/3,139/169,516/342,503/210,718, 14 turns/$1.107; 34/3,145, 3/$0.402; 36/2,998/146,390/220,947/193,233, 2/$0.326; neighbours 19/19/14 from `omissions` text |
| §2.2 system prompt 6,043 B, md5 `8783711355…` identical ×3; policy dump 10,611 | C (chars) | `wc -c`, `md5`; section spans in chars: policy 10,611, changed files 7,025–7,621, change 146,418–169,823 |
| N31 4 of 6 findings concern later plan iterations | C (judgement) | ids f-676e…, f-4142…, f-065d…, f-299c… vs `cache/VS-6735/plan_2026-09-28T21-06.md:144,178-179,195,205,213-214,240`; f-a1246… borderline (`:164`) |
| N33 `ruleRefs` 4/6, `requirementRefs` 6/6 | C | `jq` over both `result.json` |
| N32 1 of 5 topics repeated; high/high storage finding vanished with code unchanged | C | snapshot diff `ambicode-snapshot-Fc3xud` vs `FvNeOp`: 3 files differ, none contains the guard |
| N27–N29 lint+unit ran ×3; e2e null; status `partial` ×3 | C | `result.json.checks[]`; FE `config.yaml:52,68`; `report.txt:2` |
| N28 `related` selected two unrelated score-type specs ×3 | C | `checks[unit].selected` + limitation at `result.json:548/:532` |
| N25/N1 FE config: mcpServer null; 900/150/20,000/2,524,288; 7 packs, no team; sonnet | C | FE `.ambicode/config.yaml:14-39` |
| §2.1 59 files +4,451/−1,552; commits 35 and 37 files | C | `git diff --shortstat 2576456cc 873ec3923` |
| N21/N26 two `snapshot-too-large` refusals (365,565 B, 366,890 B), recovered with `--exclude` | C | tool results 19:29:29Z, 20:12:38Z; relaunches 19:30:10Z, 20:13:18Z |
| N7 shortlist precision/recall 10/10, 9/10, 9/10, 2/10, 1/10 | C / **X last row** | it4–6 auto-derived is 2/10 vs the 59-file truth (1/10 only vs commit 873ec3923); calls 4 and 5 returned identical top-10 lists |
| N8 `prepare` accepted a never-existing path | C | 19:58:01Z; path echoed in `paths` only; `git log --all -- <path>` empty |
| N13 user args overrode one-iteration scope | C | "VS-6735 \nit1 - it3 review in the end", "…it4 - it6…" |
| N1 MCP-server question in 3/4 sessions; it4–6 grepped instead | C, nuance | the it4–6 `ToolSearch` choosing the server was in the same response as the grep, so the grep did not inform the choice |
| §2.1 init 23 s/2 Bash; MR session 36 m 40 s, `sed` raised limits after `input-too-large` 92/5,535 vs 50/2,000 | C | `d081f958`, `9a235fc3` transcripts; today's limits (150/20,000/2,524,288) were set outside these sessions |

## 5. Ranking items: what survives

| v2 item | Grounded in C rows? | Carried into the plan as |
|---|---|---|
| 17 harness parity | yes (O4, N35 minus tokens caveat; sandbox model = `claude-opus-5-5` from traces) | WP0 in [01 §4](01-goals-and-metrics.md#4-work-packages) |
| 9 evals as steering wheel; 3 runs; recordings 8/8 | yes (O1–O3, O7 U) | WP1 |
| 7 + 16 requirements pinning, CLI-stamped envelope, cached sources, pre-flight size check | yes (N1–N5, N21, N26, C17) | WP2 |
| 13 reviewer tool record + effort floor | yes (N30, N34) | WP3 |
| 14 iteration-scope-aware review | yes (N24, N31) | WP4 |
| 5 checks: `related` from working tree | yes (N28) | WP5 — the "partial permanent when null" half is **not** a defect (CLAUDE.md "A skipped step still downgrades the status"); open question Q6 |
| 3(a)/(b) shortlist fallback notice, limit | (a) yes (N7); (b) needs a new option (X row) | WP6 |
| 12 team packs from review history | partly (O6, O12; usefulness unmeasured) | WP7, gated on human labels |
| 8 prompt economy "drop uncited rules" | premise X (rules are cited in prod and locally) | dropped; cost measured only as a side metric |
| 1, 2 prose/LSP work | retired by the notes; N11 confirms LSP returned a wrong answer | not a WP; cheap probe in Q7 |
| 10 neighbours in MR mode | demoted by N34 | not in cycle 1 |
| 15 task-agent self-verification | premise weakened (N17 X: one `tsc` ran) | folded into WP2's baseline probe only if Q5 is resolved |

## 6. Open questions

Every X and U row above, with the step that resolves it.

| # | Question | Resolution step | Owner |
|---|---|---|---|
| Q1 | `CLAUDE.md:115` says 751 tests; the suite has 751 | Outside `gym/plan` scope; report to the owner, do not edit | human: Numbers are updated |
| Q2 | Did any recording ever use `--exclude`? (v1 claims yes) | `jq -r '.[].recordedFrom' benchmarks/reviewer-recordings.json`; WP1 re-records the 3 FE cases with `--exclude 'main/assets/i18n/**'` | lead, iteration 1; Human: remote review asks me to exclude tests and i18n and limit exceed (or raise it. I always choose to raise for PRs < 10k changes) |
| Q3 | Recorded reviewer's human-thread recall (v1: 1/8) | Score the 5 recordings against `threads.json` by hand, record in `labels/labels.json` | human + verifier |
| Q4 | Is `ruleRefs` citation load-bearing? (prod 1–2 per run, local 4/6) | Ablate: replay one recorded case with the rule text removed but ids kept; compare findings | WP3 side experiment, human: Didn't test it yet, I put all rules I think helpful inside the plugin |
| Q5 | N18/N19: FE baseline `tsc`/eslint state | Run the two commands in §4 in the FE repo, read-only | human (FE repo is off-limits to agents, [08 §4](08-safety-and-rollback.md)) |
| Q6 | Should `partial` be reported when only a null-configured check is missing? | Product decision; default in this plan: **no change** | human |
| Q7 | Does LSP index the FE project in a fresh session? | One `findReferences` on `advanced-table-view.model.ts:14` in a fresh FE session; count references | human |
| Q8 | Token cost per real session (Opus 5.5 pricing) | Not derivable from the repo; TBD: pricing source | human |
| Q9 | "cache-stable" hook contract | No repo evidence; drop the claim | — |
| Q10 | Which model and effort ran the real sessions vs the sandbox | traces say `claude-opus-5-5`; effort not recorded anywhere; TBD: pass `--model` explicitly (WP0) | lead |

## Assumptions

Statements in this plan that no repo evidence supports; each is labelled ASSUMPTION where used.

- A1 The owner's account budget for model calls is unknown. `01 §5` uses the measured per-command costs and leaves the ceiling as TBD.
- A2 A change accepted on the curated sweep generalises beyond the 18 curated cases (5 localize + 4 review per side). Untested.
- A3 The two same-version sweeps (0.3.2, 11-55 and 13-30) ran identical plugin code; the result JSON records only the version string.
- A4 Human labels for the 6 local findings and the 0-finding review (v2 §8) will be provided; until then usefulness is not measured.
- A5 The eval sandbox model stays `claude-opus-5-5` unless pinned; a model rollout during the campaign would move every arm (detected by the without-arm control, [05 §3](05-anti-hallucination.md)).
- A6 macOS keeps `/var/folders/.../T/ambicode-snapshot-*` until reboot or purge; the archive step in [06 §5](06-data-and-state.md) must run first.

# verifier handoff — it-000 — 2c63668c658b79868621316cbeba3fa0fd804cce

Working tree at the time: `M gym/runs/R1/OWNER-INBOX.md`, untracked `CAMPAIGN.md`, `labels/`, `tools/` (as in the task's gitStatus). Nothing under `src/`, `prompts/`, `policies/` modified.
Wall times were not measured for read-only commands (all sub-second except the manifest check); listed as "<1 s" where obvious.

## Ran
- `grep -nE "Tests |Test Files|exit=|Validation passed|Archive sha256|^> " gym/runs/R1/baseline/verify.log` (ANSI stripped) → exit 0, <1 s; output inline only
- `grep -nE "^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration)" verify.log` → exit 0, <1 s; lines 1033–1040
- `grep -c "Validation passed" verify.log` → exit 0 (count 1); `grep -o <sha> verify.log | wc -l` → 1
- `tail -25 verify.log; cat scratch/g2.log` → exit 0
- python3 heredoc (unsaved) over both `aggregate-result.json` (per-case with-arm scores, url-bare graders, costUsd, durationSeconds, partial) → exit 0
- `shasum -a 256` of `evals/evals-triggers/results/2026-09-29T01-38-53-501Z/aggregate-result.json` and the copy `gym/runs/R1/baseline/scratch/triggers/2026-09-29T01-38-53-501Z/aggregate-result.json` → exit 0 (identical)
- `shasum -a 256` + `cmp benchmarks/reviewer-recordings.json gym/runs/R1/archive/benchmarks__reviewer-recordings.json` → cmp exit 0
- `git diff --stat 6bde81c HEAD -- prompts policies src/review` → exit 0, empty output
- `git rev-parse HEAD:prompts HEAD:policies` → exit 0
- `git show 6bde81c:package.json | grep '"version"'` → exit 0 (`0.3.3`)
- python3 heredoc over `benchmarks/reviewer-recordings.json` (recordings, per-case findings) → exit 0
- `ls evals/evals-core/cases` (count of `*-review-*` dirs) → exit 0
- `(cd gym/runs/R1 && sha256sum -c archive/MANIFEST.txt)` → exit 0; output redirected to a temp file under /tmp (see Could not do / deviations), counted with grep, then deleted
- python3 heredoc (unsaved), own T4 derivation over `archive/8efdbd08-d9f5-45e9-b69e-98333a4275eb.jsonl` (three iterations of the script, all read-only) → exit 0
- python3 heredoc over `archive/gym__planing__investigation__cache__VS-6735/reviews/*/result.json` → exit 0
- `find gym -name '*.jsonl' -not -path 'gym/runs/R1/archive/*'`; `find gym/runs/R1/archive -name '*.jsonl'`; `find gym/planing/investigation/cache -name '*.jsonl'`; `git ls-files | grep -c '\.jsonl$'`; `git check-ignore -v gym/planing/investigation/cache/VS-6735/x.jsonl` → find/ls/git commands exit 0; the chained command returned exit 1 only because of a trailing invalid `head -0` of mine, after all useful output
- `grep -rEn 'sk-ant-|OAUTH_TOKEN=|API_KEY=' gym/runs/R1 --exclude-dir=archive --exclude-dir=supervisor --exclude-dir=scratch` → exit 1 (no match), <1 s
- Only after all of the above: read `gym/runs/R1/baseline/scratch/t4.json` (did not run `tools/transcript-metrics.py`)

## Numbers
| field | value | from (path:line or command) |
|---|---|---|
| G1 tests / pass / fail / cancelled / skipped | 752 / 751 / 0 / 0 / 1 (suites 121, duration 20,984.56 ms) | `baseline/verify.log:1033-1040` |
| G1 final exit line | `exit=0 seconds=26` | `verify.log:1068` |
| G1 "Validation passed" | 1 occurrence, `verify.log:1067` | grep -c |
| G1 zip sha256 | `c8c5b7b3f57e8785fb26207e4beac2aea8f00eaaa3dc8ee61591f08c0efdec7f` | `verify.log:1064` ("Archive sha256:") |
| G2 identical-digest line | "Reproducible: 50 files, identical paths/sizes/sha256 digests, and identical zip sha256 (c8c5b7b3…efdec7f) across two independent runs." Same sha as G1 zip | `baseline/scratch/g2.log` (last line) |
| T1 file identity | new-run file and scratch copy: sha256 `1993bb9f2bdb9f3b75a643663a6985cc7b107ef3be87a9cf51790f2b008822e4` both | shasum |
| T1 run | claude 2.1.284, plugin ambicode 0.3.4, startedAt 2026-09-29T01:38:53.501Z, costUsd 4.2106728, durationSeconds 209, partial false, casesTotal 8, casesPassed 7, overallScore 0.925, overallPassRate 0.875 | `results/2026-09-29T01-38-53-501Z/aggregate-result.json` |
| T1 per-case with-arm scores (3 runs each) | unrelated-question 1/1/1; url-implement 1/1/1; url-plan 1/1/1; url-question 1/1/1; url-review 1/1/1; verb-implement 1/1/1; verb-review 1/1/1 (7 cases mean 1.0); url-bare 0.4/0.4/0.4 (mean 0.4, passRate 0) | same, python `arms.with[].score`; only arm present is `with`, no run has `error` |
| T1 url-bare graders | per run: any-skill-fired pass, fired-investigate pass, fired-plan fail, fired-review fail, fired-task fail. fired-investigate passed 3 of 3 runs | same, `cases[url-bare].arms.with[].graders` |
| T1 pre-campaign baseline | claude 2.1.283, plugin 0.3.2, costUsd 3.9184648, 185 s, partial false, 7/8 cases passed, overallScore 0.925; per-case scores identical to the new run (7 x 1.0, url-bare 0.4 with fired-investigate 3/3) | `results/2026-09-28T11-06-31-644Z/aggregate-result.json` |
| T1 delta vs pre-campaign | scores unchanged; cost +$0.2922 (+7.5%); duration +24 s (+13%) | arithmetic on the two files; single sample each, model/CLI version differs (2.1.283 vs 2.1.284), so cost and duration deltas are not attributable |
| T3 recordings | 5 in `recordings[]`; findings: be-vs-3571-review-1128-957b6388 4; be-vs-5075-review-1054-3b24bb74 4; be-vs-5546-review-996-d520e3ca 6; be-vs-6261-review-1141-f14493f1 1; fe-vs-6253-review-2557-1b0a7eaf 6; all model sonnet, recordedFrom "evals-record-core 2026-09-28T16:52-17:07Z plugin 0.3.3" | `benchmarks/reviewer-recordings.json` |
| T3 curated review cases | 8 directories matching `*-review-*` in `evals/evals-core/cases/` (be-3571, be-5075, be-5546, be-6261, fe-6086 x2, fe-6253, fe-6292); 5 of 8 recorded | ls |
| T3 file identity | sha256 `c6022188b670773cc15e27d254270e87ed3ec3fa5ae4ef8932b9442a0ac666af` for both the live file and `archive/benchmarks__reviewer-recordings.json`; cmp exit 0 | shasum/cmp |
| T3 prompt/policy/review drift since recordings | `git diff --stat 6bde81c HEAD -- prompts policies src/review` empty; 6bde81c's package.json version is 0.3.3 | git |
| tree hashes | `HEAD:prompts` = 9ee78f71f6448b530073d524613827acb814615a; `HEAD:policies` = 962669cabd93478df76dd490b2bcd9e042b6da68 | `git rev-parse` |
| Archive manifest | 315 lines in `MANIFEST.txt`; 315 `: OK`; 0 not-OK; exit 0 | `sha256sum -c` |
| T4 session | `8efdbd08-…jsonl`, 517 rows: 180 assistant, 89 user, 133 attachment; span 2026-09-28T19:11:18Z to 19:40:12Z (by lead's t4.json; I did not recompute the span) | python over jsonl |
| T4 assistant rows / unique message ids | 180 / 78 | python |
| T4 tool_use / tool_result | 84 / 84 (84 distinct ids) | python |
| T4 tool mix | Bash 57, Write 16, getJiraIssue 3, Read 2, ToolSearch 2, Edit 2, AskUserQuestion 1, getAccessibleAtlassianResources 1 | python, by `tool_use.name` |
| T4 output_tokens | dedup by message id 125,268 (first-wins, last-wins and max-wins all give 125,268); raw row sum 363,832 | python |
| T4 AskUserQuestion | 1; tool_use 19:11:45.310Z, tool_result 19:11:49.646Z = 4.336 s; the question was which of two Atlassian MCP servers to use | python |
| T4 getJiraIssue | 3 calls: VS-6735 at 19:12:00.649Z, VS-6736 at 19:12:01.873Z, VS-6737 at 19:12:02.340Z (all `view: evidence`); VS-6738 not fetched | python |
| T4 retrievedAt | one distinct value, `2026-09-28T21:20:00.000Z`, present in 5 Bash tool inputs (first at 19:12:33.967Z, then 19:28:38, 19:29:14, 19:30:10, 19:38:23); first getJiraIssue is 19:12:00.649Z, so the value is about 2 h 08 min after the first fetch and after the transcript's last row (19:40:12Z) | python |
| T4 mcpServer label in those 5 inputs | `atlassian` (only value) | python regex |
| T4 denials | 1 tool_result containing "has been denied": 19:12:41.505Z "Permission to use Bash with command xargs wc -l has been denied." | python |
| T4 snapshot-too-large | 1 tool_result, 19:29:29.273Z: `main/assets/i18n/en.json is 365565 bytes, above the 262144-byte per-file snapshot ceiling` | python |
| T4 LSP tool_use | 0 in this session (the audit's single LSP call belongs to another session, or the audit table is aggregated over four sessions) | python |
| T4 self-run checks | Bash commands actually invoking a tool: prettier 3 (19:27:42.754Z, 19:27:49.348Z, 19:37:51.330Z), tsc 0, vitest 0, eslint 0. Other hits are mentions only: `cat tsconfig.spec.json` (tsc, 19:27:27), `ls vite*.ts vitest*.ts` / `grep ... vitest.config.*` (19:16:36) | python, per-match context printed |
| T4 `prepare` invocations | 2 (`ambicode.mjs prepare --activity task --json` at 19:12:33.967Z and 19:28:38.672Z); the 19:11:24 hit is a `cat` of prepare-output.md | python regex |
| Reviewer local_2026-09-28T21-30 | turns 14, costUsd 1.1074444, findings 3, status partial, pluginVersion 0.3.4, durationMs 360,797 | `archive/gym__planing__investigation__cache__VS-6735/reviews/local_2026-09-28T21-30/result.json` |
| Reviewer local_2026-09-28T21-38 | turns 3, costUsd 0.4019738, findings 3, status partial | `.../local_2026-09-28T21-38/result.json` |
| Reviewer local_2026-09-28T22-13 | turns 2, costUsd 0.3264772, findings 0, status partial | `.../local_2026-09-28T22-13/result.json` |
| VS-6735 transcripts in repo | `find gym/planing/investigation/cache -name '*.jsonl'` = 0; `find archive/gym__planing__investigation__cache__VS-6735 -name '*.jsonl'` = 0; `git ls-files` tracks 0 `.jsonl`; `cache/VS-6735/` is gitignored (`.gitignore:40`). Directory holds `investigation_2026-09-28T20-49.md`, `notes.md`, `plan_2026-09-28T21-06.md`, `reviews/` (3 result dirs). The two session transcripts that exist are `archive/8efdbd08-….jsonl` and `archive/9a235fc3-….jsonl` | find / git |
| Secrets sweep | `grep -rEn 'sk-ant-\|OAUTH_TOKEN=\|API_KEY=' gym/runs/R1 --exclude-dir=archive --exclude-dir=supervisor --exclude-dir=scratch` empty, exit 1 | grep |

Comparison with `00-audit.md:94-116` for the 8efdbd08 session: rows 180 (match), tool calls 84 (match), responses 78 (match), output dedup 125,268 (match), 1 question / 4 s (match; 4.336 s, audit floors), 3 getJiraIssue (match), retrievedAt 21:20Z vs first fetch 19:12:00Z (match), 1 denial (match), refusal 19:29:29Z 365,565 B (match). Audit's "one LSP call" and "N17 task sessions ran 0 vitest/eslint/tsc" are per-set statements; in this session LSP is 0 and tsc/vitest/eslint are 0, prettier 3, which is consistent with the audit's it4-6 session being the one with the tsc run.

Reviewer figures match audit §2.2 (14 turns/$1.107; 3/$0.402; 2/$0.326).

## Could not do
- Wall-clock per command was not recorded for read-only commands (no timing wrapper); only the manifest check took noticeable time and was not timed.
- Did not re-run G1-G3 (forbidden until the sweep ends). G1 and G2 were verified only from the lead's logs. I did not verify that `dist/ambicode-0.3.4.zip` on disk still hashes to c8c5b7b3…; only that the logs agree with each other.
- T1 comparison used file contents only; I could not confirm the pre-campaign file was the true pre-campaign run beyond its plugin version 0.3.2 and startedAt 2026-09-28T11:06Z. The results directory holds eight run dirs, so choice of "the" baseline is the lead's.
- 00-audit.md:89 says 3 VS-6735 transcripts are in `cache/VS-6735/`; they do not exist in this repo or in the archive, so that claim could not be checked against them. The 8efdbd08 transcript was used instead (it is in the archive and matches the audit's numbers).
- Did not compare the second session in t4.json (9a235fc3) or the fields outside the ones I was assigned (notComputed entries, span, per-session second row).
- Deviation from the write rule: `sha256sum -c` output was redirected to `/tmp/verifier_manifest.txt` to count OK lines; I deleted that file right after. No file inside the repo other than this handoff was written.
- One of my commands used an invalid `head -0` flag and errored (exit 1) after the useful output; harmless, rerun not needed.

## Disagreements (verifier/auditor only)
| field | lead's value | mine | source of difference |
|---|---|---|---|
| (none on the assigned fields) | | | |

Field-by-field, brackets were the lead's values: G1 752/751/0/1 exit=0, Validation passed, sha c8c5b7b3 (agree); G2 sha and 50 files (agree); T1 7 cases 1.0, url-bare 0.4 with investigate 3/3, $4.21 (4.2107), 209 s, partial false (agree); T3 5 recordings 4/4/6/1/6 of 8 (agree), byte-identical to archive (agree), drift diff empty (agree), tree hashes (agree); archive 315 OK / 0 failed (agree); T4 session and reviewer figures vs `scratch/t4.json` (agree on rows 180, responses 78, tool calls 84, tool mix, output dedup 125,268, 1 question / 4 s, 3 keys VS-6735/6/7, first fetch 19:12:00.649Z, retrievedAt 21:20Z single value, 1 denial, refusal 19:29:29.273Z 365,565 B, LSP 0, tsc/vitest/eslint 0, prettier 3, prepare 2, reviewer 14/3/2, $1.1074/$0.4020/$0.3265, findings 3/3/0); claim of no VS-6735 transcripts (agree); secrets sweep empty (agree).

Two observations for the lead, not disagreements:
- t4.json field `fabricatedProvenanceFields: 1` and `retrievedAtValues` (one entry) count distinct values; the value occurs in 5 Bash inputs. Say which unit is meant when citing it.
- T1 "unchanged from pre-campaign" holds for scores only. The pre-campaign run was plugin 0.3.2 on claude 2.1.283; this baseline is 0.3.4 on 2.1.284. A single-run +7.5% cost and +24 s duration is not evidence of a regression or of noise; nothing here measures its variance.

## Claims without evidence
- (none)

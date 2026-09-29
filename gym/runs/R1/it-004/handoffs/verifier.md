# verifier handoff - it-004 (read-only; only this file written; no claude, no evals, ~/.claude untouched)
Checked at HEAD d149d75.

## Disagreements (5, none touches a gate or the recommendation)
1. Item 3: `evals-record-core.mjs:127,129,152-154` is wrong. Lines 127/129 are `);` / `}`; 152-154 write the recordings file. True: cost is read at `:112` (`costUsd: review.reviewer.usage?.costUsd ?? null`) and printed to stderr at `:145`.
2. Item 3: the env allowlist has 25 names at `claude-reviewer.ts:74-104`, not 26 (range correct).
3. Item 6: "509c0a5 is the only non-gym commit in the range" is false as written. Four commits touch non-gym paths; none is in the reviewer paths (`git log` over them is empty, agree).
4. Item 2: G3 file count is 508 now, not 505 (exit 0 either way). Inferred, not verified: the +3 are it-004's own `brief.md`, `diff.patch`, `worker-1.md`, committed after the count was taken (it-003 had 491, so the count moves with each iteration's files).
5. Item 3 (minor): `--safe-mode` is on line 248; 247 is the comment line "No CLAUDE.md, skills, plugins, hooks, MCP servers or output styles". The text the worker relies on is at 247, so the substance holds.

## 1. Diff vs it-003: agree
```
$ git diff --stat gym/R1/it-003 -- . ':!gym'      (rev 3ff2cb4 vs HEAD d149d75)
(empty)  exit=0
```

## 2. npm run verify: agree on G1, G2; G3 number differs
```
exit=0   (/tmp/it004-verify.log, last line)
ℹ tests 776 / suites 128 / pass 775 / fail 0 / cancelled 0 / skipped 1 / todo 0
Archive sha256: bee92a9a930c0cb4701473541c02ae910697df039f03a07cd69c7789e5487033   (identical to metrics.json)
Validation passed
$ node check-line-endings.mjs    -> line endings OK: 508 tracked text file(s)   exit=0   (metrics: 505)
```
Tracked files: 512 at HEAD, 508 at 2f4376e. No tracked change after verify.

## 3. Citations (worker Numbers table)
| cite | verdict | true text |
|---|---|---|
| claude-reviewer.ts:266-267 | agree | `'--output-format', 'json'` |
| :243-271, :74-104 | agree; allowlist is 25 names, not 26 | `argvFor` body: `--tools` (REVIEWER_TOOLS = Read,Grep,Glob, line 17), `--disallowedTools` (DENIED_TOOLS, 8 names, line 20), `--permission-prompts none`, `--safe-mode`, `--restricted`; no `--max-turns` anywhere in the file (grep 0) |
| :186, :301-310 | agree | `maxOutputBytes ?? 4 * 1024 * 1024`; `truncated` fail at 307-310 |
| :154-161, :412-425 | agree | `Envelope` (type, subtype, is_error, result, structured_output, errors); `usageOf` reads num_turns, duration_api_ms, usage.output_tokens, total_cost_usd, thinking_tokens |
| contracts/review.ts:108-114 | agree | strictObject, 5 fields, `thinkingTokens ... .default(null)` |
| :6, :141; f751954 | agree | version 1, `z.literal`; `git log -G'REVIEW_SCHEMA_VERSION = '` shows only 3c5c131 (never changed); f751954 adds only `thinkingTokens ... .default(null)` |
| cli/commands/review.ts:275-281, :257-259 | agree | `toolsOf(argv)` returns the `--tools` value, not calls made; replay adds a gap "replayed from a recording" |
| evals-record-core.mjs:127,129,152-154 | **disagree** | see 1 |
| prompts/reviewer-role.md:73 | agree | "Answer by calling the `StructuredOutput` tool once" (lines 73-75) |
| replay `usage: null` | agree | `ports/reviewer.ts:19` `usage?`, `cli/commands/review.ts:98` `invocation.usage ?? null`; replay-reviewer.ts never sets it |
| "help stubs in 3 tests" | agree | replay-reviewer.test.ts:190, reviewer-boundary.test.ts:35, review.test.ts:728 |

## 4. stream-json, fixtures, recordings: agree
```
stream-json in src: 0 files (test files included)
fixtures/reviewer-envelopes/: 6 .json + truncated.txt; has("usage") false for all 6; no key matching tool|permission_denials|modelUsage; no tool_use/tool_calls text
benchmarks/reviewer-recordings.json: 8 entries; [.recordings[]|keys]|unique -> [["case","model","output","recordedFrom","snapshotId"]]
```

## 5. Archived VS-6735 reviews: agree
```
21-30  [turns 14, costUsd 1.1074, status ok, model sonnet, timeout 900]
21-38  [turns 3,  costUsd 0.4020, ok, sonnet, 900]
22-13  [turns 2,  costUsd 0.3265, ok, sonnet, 900]
```

## 6. Range claims
```
git log --oneline 6bde81c..gym/R1/it-001 -- src/review prompts policies src/config src/cli src/ports src/contracts hooks scripts
(empty)   -> agree
git log 6bde81c..gym/R1/it-001 -- . ':!gym'
bfadeef  src/hook/run-hook.test.ts (+32)
1935b4d  CLAUDE.md
3b01dc0  .gitignore
509c0a5  11 files: plugin.json, evals README/bench/bench.test, evals-record-core.mjs (+169, new), package*.json, 2 SKILL.md, outcomes.md, skill-content.test.ts
```
Second claim: disagree literally (4 commits). 509c0a5 is the only one that touches product-adjacent or eval code, apart from one hook test. Reviewer-code claim stands.

## 7. Agent traces: agree
```
ls evals/evals-core/results/traces/*.jsonl | wc -l -> 350
num_turns (result event) minus tool_use blocks in assistant events, per trace:
  diff 1: 167    diff 2: 183    (no 0, no 3+; same with unique tool_use ids and with raw count; no trace lacks a result event)
```
Agent runs only, as the worker says; not evidence for the reviewer.

## 8. Option-table honesty: no contradiction found, two notes
- `--verbose` requirement: marked inferred; `grep verbose` in reviewer code and docs/compatibility.md finds nothing either way. Honest.
- "`--safe-mode` loads no hooks": the only in-repo source is the comment at claude-reviewer.ts:247 (intent), pinned by a regex in `policy-check.test.ts:582`. docs/compatibility.md:31 only says the flag exists in `--help`. The table states this as fact; it is the code's claim, not a measured behaviour. Does not change the recommendation.
- Option A/D file references exist (`evals-reviewer.mjs:196-216` reads `invocation.usage`; recorder cost reaches stderr only).
Not done: Q3 record-log costs and the 18:29Z timestamp not re-derived.

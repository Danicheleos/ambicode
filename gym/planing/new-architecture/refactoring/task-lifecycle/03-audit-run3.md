# Audit: third real run (inseer-frontend, 2026-10-17) and comparison with runs 1–2

Data: run-3 ledgers (`.ambicode/tasks/{init,vs-6735}`, `.ambicode/reviews/*`), review bundles, the staged
diff, subagent `meta.json` files, the run-1 init transcript. Scripts: session scratchpad `audit3/`.

## 0. What could not be measured

Main-session transcripts are missing for run 2 (e48da091, 5a9ae757), run 3 (227e8f0d) and the run-1 task
session (5123e903). Subagent transcripts of those sessions are broken symlinks; only `meta.json` is left. So
turns, tool calls, context size and cost of the main session exist only for run-1 init.

Likely cause (unverified): those sessions were started from VS Code terminals after VS Code was relaunched from
inside Claude session faec52cf (2026-10-16 19:47). The run-3 process carries `CLAUDE_CODE_CHILD_SESSION=1` and
`CLAUDE_CODE_SESSION_ID=faec52cf…` in its environment; history.jsonl has no prompt from these sessions either.
Run-1 init (started before the relaunch) has its transcript.

## 1. Run 3 timeline (UTC, from the ledger)

| route | start | total min | human wait | machine | model steps | injected KB | checks (s) | subagents | gates |
|---|---|---|---|---|---|---|---|---|---|
| init (scaffold → context → packs) | 00:56 | 2.3 | — | 2.3 | — | — | 0 | 1 scout | 0 |
| rules | 00:58 | 0.8 | 0.5 | 0.3 | 2 | 6.6 | 0 | 0 | 2 |
| investigate | 01:07 | 0.9 | 0.0 | 0.9 | 2 | 11.9 | 0 | 0 | 0 |
| plan | 01:09 | 2.7 | 0.6 | 2.1 | 1 | 12.7 | 0 | 0 | 3 |
| task it1 | 01:14 | 1.8 | 0.3 | 1.5 | 3 | 3.4 | 3 (15) | 3 | 2 |
| task it2 | 01:16 | 4.3 | 0.7 | 3.6 | 3 | 3.4 | 5 (42) | 3 | 2 |
| task it3 | 01:20 | 3.8 | 0.4 | 3.4 | 3 | 3.4 | 4 (40) | 3 | 1 |
| task it4 | 01:24 | 4.7 | 0.4 | 4.3 | 6 | 7.1 | 4 (38) | 6 | 2 |
| task it5 | 01:29 | 9.7 | 0.3 | 9.4 | 4 | 4.7 | 8 (113) | 4 | 1 |
| task it6 | 01:38 | 71.3 | 61.3 | 10.0 | 8 | 9.4 | 6 (62) | 7 | 4 |
| review (working tree) | 02:55 | 1.3 | 0.3 | 1.0 | 2 | 2.8 | 2 (21) | 1 | 1 |
| review (MR URL) | 02:58 | 1.2 | 0.7 | 0.5 | 1 | 0.9 | 0 | 0 | 2 |

Task: 6 iterations, 32 min machine time, 26 subagents (13 implementer, 13 reviewer), 11 reviews, 30 checks,
9 limits. The 61 min wait in it6 are three gates (typecheck approval 17 min, review-again 27 min and 17 min).

## 2. Findings, run 3

### P0: wrong result or a claim the ledger does not support

| # | Finding | Evidence | Cause |
|---|---|---|---|
| A1 | Every iteration's review covers the whole working tree, not the iteration; the fix → re-review loop does not converge | brief "Target: working against HEAD"; it6 brief 155 KB, patch 124 KB, 22 files, 2335 lines. 9 of 11 reviews had findings, most on code from earlier iterations (rollback, optimistic update) | the task review pins `working` vs HEAD; the iteration baseline (`baseline` entry) is recorded but not used as the diff base |
| A2 | The reviewer never sees the requirements or the iteration's plan | brief `## Requirements (none supplied: quality review)`, `requirementBytes: 0`, every finding `requirementRefs: []` | the task route passes no envelope to the review; the task's own envelope is empty (A8) |
| A3 | 2 of 11 reviews returned `invalid-output`, 2 more dropped a finding | rejected-output.txt: lines 1357 and 1767 in files of ~400 lines: positions in the brief, not in the file | the brief lists hunks with only `new-side lines: a-b` ranges; the reviewer counts lines itself |
| A4 | summary.md says "re-review clean" for iterations 4 and 5, whose re-review was `status error` | ledger lines 181, 229 (`invalid-output`, 0 findings) | `reviewFact` (report.ts:92) reads 0 findings as clean; status is ignored. My change from the previous review round |
| A5 | typecheck never ran | gate `check-only-unauthorized` printed 3×, approved 2×, 0 `check` entries with key typecheck. Question text "Run inseer-frontend/typecheck on ?" (no files). A reviewer flagged `JSON.parse(getItem())` that tsc rejects | the `all` form asks for approval, `approve` revises the raising step (format), and nothing runs the approved check. The gate at it1 was abandoned with no answer recorded |
| A6 | Remote review did not reach the MR | MR URL → `hasRequirement` true → fetch → `requirements-not-captured`; `mr-fetch` skipped; estimate on the local working tree (36 files) | `target.mr` is set only by `--mr`; the URL in the text is never parsed. Being fixed (task in progress) |
| A7 | The `surface` concept from the requirements is not in the code | plan coverage: "one Default per surface → Iteration 5", but no iteration names how surface is represented; the model has `type, ownerId, showInViewsList, isPinned, order`; the store is keyed by `tableId` silently. The investigation listed "no type, owner, organization"; the plan dropped organization and surface | the plan's coverage table maps headings to iterations, not domain terms to code; plan-check checks anchors only; review has no requirements (A2) |
| A8 | The task route ran without requirements | task envelope `sources: [] builtFrom: args` in all 6 routes; `requirements/*.json` (5 issues) sit in the task folder from investigate. The plan route too (`text: vs-6735` → `hasRequirement` false) | the envelope is built from the route's own args; a task's earlier captures are not reused |

### P1: noise, friction, missing evidence

| # | Finding | Evidence |
|---|---|---|
| B1 | Iterations 1–5 in summary.md: "No final message"; Not verified lists internal ids ("Review review-2026…: status partial, 3 omissions", "check limit (5) at format") | summary.md |
| B2 | The brief's check results are the whole task's history, stale reds included, labelled "green: exit 1"; the reviewer wrote "results mixed, several runs failed" | brief `## Check results`, coverageNotes |
| B3 | Review folders: `reviews/vs-6735` (11 reviews overwrote one bundle), `reviews/review`, `reviews/https-gitlab-com-…-me` | `.ambicode/reviews/` (being fixed) |
| B4 | Context notes are stubs: 135 notes, Key files 135/135, Depends on 0, Gotchas 0, Purpose = folder name | `.ambicode/context/modules` |
| B5 | format failed twice (`exit 1`) and a check limit (5) hit at format | ledger it3, it5 |

### What worked

Init in 3 min with no loop; rules found `.claude/CLAUDE.md` and `.claude/rules/security.md`, one answer.
Investigate read the epic and 4 children (`linked`). Plan asked 2 decisions through AskUserQuestion and was
accepted on the first draft. The task ran 6 iterations by itself on an empty start; no stray folders, no
`task-unknown`, no crash.

## 3. Comparison

| | Run 1 (2026-10-16 19:24) | Run 2 (16→17 23:25) | Run 3 (17 02:56) |
|---|---|---|---|
| Init | 9.7 min main (Opus, 18 calls, 20 tools, max context 78k); scout 1.5 min, 7 calls; stubs | 2 scout passes (23:26, 23:45); rules gate looped 9×; empty folder `e48da091-3` | 3 min; 1 scout; rules 1 answer; 138 context files |
| Investigate / plan | plan worked | plan did not read children | investigate 0.9 min with 4 children; plan 2.7 min, 2 decisions |
| Task | could not continue; new folder per attempt; checks refused; 2 implementers, 0 reviews | 3 iterations, 10 subagents in ~10 min; 5 reviews in one folder | 6 iterations, 26 subagents, 32 min machine + 61 min waiting |
| Reviews | none | 5, folder overwritten | 11 (2 error, 2 partial), folder overwritten; no requirements in brief |
| Remote review | — | not tried (no glab) | failed (A6) |
| Report | — | Evidence dump | readable plan/iteration sections; rows 1–5 empty; one overclaim (A4) |
| Main-session cost / turns | init only (tokens above) | not on disk | not on disk; session still open |

## 4. Proposed fixes (await the user's go)

1. A1+B2: review the iteration, not the tree: diff against the iteration's baseline snapshot; brief check
   results only from the reviewed step, by outcome.
2. A2+A8+A7: one task envelope: a task's routes reuse the task's captured requirements; the review brief gets
   the requirements and the iteration's section of the plan.
3. A3: number each diff line in the brief with its file line (`  123 + code`).
4. A4: `reviewFact` reads status: an errored re-review is "re-review failed", and the gap stays.
5. A5: an approved `all` check runs (the step that raised it runs it); the question names the scope ("the whole
   project") instead of an empty file list; an abandoned gate records default-taken.
6. A6+B3: in progress.
7. B1: write the final message per iteration (the auto-run continues after `report`, before the next start).
8. Transcripts: start sessions from a terminal without inherited `CLAUDE_CODE_*` variables.

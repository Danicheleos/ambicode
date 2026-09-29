# Pending questions for the owner (oldest first; answer in labels.json)

## L-001  (asked it-000, 2026-09-29)
Question: Please copy the three missing VS-6735 cycle transcripts into `gym/runs/R1/archive/`: the investigate session (73 assistant rows / 35 tool calls), the plan session (68 / 36) and the it4–6 task session (173 / 88), from `~/.claude/projects/-Users-KillBill-Documents-projects-inseer-inseer-frontend/`, then append their sha256 lines to `archive/MANIFEST.txt`. The lead cannot: the guard denies agent reads of `~/.claude` (08 §4, 02 §2 step 2).
Why: 00-audit.md §4 line 89 says 3 transcripts are in `cache/VS-6735/`, but `find gym/planing/investigation/cache -name '*.jsonl'` → none. The archive (`defaults.json` `volatileInputs`) holds only `8efdbd08…` (the it1–3 task session: 180 rows / 84 tool calls, matching 00 §4 line 94) and `9a235fc3…` (the MR session, not part of the cycle).
Needed for: cp-0 "T4 row reproduced by the script" for the whole cycle; WP2 T4 targets (fabricated provenance 4/4, MCP questions 3/4, 15 fetches for 4 keys).
Default if unanswered by it-003: the T4 baseline is the it1–3 session plus the 3 archived reviews only (n = 1 task session); cycle-level T4 rows stay `null` and WP2's T4 claims compare per task session.
Status: answered 2026-09-29T02:05:11Z in labels.json ("done"). Verified by the lead: `sha256sum -c archive/MANIFEST.txt` → 318 OK, 0 failed (session 5). `baseline/scratch/t4.json` includes the investigate session `5326e45c…`.

## L-002  (asked it-000, 2026-09-29)
Question: What is the campaign budget ceiling in USD? Please answer with a `labels.json` line, not an edit to `CAMPAIGN.md`.
Why: four sources disagree. (1) The supervisor kickoff text says "budget 100 USD". (2) `supervisor/supervisor.log` shows the running supervisor started with `"budgetUsd":100` (its first start, 01:22Z, had 1000). (3) The `CAMPAIGN.md` budgetUsd cell was changed outside the lead's session to 3000 at about 02:09Z. The supervisor's parser (`supervise.mjs:64`, `^budgetUsd:\s*`) does not read that table cell, so the change has no effect. (4) The lead's OWNER-INBOX line was changed to "ceiling $1000 (raised by user)". 03 §2: raising a limit is human only, and a human line is a `labels.json` entry or a quoted message. There is neither.
Spend so far (files on disk): sessions 1–4 $5.76 (`supervisor/state.json`); T1 $4.21; preflight $0.39; the T2 baseline sweep killed with session 4 $41.04 (`eval-2026-09-29T01-43-58-769Z.json` `costUsd`). Total $51.40 before session 5.
Needed for: every T2 decision iteration (about $65–70 each, 01 §5). At $100 the stop is $90, so none fits after the baseline. WP1's T3 re-record is the only item left that fits.
Default if unanswered by it-001: $100, the value the supervisor enforces. After iteration 0 the lead does only T3-measured work and then sets PHASE `blocked` on replan trigger R1 (budget).

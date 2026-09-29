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
Status: answered 2026-09-29T02:23:04Z in labels.json ("150"). Applied to `CAMPAIGN.md` and `OWNER-INBOX.md` in the it-000 commit.

## L-003 … L-008: the six local VS-6735 review findings  (asked it-002, 2026-09-29)
Each finding gets two answers. Use one `labels.json` key per finding, e.g. `{"L-003": {"label": "actionable", "laterIteration": true, "by": "...", "at": "..."}}`.
1. Rubric class (`evals/evals-archived/typescript/adjudication.md:11-14`): actionable / correct-but-inert / unfounded / unverifiable.
2. `laterIteration`: does the finding concern work that the accepted plan (`gym/planing/investigation/cache/VS-6735/plan_2026-09-28T21-06.md`) schedules for a later iteration than the one under review (it1–3)? true / false.
Where: `gym/runs/R1/archive/gym__planing__investigation__cache__VS-6735/reviews/<review>/result.json`, field `findings[]`, matched by `id`. The paths are in the FE repository (`main/…`).

| Label | Review | Finding id | Category / risk / confidence | Location (new side) | Audit's judgement (00-audit.md:108) |
|---|---|---|---|---|---|
| L-003 | local_2026-09-28T21-30 | f-a1246fa40c25 | correctness / high / high | `…/advanced-table-views/advanced-table-views-storage.service.ts:128` | borderline (plan `:164`) |
| L-004 | local_2026-09-28T21-30 | f-b146665e78f8 | correctness / medium / high | `…/advanced-table-views/advanced-table-view.service.ts:352` | not named on line 108; "not later-iteration" is inferred from its count (4 later + 1 borderline of 6) |
| L-005 | local_2026-09-28T21-30 | f-676ea7fc4aa4 | correctness / medium / medium | `…/manage-views/advanced-table-manage-views-dialog.component.html:21` | later-iteration |
| L-006 | local_2026-09-28T21-38 | f-414213252434 | requirements / high / high | `main/screens/reports-list-new/providers/assessments-table-views.provider.ts:12` | later-iteration |
| L-007 | local_2026-09-28T21-38 | f-065de7f5a308 | dead-surface / medium / high | `…/advanced-table-views/advanced-table-view.service.ts:88` | later-iteration |
| L-008 | local_2026-09-28T21-38 | f-299cc3942107 | correctness / low / medium | `…/view-bar/advanced-table-view-bar.component.html:78` | later-iteration |

Needed for: WP4's T4 baseline "findings about later plan iterations" (01 §3 T4: 4 of 6 by the audit, a single judgement, not yet a human label) and cp-4 ("later-iteration findings ≤ 1 of N (human label or documented heuristic)").
Default if unanswered by it-005: rubric class `correct-but-inert` (does not count as recall, 02 §6), and `laterIteration` = the audit's judgement, with L-003 counted as false. That gives the WP4 baseline 4 of 6, marked "audit judgement, not a human label" in every decision that uses it.

## L-009  (asked after cp-1, 2026-09-29)
Question: WP2 cannot be decided within the $150 ceiling. Which of these do you want?
(a) Raise the ceiling. One WP2 iteration costs ≈ $85: T2 screening ≈ $19.7 + T2 decision ≈ $59.0 (from the baseline's measured per-run costs: localize with $0.544 × 30, without $0.418 × 30, review with $0.630 × 24, without $0.627 × 24) + preflight $0.40 + worker/lead ≈ $5. A ceiling of **≥ $190** covers one WP2 iteration; WP2 + WP3 + WP4 at one iteration each need **≥ $375**. Answer with the number.
(b) Keep $150 and end cycle 1 at cp-1. The remaining ≈ $55 stays unspent.
(c) Approve a cheaper T2 control for WP2 through a replan (09 §2, human confirmation needed for R1/R7). For example, 3 runs/arm on the localize arm only (≈ $29), with review recall control carried from cp-0. This changes measurement mechanics and weakens the control, so it needs your line.
Why: spend is ≈ $80.4 of $150 (`cp-1.md`); the stop is $135, so ≈ $54.6 remains. WP2's row requires T2 as a must-not-move control (01 §4), and a control decision needs ≥ 3 runs/arm (02 §5). WP2's claimed metric (T4: fabricated provenance 4/4 → 0) moves only with a human-run cycle after the change (01 §3 T4), so WP2 also needs you to run one VS-* cycle with the new build before it can be accepted.
Needed for: WP2 (next in order), and hence WP3 and WP4 (01 §4 order).
Default if unanswered: (b). Nothing more is spent. The lead stays `blocked`; the supervisor exits on that phase (10 §4 row 7).
Status: answered 2026-09-29T03:24:22.933Z in labels.json ("250", i.e. option (a)). Stop moves to $225. The ledger was ≈ $81 at that point, so ≈ $144 remains: one WP2 iteration with a T2 decision (≈ $85) fits, a second T2-decision iteration does not. Applied to `CAMPAIGN.md` in session 6.

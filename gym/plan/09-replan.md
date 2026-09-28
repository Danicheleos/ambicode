# 09 — Replan

When the plan must change, how it changes, and how a revised plan supersedes the old one
without losing history. Everything else in `gym/plan/` is read-only during a campaign;
only the procedure here writes to it.

## 1. Conditions that require replanning

| # | Condition | Raised by |
|---|---|---|
| R1 | Budget: 90 % of the ceiling reached with WP0–WP2 not all accepted (03 S2) | lead |
| R2 | Harness cannot decide: two decision sweeps in a row ended in B2 ([07](07-blockers.md)) | lead |
| R3 | A WP is unmeasurable: B3 exhausted on its first item, or a checkpoint no-go (03 §1) | lead |
| R4 | An input a WP's measurement depends on is permanently lost (B5), e.g. the VS-6735 snapshots purged before archiving | lead |
| R5 | A seam is blocked by a documented contract with no preserving option (B6) | lead |
| R6 | Three helper failures within one WP (B8) | lead |
| R7 | A human decision changes a target in [01 §1](01-goals-and-metrics.md#1-definition-of-trained-cycle-1), the WP order, a threshold, or the budget | human |
| R8 | A post-incident audit finds no rule that would have prevented the incident (08 §5) | auditor |
| R9 | Model or harness drift confirmed (03 S4): the without-arm moved and stayed moved | verifier |
| R10 | Cycle 1 exit reached (cp-5 go) and the owner wants cycle 2 (WP5–WP7) | human |

A replan is never triggered by a single rejected iteration or by an opinion that a WP
"seems" wrong; those are decisions inside the loop.

## 2. Procedure

1. **Stop the loop** at an iteration boundary (finish or reject the current iteration; commit its records). No new brief is written.
2. **Evidence file:** `gym/runs/<campaign-id>/replan/R-<n>-<ts>.md` with: the trigger id, the `metrics.json`/`decision.md`/`incident` lines that prove it, and the question the replan must answer. Nothing else is written until this file is committed.
3. **Re-audit what the replan touches.** A replan that changes a WP's seam or claim re-verifies the relevant rows of [00 §2–§4](00-audit.md) at the current commit (line numbers move); a replan that changes thresholds recomputes noise from every sweep in `it-*/scratch/` since cp-0, not only the baseline pair.
4. **Draft the revision** as a copy: `gym/plan/rev-<n>/` containing only the files that change, each with a header `Supersedes: gym/plan/<file> @ <planDigest>` and a `## Changes` section listing every altered statement with old → new and the evidence line.
5. **Human confirmation** for R1, R7, R10 and for any change to 01 §1, the budget, the WP order, or 08. The confirmation is a line in `labels/labels.json` (`"R-<n>": {"decision": "...", "by": "...", "at": "..."}`). R2–R6, R8, R9 may be confirmed by the lead alone when the revision changes only measurement mechanics, and must say so in the `## Changes` header.
6. **Apply:** move each `rev-<n>/<file>` over `gym/plan/<file>`; append the revision's `## Changes` section to `gym/plan/CHANGELOG.md` (created on first replan) with the trigger id and date; recompute `planDigest` and write it to `CAMPAIGN.md`; commit `gym <campaign-id>: replan R-<n>`; tag `gym/<campaign-id>/replan-<n>`.
7. **Resume** through [02 §1](02-loop-protocol.md#1-entry-conditions): the digest check now passes; the next brief cites `R-<n>` in its header.

The old wording is not deleted from history: it is in git under the previous
`planDigest`, and `CHANGELOG.md` names every statement that changed. A reader of any
`decision.md` can `git show <replan tag>~1:gym/plan/<file>` to see the plan that decision
was made under.

## 3. Superseding without losing history

- `gym/plan/README.md` keeps a `## Revisions` table: revision, date, trigger, digest before → after, one line of what changed.
- Iteration directories are never renamed or removed. A decision made under an older revision keeps its `decision.md`; the replan may add a `superseded-by: R-<n>` line at its end, nothing else.
- Baselines are not rewritten. If a replan changes a metric's definition, iteration 0 of that metric is re-run and stored as `baseline/metrics-R-<n>.json`; later decisions name which baseline file they compare to.
- Tags are never moved or deleted.
- If the campaign id changes (a fresh start rather than a revision), the old `gym/runs/<old-id>/` stays, `CAMPAIGN.md` of the old one gets `status: superseded-by <new-id>`, and the new `CAMPAIGN.md` names the old one under `supersedes:`.

## 4. What a replan may not do

- Lower a threshold in [01 §3](01-goals-and-metrics.md#3-measured-metrics) or raise a budget to make a rejected iteration accepted retroactively. A threshold changes only with new noise evidence (§2 step 3) and applies from the next iteration.
- Remove a gate (G1–G3) or a stop condition in [03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate) or [08 §1](08-safety-and-rollback.md#1-triggers).
- Reinterpret an inconclusive result as an accept.
- Edit [00-audit.md](00-audit.md) rows other than by appending a dated correction with its evidence.

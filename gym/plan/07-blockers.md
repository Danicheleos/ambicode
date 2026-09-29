# 07 — Blockers

Taxonomy, per-type playbook, retry limits, and the point at which a blocker becomes a
replan trigger ([09](09-replan.md)). Every blocker is logged as one line in
`it-NNN/decision.md` under `blockers:` and, if it ends the iteration, as
`incidents/<ts>-<slug>.md` ([06 §1](06-data-and-state.md#1-layout)).

## 1. Taxonomy

| Type | Definition | Detected by |
|---|---|---|
| B1 gate | G1–G3 red after the change | `npm run verify` exit ≠ 0, `fail` > 0, G2/G3 exit ≠ 0 |
| B2 harness | the eval harness cannot produce a decision-grade number | `partial: true`, `skippedPaidGraders`, run `error`, `refused <case>`, preflight refusal, `Not logged in`, rate/usage limit text |
| B3 noise | the claimed metric moved but not past the signal rule, twice | 02 §5 "inconclusive" twice for the same brief |
| B4 spend | iteration or campaign budget reached | 02 §1 budget row; 03 S2 |
| B5 environment | a required input is missing or unreadable | archive source missing, `benchmarks/` absent, `claude` not logged in (`claude auth status`), Node ≠ 24, snapshot ceiling refusal in T3 |
| B6 design | the seam named in the brief cannot carry the change without breaking a documented contract | e.g. `prepare` promises "nothing is written" (`ambicode --help`); `ReviewerUsage` is a strict object (`src/contracts/review.ts:108-114`) |
| B7 human | a label, decision or permission only the owner can give | `labels/pending.md` entry with no answer past its default iteration; a permission prompt the lead cannot answer |
| B8 helper | a helper timed out, returned an incomplete handoff, or touched files outside scope | [04 §5](04-orchestration.md#5-replacing-a-helper) |
| B9 integrity | state on disk disagrees with git or with itself | 03 S6, S8; manifest mismatch; `STATE.md` vs tags |
| B10 context | the session reached the soft or hard context limit | guard advice text; `supervisor/context.json`; heavy start denied with `context-hard-limit` ([10 §2](10-supervisor.md#2-context-budget)) |

## 2. Playbooks and retry limits

| Type | First response | Retry limit | Then |
|---|---|---|---|
| B1 | worker fixes inside the same iteration; if the failing test is not one the diff touched, run the check in [05 §1](05-anti-hallucination.md#1-mandatory-re-verification-before-acting) for "pre-existing" | 2 fix attempts | reject the iteration; if the failure reproduces at the last accepted tag → S1 stop |
| B2 | read `NOTES`/`error` in the result JSON; if rate/usage limit, wait until the limit window resets (docs: "re-run after the limit resets, with `--runs 1`") and rerun the sweep; if `refused <case>` (truth files gone from snapshot) proceed with the rest (03 §4); if `Not logged in`, B5 | 1 rerun per sweep | mark the iteration inconclusive; 2 harness failures in a row → R2 replan |
| B3 | sharpen the brief: smaller change, one metric, predicted magnitude; or move the measurement to the metric tier that can see it (T4 instead of T2) | 1 retry | drop the item; record why in `decision.md`; WP row updated at the next checkpoint |
| B4 | write `cp-budget-<pct>.md`; at 90 % stop | none | S2 stop and escalate |
| B5 | name the missing input and the command that shows it missing; nothing is substituted | none (an absent input is absent) | B7 for the human to restore it; if it was a volatile input that is now gone (e.g. a purged snapshot), R4 replan drops the dependent WP measurement |
| B6 | investigation iteration (no behaviour change): the worker writes the options with the contract each one breaks; the lead picks the one that breaks none, or files B7 | 1 investigation iteration | R5 replan if no option keeps every documented contract |
| B7 | file the label with a default and its expiry iteration (02 §6); continue with other items that do not depend on it | wait ≤ 3 iterations | take the default and say so; 3 defaults in a row on decisive labels → S9 stop |
| B8 | [04 §5](04-orchestration.md#5-replacing-a-helper) | 1 respawn | do the step with a fresh brief in the next iteration; 3 helper failures in one WP → R6 |
| B9 | stop everything; run [06 §6](06-data-and-state.md#6-reconstructing-state-from-disk); diff what disagrees | none | incident file; if git and disk cannot be reconciled from tags, [08 §3](08-safety-and-rollback.md#3-rollback-to-a-checkpoint) to the last checkpoint |
| B10 | soft: finish the iteration, no new one; hard: finish only the running step, record it (an in-flight note in `STATE.md` if the iteration is unfinished), PHASE `handoff`, end the turn | none | the supervisor starts a fresh session, which resumes from the in-flight note per 06 §6 step 3 |

Common to all: a retry is only a retry if the brief says what changed since the failed
attempt; identical retries are not allowed ("a denied call means the user declined it —
adjust, don't retry verbatim" applies to tools; the same rule applies to sweeps).

## 3. Known blockers at planning time

| Id | Fact | Type | Consequence for the plan |
|---|---|---|---|
| K1 | 3 FE review cases refused by the 262,144-byte per-file ceiling until recorded with `--exclude 'main/assets/i18n/**'` (`cache/record-2.log`; no such recording exists yet, [00 §3](00-audit.md#3-eval-and-archive-artifact-claims)) | B2 | WP1 iteration 1 is exactly this re-record |
| K2 | `helper-ran` 0/8 on review with-arm because the case prompt says "Do not edit anything." and agents treat `.ambicode/reviews/` as an edit | B2/B6 | WP1 decides where the fix lives (skill text vs case template) and records it as a harness change if the latter |
| K3 | `prepare` may not write (`ambicode --help`) | B6 | WP2 caching must live in a command that writes (`review`) or be dropped |
| K4 | `ReviewerUsage` is a strict Zod object | B6 | WP3 extends the schema with optional fields and bumps nothing unless `REVIEW_SCHEMA_VERSION` rules require it — worker checks `src/contracts/review.ts` first |
| K5 | FE repository is off-limits to agents ([08 §4](08-safety-and-rollback.md#4-security-constraints)) | B7 | every T4 point needs a human-run cycle; Q5, Q7 in 00 §6 are human tasks |
| K6 | Eval sandbox has no LSP, MCP, user settings; permission mode `dontAsk` | B2 (structural) | LSP-related levers cannot be measured here; not in cycle 1 |
| K7 | `evals:score`, `evals-bench.mjs run` print to gitignored `evals/evals-core/results/`; a `--json` outside it is refused | B6 | copy, never move, result files into `it-NNN/scratch/` |
| K8 | Usage/rate limits end runs with an error but do not mark the sweep `partial` (plugin-evals docs) | B2 | verifier greps every decision sweep's `error` fields before numbers are read |

## 4. When a blocker becomes a replan trigger

| Blocker outcome | Trigger in [09 §1](09-replan.md#1-conditions-that-require-replanning) |
|---|---|
| B2 twice in a row on decision sweeps | R2 harness cannot decide |
| B3 exhausted on a WP's first item | R3 WP unmeasurable |
| B5 permanent loss of an input a WP's measurement depends on | R4 input lost |
| B6 with no contract-preserving option | R5 seam blocked |
| B8 three times within one WP | R6 execution capacity |
| B4 at 90 % with WP0–WP2 not all accepted | R1 budget |
| B7 default taken on a decision that changes 01 §1 | R7 human decision pending |

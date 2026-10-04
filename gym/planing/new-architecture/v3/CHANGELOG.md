# v2 → v3: the user's decisions and what each review-v2 correction became

Two inputs produced this version: six answers from the user (2026-10-04) to the open questions in
[../review-v2.md](../review-v2.md) §6, and the review's 33 corrections (#42–#74). **Accepted** means
the design text now says the corrected thing; **accepted, changed** means the fix differs from the
one proposed, with the reason; **rejected** means not done, with the reason.

## A. User decisions (recorded as D7–D13 in 01 §3)

| Question | Answer | Decision | Where |
|---|---|---|---|
| 1 Investigate's bar | 1a — a tie at lower cost is fine; investigate is already fairly precise; with modular seams it can be tuned alone later | D7 | 01 §1, 22 Purpose |
| 2 Language service in review | "LSP goes to the backlog entirely; try it when the skills show good results without it" | D8 — stronger than either option: no LSP tool, no passive diagnostics, no `refs --exact` anywhere | 10, 16 §6, 24, 25, 50-backlog; P11/P13/P30/P36/P24 closed |
| 3 P34 | 3a — allowed, but the choice must be explicitly represented, analyzable and editable | D9 | 10 §1 (`search.layers`), 13 §1 (`map.layers`), 20, 32 §5; P34 closed; R14 |
| 4 Point of no return | 4a — cost and recall gate, turns reported; **the user makes the rollback decision** | D10 | 33 (every "kill" is now a decision point), 41 step 3, R13 |
| 5 Plan acceptance | 5c — defer `ExitPlanMode`; the plan is saved as a draft so an unexpected end of the agent loses nothing | D11 (draft first), D12 (deferred) | 23 steps 7–9, 13 §3 (`note promote`), 50-backlog |
| 6 First spend | 6a — approve the harness change and the second baseline ≈ $28 as step 0 | D13 (the run itself on an explicit go) | 33 §0.2, 41 step 0 |

## B. Review-v2 corrections

| # | Sev | Correction (short) | Resolution | Where in v3 |
|---|---|---|---|---|
| 42 | must | The fold cannot go backwards; six places need it | **Accepted.** `revise {from, via}` ledger entries move the evidence window; declared by `gate.onAnswer`, code `onFail`, or the model's `--revise` on `revisable` steps; `repeat` = max executions. Plan *Revise* → `revise design`; `plan check` rounds → `onFail: revise plan-write` (≤ 3 writes); rules → `revise draft`; `scope` → `revise ground --term`; task's fix round is a `fix` step with `repeat: 2`. Fixtures in 33 §8. | 12 §1, §4; 17 §2; 11 §4; 21; 22; 23; 24; 32 §3 |
| 43 | must | Most gates are not declarable | **Accepted.** Two classes: declared (route file, `human` step) and raised (`routes/gates.yaml`: code → question/options/default/release/per-skill policy); model-raised `decision:*` for plan. Binding by a `[ambicode gate <id>]` marker in the question text. The table test iterates both. | 12 §3.5, 15 §4, 32 §4, 33 §8 |
| 44 | must | `--default` means two things; headless cannot act | **Accepted.** `--answer <gate>=<opt>` selects; `--default <gate>` takes the non-acting default; `route start --answer …` pre-records `{via: prompt}`. Evals pass `--headless --answer review-offer=run`. 24, 25, 30 §6, 33 §0 fixed; v2 CHANGELOG #3's flag form was the error. | 12 §3.3, 31, 30 §6, 24, 25 |
| 45 | must | Ceremony budgets contradict the engine | **Accepted, changed.** The rule changed rather than the counts: every evidence-writing command advances the route at its tail (implicit `route next`), so a code step after a model step costs the command the model ran anyway. Ceremony turn defined (route-only calls); work commands listed separately. Recounted: investigate 2–3, plan 4 + N, task 1–3 (+ work 4–6), review 1–2. Turns do not gate (D10). | 12 §3.1, 22–25 §Ceremony, 02 §5, 33 §1 |
| 46 | must | The harness serves one prompt to both arms | **Accepted.** `prompt.with.md` for the plugin arm; the cached baseline is invalid after the rewrite, so the second baseline is required (D13); §2 re-costed as a two-arm run (≈ $11). | 33 §0.2, §2; 41 step 0; M22 |
| 47 | must | "Captures reduce payloads" is false for context | **Accepted.** Capture reduces disk, not context; the field lists in the template are the only lever (model-obeyed, M2); the "will exceed unless" sentence is gone; the collector appendix is named as the only true mechanism. | 30 §3, 14 §2–3, 17 appendix, R8 |
| 48 | must | The harness writes outside `.ambicode/` | **Accepted.** `format` is **model-run** at the end of the green step (the engine never rewrites source between model steps); `.gitignore` is written only by `init --apply` on an acceptance; 30 §9 says both. | 16 §3, 24 step 4, 20, 30 §9 |
| 49 | must | The no-URL path is unspecified | **Accepted.** `args.hasRequirement` defined (URL, `--requirement`, or a bare key only with a bound server). No captures → the envelope is built from the args text, `builtFrom: args`; the model pipes nothing; the v2 `--evidence -` path is removed. | 14 (predicate, §3), 32 §6, 22 step 1, 30 §6 |
| 50 | should | Measurement numbers not in any log | **Accepted.** Every number is labelled logged or "unlogged re-run"; the logged grep (70/151 ms with spawn) and relates (115/199 ms) figures are quoted; a provenance note was appended to the measurements README; 33 §0.5 re-runs `compare.mjs` and commits `compare.log`. | 10 §1, §3; M21; measurements README |
| 51 | should | Regex harvest misdescribed | **Accepted.** "Declared names, first match per pattern today (≤ 7 per file); pass 2 adds a global scan and an `export` filter"; "I'd guess ~50 ms". The harvest also yields declaration counts (collisions). | 10 §1 |
| 52 | should | MCP matcher vs binding rule | **Accepted.** Matcher `mcp__.*`; binding inside the hook; cost stated (P53). | 30 §1, 14 §1 |
| 53 | should | Duplicate ids across sessions | **Accepted.** Ids `<session8>-<n>`; readers dedupe on the full id. | 13 §1, 32 §2 |
| 54 | should | "Unanswered" counts calls, not asks | **Accepted.** `gate.asked` is incremented by the AskUserQuestion hook; `never-asked` vs `unanswered` distinguished and printed. | 12 §3.4, 13 §1 |
| 55 | should | Acting options from `via: flag` interactively | **Accepted.** One rule: acting options honoured from `hook`, `prompt`, and `flag` only in headless; 20 step 4's parenthesis fixed. | 12 §3.4, 20, 21, 24, 25 |
| 56 | should | `ExitPlanMode` has no hook row | **Accepted, changed.** Dropped from v3 (D12) rather than added; backlog entry with the plan-mode write question. | 23 step 8, 50 |
| 57 | should | Plan skill lacks the `Write` grant | **Accepted.** `allowed-tools` gains `Write(.ambicode/task/*/steps/plan-body.md)`; stated in 23, 15 §1 and 41. | 23, 15 §1, 41 Kept |
| 58 | should | 33 §1 contradicts itself | **Accepted.** Cost ratio and recall decide; turns reported (D10). | 33 §1 |
| 59 | should | Plan eval arithmetic | **Accepted.** $32–45; scout arm +$16–23 if added. | 33 §4, 23, P43 |
| 60 | should | Review tier arithmetic | **Accepted.** 8 cases × 3 runs ≈ $8–16; the live tier is the choice. | 33 §0.7, §6, 25 |
| 61 | should | Task suite detectable effect | **Accepted.** ≈ 20 pp at 10 × 3 stated; an inconclusive band presented with the cost of enlarging (30 cases ≈ $90–270, ≈ 12 pp). | 33 §5, 01 §1, P49 |
| 62 | should | Plan composite undefined | **Accepted.** Win beyond naked's run-to-run spread on ≥ 2 of 3 metrics, not below beyond the spread on the third; fixed before the first run. | 33 §4, 01 §1, P50 |
| 63 | should | Language service in review vs D1 | **Accepted** via D8: removed everywhere. | 10, 16 §6, 25, 50 |
| 64 | should | `updatedInput` unverified | **Accepted.** Marked unverified (P47); probe before 41 step 1; every step text carries `--task`, so nothing depends on it. | 15, 31, 33 §0.4 |
| 65 | should | Review's stop on a missing requirement is inexpressible | **Accepted.** The registry's per-skill `policy: {review: stop}`. | 12 §3.5, 14 Failure modes, 25 step 2, 32 §4 |
| 66 | should | `scope` answer unused; no "answered" predicate | **Accepted.** `onAnswer: revise ground --term`; `when` gains `gate.<id>.answered` and `gate.<id>.is(<option>)`. | 12 §1, 22 step 3a, 32 §3 |
| 67 | should | The stash holds four files | **Accepted.** "Restore the four files"; `:704` calls `scoreReuse`; `reuse-cases.mjs` is the generator 33 §3 needs. | 33 §0.1, 41 step 0, M22 |
| 68 | could | "15 kinds" → 19 | **Accepted.** Now 20 with `revise`; today's two named. | 13 §1 |
| 69 | could | `--resolution` missing | **Accepted, changed.** Routed through `--answer conflict=<source>`; no new flag. | 14 §3, 31 |
| 70 | could | `review.eta` in two rows | **Accepted.** | 41 Kept |
| 71 | could | CHANGELOG "Not changed" lists a change; P44 unsourced; "F5" wrong | **Accepted.** v2's CHANGELOG is frozen with the error; this file records it. P44 closed (claim dropped). "F5" removed from 16 §4. | 40 P44, 16 §4 |
| 72 | could | Unlabelled guesses in 10 | **Accepted.** "I'd guess ~50 ms"; "per the package README, not checked". | 10 §1, §3, P12 |
| 73 | could | Dead `Skill` hook named as fallback | **Accepted.** "the slash and MCP hooks". | 41 step 3 |
| 74 | could | `ask`-on-git refusal rate unscheduled | **Accepted.** Counted per headless run in 33 §7; `score` field `permission-denied`. | 33 §0.6, §7; 15 Failure modes |

## C. v2 CHANGELOG mismatches the review found (recorded, v2 left frozen)

- #3's flag form `--default <gate>=<option>`: the text's `--default <gate>` was right; v3 fixes the
  skill files that used the wrong form (#44).
- #1's "exported identifiers … verified": the patterns harvest declared names, first match per
  pattern (#51).
- "Not changed" listing `budget.codeCalls` and then dropping it: it was changed; 50-backlog lists it.
- #10's "lists it and its test": four files, not two (#67).

## D. Not changed, with reasons

- The review's scenario A counted `check`/`format`/`review` as ceremony. v3 lists them as **work
  commands** beside the ceremony count because a naked model also runs tests; both numbers are
  reported, so nothing is hidden by the split.
- The review suggested either "amend 30 §9" or "make `format` model-run". v3 does both: `format`
  is model-run **and** 30 §9 names the one remaining outside write (`.gitignore` by `init --apply`).

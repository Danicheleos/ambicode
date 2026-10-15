# Optimization phase: status and working rules (as of 2026-10-14)

This page is the progress record. Plans live in `plans/`, run analyses in `analysis/`, raw data in `raw/`. Other material (memory snapshots, investigation notes) is in the subfolders, not here.

## Goal

Beat bare on every case on quality, cost and speed. Bare is Sonnet 5.5 at effort low with no plugin.
- Quality: on the old toy cases, quality must never drop below bare.
- Cost and speed: on the old toy cases, matching bare counts as a win.
- The plan is `plans/2026-10-12-optimization-phase.md`, phases 0–4. **Stop before phase 4**, which is the implementer subagents (user, 2026-10-14).

## Where we are

| Phase | Status |
|---|---|
| 0. Cost and time accounting | Done: `analysis/2026-10-12-phase0-accounting.md` |
| 1. Realistic fixture and cases bare fails | Done. `ts-app-medium`, investigate-trace, plan-reuse, task-multi and review-subtle are in: `analysis/2026-10-13-phase1-bare.md` |
| 2. Context diet | Done. Rules are filtered by activity and `appliesTo`; prose cut; policies normalized (001b7ba): `analysis/2026-10-13-phase2-*.md` |
| 3. Overhead first, then skill tuning | **In progress**, see below |
| 4. Implementer subagents | Do not start |

### Phase 3 so far

1. **S1–S3, batch A (review), review fixes:** committed as 258b391. Auto review is dropped from evals (8498e0c).
2. **Navigator: in the backlog.**
   - It was built, measured and rolled back to 8498e0c on 2026-10-14. It lives on a separate branch.
   - Measured on the real set: recall was flat, precision +0.088, and cost went from $0.085 to $0.111. Learning notes gave no gain (Δ recall −0.005).
   - Running it on every investigate broke the answers: the note-update step's status became the final message.
   - It is unsolved how to insert it in a route. The map gives too narrow a scope (about 2 files) and the navigator too wide (about 52 files). It has never been tried on real tasks.
   - The user hopes a better navigator brief will strengthen investigate and plan.
   - **If it is revived, never restore a confidence skip.** A confident map that skipped the navigator fenced the model in and caused the plan-reuse failure.
3. **The eval history now records session and API time.** `evals/scripts/context.mjs` and `track.mjs` gained `sessionSeconds` and `apiSeconds`. The harness `seconds` also counts setup and graders. These changes are uncommitted.
   - Rollback check ×1, 12 shared cases: the plugin scored 0.946 at $0.094, session 24.3 s. Bare scored 0.757 at $0.068, session 17.6 s.
4. **rules-migrate regression: fixed by option 2.** The user decided that a team's rule outranks a built-in one: "build-in is just an init template".
   - Text changed: `routes/rules/draft.md`, `routes/README.md:66`, `skills/init/references/rules.md:14`, `skills/rules/SKILL.md`.
   - ×3 result: 0.778 → 0.926. "Never log request bodies" is migrated in 3/3 runs.
   - Run 2 still failed rules-faithful. Its packs were correct, but the final message showed rule ids only (batch A item 3).
5. **S4, the fixed-prefix diet: dropped as a cost lever.**
   - In 8 real sessions (223–1730 calls, mean context 134k–180k), 900 tokens are 0.51–0.69% of cache reads, and the whole plugin prefix is under 2%. The saving shows only in evals of 2–10 calls.
   - It was replaced by: cut injected text only where a trace shows it misled the model. See `plans/2026-10-14-s4-prefix-diet.md`.
6. **Grader audit and two investigations:**
   - `analysis/2026-10-14-grader-audit.md`
   - `analysis/2026-10-14-review-callers.md`
   - `analysis/2026-10-14-plan-reuse.md`
7. **Batch A: implemented 2026-10-14, uncommitted.** Verify green: 1137 tests, 1136 pass, 0 fail, 1 skipped. The paid ×3 has not run yet. Seven fixes, each with a cause from a trace:
   1. The completed-route closing line names the recorded gate answers and promoted paths. Today 3/4 plan-accept finals call an accepted plan a draft. plan SKILL.md says "accepted = route recorded Accept".
   2. `record-answer.ts` parses the last JSON block that parses. A two-block answer whose first block was invalid failed a whole review.
   3. The `rules apply` table lists each rule's instruction.
   4. The `context write` lines are removed from the route steps (0 calls in 21 runs; they contradicted investigate SKILL.md). The rules SKILL.md "asked about first" line is aligned with the draft step.
   5. `review/readback.md` keeps every `path:line` as printed. Today 5/34 runs lose caller paths in the readback.
   6. The review brief gets a "Callers outside the diff" block: nearest declaration, then `refs`. In 4/34 runs the reviewer never searched callers; bare does in 9/9.
   7. The `context.list` line becomes "read the notes of touched modules and of shared helpers". The failing plan-reuse run read only "the one file you need".

### Cleanup A–E + B6 ×3, all 17 cases (2026-10-15, run 2026-10-14T23-04-41-104Z)

The A+B+C+D+E part is committed as 777ef6b. B6 is uncommitted. Mean score went from 0.968 to 0.970, and total cost per pass from $1.773 to $1.676. The baselines are each case's previous ×3, dated 10-12 to 10-14.

| case | score before → after | $ before → after | note |
|---|---|---|---|
| review-subtle | 0.711 → 0.889 | 0.101 → 0.088 | callers-block revert fixed it |
| plan-reuse | 0.879 → 0.939 | 0.193 → 0.231 | 1 of 3 plan-quality fail, as before |
| plan-draft | 1.0 → 0.905 | 0.111 → 0.104 | run 1 stopped at design: the body now ends on "the plan stays a draft" (B2 removed its Then line) |
| rules-migrate | 1.0 → 0.926 | 0.103 → 0.107 | run 3 judge noise (the final meets every condition); 2 of 3 runs ran the printed `route next` after `rules apply` had completed the route |
| init-auto | 0.926 → 0.889 | 0.155 → 0.179 | check-wired 0/3 (known) |
| task-multi | 1.0 → 1.0 | 0.183 → 0.115 | 10 → 4.7 calls |
| others | unchanged | flat or lower | |

Two fixes followed (uncommitted): the design.md last line now says "continue the route", and a last step that has a product no longer prints `route next` (`endingCommand`, test at rules-route.test.ts:177). The ×3 rerun:
- plan-draft: 1.0, $0.134, 7.3 calls. All 3 runs wrote the body.
- rules-migrate: 0.926, $0.101, 5.7 calls. `route-not-open` appeared in 0/3 runs, down from 2/3. The one failure is judge noise again: the final message meets all three grader conditions and the votes were FAIL FAIL PASS. Whether to reword `rules-faithful` is the user's call.

### Design and write merged into one plan step (2026-10-15, uncommitted, rollback copies in raw/patches/merge-plan.before/)

The merged ×3, compared with the previous ×3:

| case | score | $ | calls | session s |
|---|---|---|---|---|
| plan-accept | 1.0 → 0.939 | 0.134 → 0.113 | 7.7 → 5.7 | 37.0 → 27.6 |
| plan-draft | 1.0 → 1.0 | 0.134 → 0.115 | 7.3 → 6.3 | 29.2 → 29.8 |
| plan-reuse | 0.939 → 1.0 | 0.231 → 0.193 | 10 → 7.3 | 58.6 → 43.7 |

- plan-accept failed because a plan named ruled-out files under Assumptions.
  - Restoring "in any section" did not help. The rerun scored 0.879 at $0.161, again naming legacy/reports files in Assumptions; one of its two failures was judge noise.
  - What fixed it: the Assumptions line itself now says "A file read and ruled out goes unnamed here too, even as unaffected." The step text is 1499 characters.
  - The ×3 after that fix: 1.0, $0.116, 6.3 calls, 29.1 s, 0 forbidden names.
  - Final text, ×3 each:
    - plan-draft: 1.0, $0.112, 7.0 calls, 27.9 s.
    - plan-reuse: 0.939, $0.205, 7.3 calls, 46.8 s. Its one failure is the known reuse miss: a new `validateNotBefore` instead of `validateRange`. No forbidden name.
  - **Kept.** Quality matches the pre-merge runs on all three cases. Cost is down 11–17%, with 1.4–2.7 fewer calls. `npm run verify` is green: 1121 tests, 1120 pass, 0 fail, 1 skipped.
- The rules-faithful grader was reworded (case version 2). rules-migrate scored 1.0 ×3 after it.

## Next

1. Batch A report: verify must be green, plus the $0 checks.
   - Then a paid ×3 on plan-accept, plan-reuse, review-subtle, review-clean, rules-migrate and investigate-how, about $1.8. **Ask first.**
2. More skill tuning, from the audit list only.
3. **Fewer calls per route.**
   - This is the cost and speed lever that matters in real sessions: each round trip is a full turn the user waits on.
   - Candidate: merge plan's design and write steps and run plan-check from a hook. That saves 2 `route next` calls per plan run (inferred).
4. Then re-decide the navigator. Phase 4 needs the user.

## Open user decisions and known items

- **Grader wording is the user's call:**
  - review-subtle finding-correct shows judge noise in 2/11 runs: the right caller was named and the judge still failed it.
  - plan-quality "name no file under …" is literal.
  - task-multi `test-added` is LLM noise.
- **Do not raise init-auto `check-wired`** unless the user asks.
- **Policies scoped to the actual work** (e.g. no component rules for a template-only change):
  - Already mostly in place. Packs match by `appliesTo` against the touched files (else the map's candidates; else no scoping, so it never stops). The reviewer and report stages see the real touched set.
  - The gap: the change step's before-work rules come from the map's guess, and matching is per pack.
  - It cannot be measured on the fixtures, whose packs are all `common-*` with `**`. Measure on a real Angular repo before building anything. The old plan-time boundary version was dropped as slow and brittle.
- **Shortening policy text** (plan 2.5 KB, task 3.0 KB) means editing `policies/*`, which needs the user's say. The gain is unmeasured.
- **The bare plan-reuse runs score 0/3 plan-quality** although bare reads the helper's file in 6/9. Not investigated.

## Working rules (from the user, kept across sessions)

**Process**
- Report, wait, apply: one approval per step.
- Never launch a reviewer; the user runs reviews.
- Ask before every paid run.
- Run ×3 for skill checks and ×5 only for drift.
- Rebuild (`npm run build`) before evals. Evals run `scripts/ambicode.mjs`, not `src/`.
- Work as overseer: implementation goes in Sonnet subagents (effort medium). When a fix is unclear, run an investigator subagent first.
- Use targeted tests while working, and `npm run verify` only at hand-off.

**Git**
- Git is read-only for Claude and subagents: no stash, checkout, reset, restore, add, commit or branch (deny rules in `.claude/settings.local.json`). The user commits.
- For a before-run, write the test first or copy files to the scratchpad.

**What to build**
- Every feature needs a real, observed cause: a trace, a run or a measured cost. Hypothetical reviewer scenarios are not a cause.
- Change before add: edit the existing code that produces the behaviour. Report the line delta.
- Language-agnostic: derive levers from the measured repository profile. No ecosystem tables, and no TS/Angular hardcoding; the TS fixtures are only the bench.
- When step wording is followed only halfway, try a short generic worked example before adding more prose.
- Drift must be stable on its own. Never propose a band relative to bare.

**Code and tests**
- Comments: at most 3 lines, only for behaviour that isn't obvious, with no history or iteration names.
- Never weaken assertions or raise caps silently. The route step text cap is 1500 characters.

**Out of bounds unless the user says so**
- Never edit `gym/planing/**`, `evals/cases/**`, `evals/scripts/cases.mjs`, graders, `policies/*` or `fixtures/contexts/**`.
- Never edit a reviewed design version; copy it to vN+1 with a CHANGELOG.

**Data**
- NDA: benchmark data stays in gitignored `archive/` or `../ambicode-evals-assets`. Committed analyses carry case ids and numbers only.
- `claude plugin eval` runs only with `--no-publish`.

## Tools made this session ($0)

- `raw/tools/firststep.sh <case>` (copied from the scratchpad; edit its `S=` path before use) materializes a case and replays SessionStart and UserPromptSubmit. It prints the exact first step message.
  - `raw/tools/first.mjs <trace dir>` prints the first-call input tokens per trace.
- `node evals/scripts/breakdown.mjs --latest evals/cases/results/traces` gives per-case calls, injected bytes and time.

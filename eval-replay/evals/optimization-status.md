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

### plan-reuse validateRange miss: option B tried and rolled back (2026-10-15)

- Analyses:
  - `analysis/2026-10-15-plan-reuse-validaterange.md`: 7 of 21 runs miss; none of the misses opened range.js.
  - `analysis/2026-10-15-plan-reuse-option-choice.md`: B chosen over A.
- B reworded the reuse sweep bullet: "open files named for that helper kind". The ×3 scored 0.939 at $0.207 and 8 calls. Run 2 still missed: it listed range.js in a `wc -l`, read date.js and index.js, and wrote `validateDueDate`.
- That met the agreed reject rule (1 or more misses in 3), so design.md is restored from `raw/patches/design-before-B.md`.

### Bare baseline refreshed ×3 (2026-10-15, run 06-55-42)

Cost now excludes the judge, and session seconds are recorded. Each case is listed as bare vs the plugin's latest ×3, as score, $, session s and calls:

| case | bare | plugin |
|---|---|---|
| plan-accept | 0.733, 0.063, 17.0, 3.0 | 1.000, 0.116, 29.1, 6.3 |
| plan-reuse | 0.733, 0.112, 25.5, 4.7 | 0.939, 0.207, 46.0, 8.0 |
| review-subtle | 0.481, 0.078, 20.2, 4.3 | 0.889, 0.088, 24.8, 2.0 |
| task-fix | 0.667, 0.044, 4.7, 3.0 | 1.000, 0.086, 14.5, 5.7 |
| task-multi | 1.000, 0.110, 27.4, 9.7 | 1.000, 0.115, 22.7, 4.7 |
| investigate-trace | 0.958, 0.104, 20.4, 5.0 | 0.944, 0.111, 17.2, 3.0 |
| review-clean/defect/regression | 0.667–0.8, 0.045, 8.1–8.8, 2 | 1.0, 0.07, 7.8–11.1, 2 |
| investigate-files/how/nomatch | 1.0, 0.051–0.054, 6.8–8.9 | 1.0, 0.050–0.074, 5.4–9.1 |

- The plugin is slowest relative to bare on task-fix (3.1×), plan-reuse (1.8×) and plan-accept (1.7×).
- It is faster on task-multi, investigate-trace and investigate-nomatch.

### Plan Write hook: built, measured, rolled back (2026-10-15)

- The PostToolUse(Write) hook with an `if: Edit(**/.ambicode/tasks/*/steps/plan-body.md)` filter never advanced the route in 9/9 eval runs. The step text "only if nothing arrives" then made the model wait, so 8/9 routes stalled.
  - plan-accept 0.727, plan-draft 0.857, plan-reuse 0.818.
  - The profile showed the most it could save was about 1.1 s and $0.004 per plan run, because `route next` is usually batched with the Write.
  - Rolled back from `raw/patches/plan-hook.before/`.

### Profiles (2026-10-15)

- `analysis/2026-10-15-plan-time-profile.md` and `analysis/2026-10-15-task-fix-time-profile.md`.
- The user keeps the cache-write growth and the post-route summary. The task-fix mirror-test naming is not worth it. The full-suite gate on `check` without `--file` is not worth it (0 of 255 checks ran without `--file`).

### Guard: `| head` on ambicode calls (2026-10-15, uncommitted, rollback in raw/patches/guard-head.before/)

- Commands that print no step (refs, context, help, config, …) now pass `| head` through.
- Step-printing commands (route start/next, check, note save, …) get allow plus `updatedInput` with the `| head` cut. This happens only when every other segment is on a harmless list; otherwise the old deny stays.
- The guard bundle cap was raised from 24864+512 to 26818+512 (+1954 bytes).
- ×3: plan-accept 1.0, $0.117, 30.7 s, 6 calls. plan-reuse 0.939, $0.209, 50.0 s, 7 calls.
  - "Nothing ran" denials: 0 of 6, down from 3 of 6.
  - The rewrite path was not exercised: no step-printing `| head` occurred, so `updatedInput` under `-p` is still unverified at runtime.

### plan-reuse grader v3 (2026-10-15)

- ×3: 0.939, $0.240, 59.8 s. Run 1 made 2 automatic plan-check rewrites ($0.323, 13 calls, 85 s). The judge voted FAIL FAIL PASS on run 1's plan.
- Probe: the same plan with the same v3 rubric got 7/7 PASS from a plain Haiku call. The eval judge is also Haiku with 3 votes and sees only the focus file, but its wrapper prompt is undocumented. The result is not clear, so the judge stays as it is (user's option 2): plan-quality noise is accepted, and plan-reuse is tracked by whether plan-body.md reuses `validateRange`.
- User rule: a rerun or regeneration needs a human's approval, and headless accepts the first version. This covers all skills. The automatic loops are `plan-check → revise design`, `check-citations → revise read`, and task's `review-run`/`report-step → revise fix`. Applied: `onFail: record` (plan-check, check-citations, rules drafts check run once). The task review→fix loop is kept.
- ×3 after the change: plan-accept 0.909 $0.123 34.4 s; plan-draft 1.0 $0.108 24.2 s; plan-reuse 1.0 $0.207 51.7 s; investigate-how 1.0 $0.061 8.1 s.
  - plan-accept run 3 failed anchors on its first attempt (2 line-out-of-range), was accepted, and closed as "complete, 1 items not verified". The final message could not name the gap because the end print gave only the count. Fixed: the end print now lists the gaps.
  - plan-accept run 1: the first Write went to the sandbox cwd, not `repo/`, so plan-check crashed on the missing plan-body.md (script-failed). That is a sandbox artifact and was not acted on.

### Unattended tuning rounds (2026-10-15, $15 budget, $10.59 spent)

Each round: paid run, then a $0 investigator, then a fix with its test.

- **Sweep 1 (all 17 ×3, $5.07)** after the one-attempt commit.
  - The end-print "Name each…" text set off the Stop-hook section check, costing review-skipped one extra call in 3 of 3 runs. Fix: the end print carries the same Evidence and Not verified sections the hook checks.
  - The rules drafts were invalid on the first attempt. Fix: pack-format.md now has the pack-level `source`, a line on which keys go on the pack and which on a rule, and an example draft (unrelated to the fixture).
  - plan-draft patched its own plan with Edit. Fix: the plan-body guard rule allows Write only and prints the exact `route next` command.
- **Round 1 ($1.62).** review-skipped back to 1 call. rules-migrate 0.593: all 3 runs had an unquoted YAML `quote:` containing `: `, so the pack failed to parse (`pack-unparsable`). Fix: the example quotes every `quote` and `instruction` value, with one line saying why.
- **Round 2 ($1.28).** rules-migrate 1.0. plan-accept 1.0 after plan-check accepted the line after the last one as an append point (9 of 14 historical bad anchors were exactly that; +2 past the end still fails). plan-reuse 0.939, with judge noise on plan-quality.
- **Round 3 ($0.89).** `check --file repo/x` typed from the directory above the repo used to resolve to `repo/repo/x`, giving "No tests found" in 3 of 9 task runs. Fix: the CLI keeps the shell's directory as `invokedFrom` and retries the path against it. task-fix, task-review-skipped and task-multi were all 1.0, with 0 "No tests found".
- **Injected-bytes audit ($0).** All safe trims together save about 0.55 KB per run (~$0.0003), so none were applied. The cost gap is extra calls (refs sweep, test and check, report) and cache writes, which buy the quality lift.
- **Sweep 2 (all 17 ×3, $4.89).** Everything is at 1.0 except init-auto (check-wired, not to be raised), plan-accept 0.879, plan-reuse 0.939 and review-subtle 0.933. Lowest cost so far: review-skipped $0.044/2.4 s, rules-migrate $0.091, task-multi $0.115/28.4 s.
  - plan-accept: 2 of 3 plans named ruled-out files ("`src/legacy/…` is not changed"). Fix: a counter-example in design.md, `(no "x is not changed" line)`.
- **Round 5 ($1.91).** plan-accept ×5 1.0, with 2 of 5 plans still having one ruled-out line, which the judge accepted. plan-reuse ×5 0.927 (plan-quality 3/5; the plans name installments.js as unrelated). plan-draft ×3 1.0. The 95 s run spent 53 s on a model `find /` and is noise.
- **Infrastructure.** The harness refuses an eval directory with more than 20,000 entries. The 129 pre-10-15 trace directories were moved to `../ambicode-evals-assets/archive/eval-traces/plugin/`, and the 4 all-errored history rows were dropped.

### Cost drivers and the ignored-directory line (2026-10-16)

- Analyses: `analysis/2026-10-16-cost-drivers-plan-task.md` and `analysis/2026-10-16-cost-drivers-review-investigate.md`. The delta is mostly cache writes of new tokens (56-67%), not turns. What remains (quality-buying reads, the test and check, the plan file, the reviewer) is accepted by the user as the baseline. The other cuts were judged not worth it at 1-10% each with quality risk.
- Probe ($0.004): Claude Code's Glob does not skip git-ignored directories, even inside a git repo.
- Tried: `context.list` gained the line "Ignored by git; Glob does not skip them, so scope patterns away: …", computed with `git ls-files -o -i --exclude-standard --directory`. Ran task-fix, task-review-skipped and task-multi ×3 ($0.93). The line was delivered, but the model still globbed `repo/**/*.test.js` in 6 of 6 task-fix and task-review-skipped runs. No effect, so it was rolled back; git.ts and common.ts are identical to HEAD again.

- Second try (user: "init sets files & folders from gitignore, then the list is used to ignore"; "not global, per project"): `projects[].ignored`, filled by init's scaffold from `git ls-files -o -i --exclude-standard --directory`, and a PostToolUse Glob hook that replaces the result through `updatedToolOutput` (a $0.003 probe confirmed the model sees the replaced output). Task ×3 ($0.79): every Glob returned only repo files. task-fix $0.1034 → $0.0747, review-skipped $0.0817 → $0.0754, multi $0.1182 → $0.1122 (no Glob in multi, so ±5% is noise). Scores 1.0. Kept. Caveat: `truncated` stays true, so Claude Code still prints "Showing the first 2 files; there are more than 2 matches"; no extra narrowing calls were seen.

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

## Phase 4: implementer subagent (2026-10-16)

`change` and `fix` run in `ambicode:implementer` (agents/implementer.md); the main session gets a launch line, the work file `steps/work-<step>.md` holds the request, rules and payload. A check at a delegated step does not advance the route; the PostToolUse Agent hook advances it on return. Two adversarial reviews (9 + 7 findings) fixed before the second paid run.

```
task ×3, Sonnet 5.5 low   inline (10-15 17:51)   implementer v1 (12:49)   implementer v2 (16:14)
task-fix                  1.00 $0.075 29s        0.963 $0.120 45s         1.00 $0.101 34s
task-multi                1.00 $0.112 43s        0.75  $0.138 54s         1.00 $0.150 61s
task-review-skipped       1.00 $0.075 23s        1.00  $0.106 37s         1.00 $0.092 28s
main context peak         21.2-27.9k             19.5-19.8k               19.3-19.5k
main model calls          4.7-5                  2.7                      2
```

v1 → v2, per trace (scratchpad trace-sum): route text reaching the subagent 6/9 → 0/9; wasted subagent reads (missing relative path, ledger, payload files) 2-4 → 0 per run; main-session `route next` fallbacks 3 → 0. task-multi graders repository-fixed/status-synced/test-added 0.33 → 1 (the request now reaches the work file); the subagent does the whole request (16-18 calls), so task-multi cost rose. Delegation still costs +23-35% on these fixtures: the subagent pays its own prefix. Hook additionalContext is not in the trace; the ledger shows `write delivered … implementer-hook, channel hook`.

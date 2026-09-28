# Push it to the limit — eval error analysis (working notes)

Working dir for this workstream. Sibling notes: `notes-course.md` (course
digest), `notes-anthropic-docs.md` (official docs digest), `timeline-*.txt`
(per-run tool timelines), `perrun-*.txt` (per-run P/R/F1 and review recall).

Harness: `npm run evals` = curated core suite, 18 cases (10 localize, 8
review), with/without ablation, 1 run each, -j 4. ~$18–20, ~17 min.
Model in the sandbox: claude-opus-5-5. Tools in the sandbox:
`Task, Bash, Glob, Grep, Read, Skill, TaskStop, ToolSearch` — **no LSP**,
**no Write/Edit**. Plugin under test is loaded from the live checkout:
`scripts/ambicode.mjs` is executed by absolute path inside the sandbox, so
no rebuild or skill edit during a sweep.

## Baseline (sweep 2026-09-28T13-30, plugin 0.3.3 post-refactor, before this work)

```
localize  with   P=0.65 R=0.75 F1=0.64  turns 15.4  $0.55/run
localize  without P=0.67 R=0.75 F1=0.65  turns 12.7  $0.46/run
review    with   recall 0.094 (2/19 threads raised)  turns 17.1  $0.64/run
review    without recall 0.25  (4.5/19)               turns 15.4  $0.59/run
```

Verdict, no mercy: **the plugin buys nothing on localization and looks
worse on review, at +20–46% cost.** But the review number is not a plugin
measurement at all (next section).

## Finding 1 — the armed review arm never runs the review pipeline

All 8 armed review runs: `plugin-fired` true, `helper-ran` false. Seven of
eight say why in their first sentence (trace text):

> "The review CLI writes `.ambicode/reviews/` into the repository, and you
> asked me not to edit anything, so I'll review the diff directly instead."

Cause chain:

1. Harness prompt ends with "Do not edit anything." (evals-bench.mjs:273).
2. skills/review/SKILL.md Scope: "The only things it writes are
   `.ambicode/reviews/<id>/` in the repository and a disposable snapshot
   directory outside it." The agent reads that as an edit.
3. In the benchmark scaffold `.ambicode/reviews/` is not gitignored (`init`
   was never run there), so `git status` would show it as `??`.

Consequence: the "with" arm is *skill text + contract loaded, then a hand
review*. It measures prompt-context effects, not the reviewer. And even if
the pipeline ran, the sandbox hides the login: verified on a local replica
with `HOME=<empty>`: `status: error`, `reviewer.detail: "reviewer-error …
Not logged in · Please run /login"` — every `ambicode review` inside the
sandbox ends there. So today the review eval **cannot** score the plugin's
reviewer, in either direction.

Fix plan (two halves, both needed):

- Skill: say plainly that the review record under `.ambicode/reviews/` is
  the review's own output, not a change to the code; a request to change or
  edit nothing refers to the code and does not block a review. And when the
  reviewer itself cannot start (`reviewer-error`, not logged in, spawn
  failure), report that first, then review the pinned change yourself from
  the bundle, labelled as not independent — never silently, never as clean.
- Harness: record the real reviewer's answer per curated review case outside
  the sandbox and replay it inside (`EVAL_AMBICODE_REVIEWER_REPLAY`, exact
  `snapshotId` match). snapshotId is deterministic across scaffolds
  (verified: two scaffolds of be-vs-6261 → `working-aeb146932d6df2ed` both
  times, same headSha). Script: `evals/scripts/src/evals-record-core.mjs`
  (new), recordings at `benchmarks/reviewer-recordings.json` (gitignored,
  outside denyRead, never named in an agent command).

## Finding 2 — localization: prepare's shortlist is weak, agents truncate it, and the with arm over-lists

- **Shortlist quality.** be-vs-5766 (REBA ticket): agent terms
  `manuallyOverriddenCvValues, edit_wizard, scorecard` → 3 candidates, all
  NOM files, all wrong; truth is 7 REBA files. `locate.ts` matches whole
  terms/compact forms only; "manually overridden values" never meets
  `manuallyOverrideCvValues`. Both arms missed the same 4/7 files here — the
  ticket's words don't name the boundary, and the shortlist adds nothing.
- **Truncation persists.** 9/18 armed localize runs in each of the last two
  sweeps pipe `prepare --json` through `head -c 4000/6000`, typed a priori
  into the first command. Reorder saved the navigation block; what falls
  off is policy rules — which `investigate` barely needs anyway.
- **Over-listing.** fe-vs-6253 with: 15 files named (4 true, P=0.27), six of
  them tagged "(optional)"; without: 7 named (P=0.57). fe-vs-6269: 10 vs 11.
  be-vs-6140: 6 vs 8 (with better). Mixed, but "optional" entries are pure
  precision loss under a "which files would the change touch" question.
- **Agents ignore Read/Grep/Glob tools**: 78 Bash vs 14 Read + 20 Grep + 1
  Glob across the 8 armed review runs; `cat -n`, `sed -n`, `grep -rn` in
  Bash instead. `readGuidance` ("spans, not whole files") is followed via
  `sed -n a,bp`, so the tool names in the skill prose are beside the point.
- **Cost.** Armed localize +3 turns and +$0.09/run on average; the extra
  turns are the prepare call and the note-saving/report ceremony.

## Finding 3 — LSP

- Sandbox: none (documented impossibility). Every eval run is the fallback
  path; nothing measured here says anything about LSP.
- This session: `LSP workspaceSymbol` on this repo works (typescript server
  live). So the skill's LSP guidance can only be tested by hand in an
  ordinary session. The guidance is abstract ("LSP tools for definitions,
  references, callers"); an agent that has never used the `LSP` tool gets
  no recipe: which operation first, how to get line/character for a symbol,
  when to stop. Candidate: a concrete 3-step recipe (workspaceSymbol(term) →
  goToDefinition → findReferences/incomingCalls) in prepare-output.md.
  Unmeasurable in the sandbox; out of scope for the two-eval budget.

## Finding 4 — both arms miss what humans raise (recall ≤0.25)

Human threads are mostly project-pattern concerns: "we don't store display
values in DB schemas", "put the middleware at the router root", DTO shape
conventions. Both arms hunt for logic bugs and acceptance-criteria gaps.
The reviewer role prompt says "Do not report … preferences the project has
not adopted", and packs are `inherited`; the contract forbids reporting
`observed`/`inherited` rules without independent evidence. That is the
right rule for precision, but it means the pipeline is *designed* not to
raise what these reviewers raised unless the team packs encode it. This is
a policy-content gap (no `team` packs in the benchmark configs), not a
skill-prose gap.

## Iteration 1 (before sweep 2)

1. Review skill: the two clauses above (records are not edits; reviewer
   cannot start → labelled fallback).
2. Recordings for the 8 curated review cases; `evals-bench.mjs run` sets
   `EVAL_AMBICODE_REVIEWER_REPLAY` when the file exists.
3. Investigate skill: for "which files" questions, `## Files` holds only
   files the change must modify; may-touch files go in one separate line.
4. Not doing: LSP recipe (unmeasurable), shortlist algorithm (CLI change,
   bigger than a skill edit; noted for later), prepare truncation (nothing
   left to lose that investigate needs).

## Thread taxonomy behind the review graders (19 threads, read from threads.json)

Hand-labelled from the comment bodies:

```
convention / style ("use HttpStatusCode enum", "PascalCase enum keys",
  "avoid MaterialModule", "provideMatFormFieldConfig", "move to a model
  file", "middleware at router root", "reuse isManualReport$",
  "don't store display values in DB schemas", "redundant content-type",
  "redundant router binding")                                        10
questions to the author ("why was the approach changed?", "why pass
  fields rather than req/res?", "script to populate existing reports?",
  "leave a comment why")                                              4
design / duplication ("input unnecessary, control has it", "coupled
  if..else", "response DTO lacks method")                             3
correctness ("formControlName across component boundary",
  "validator: per-cycle needs cycle time")                            2
```

So "recall against humans" here is mostly recall of *team conventions*.
The pipeline's reviewer is instructed not to report preferences the
project has not adopted, and the benchmark configs carry only `inherited`
builtin packs — no `team` pack encodes any of these ten conventions. A
naked opus agent guesses some of them from surrounding code; the pipeline
is designed to stay silent on them. That makes this metric an argument for
**policy content** (team packs built from past review threads), not for
skill prose, and it caps what any prose change can move here.

## Sweep 1 (2026-09-28T16-18, plugin 0.3.3 HEAD, before iteration 1) — $18.78, 987 s

```
localize  with    P=0.68 R=0.78 F1=0.69  turns 14.2  $0.48
localize  without P=0.71 R=0.68 F1=0.63  turns 11.9  $0.42
review    with    recall 0.09 (raised 0.25/case)  turns 16.8  $0.66  helper-ran 0/8
review    without recall 0.16 (raised 0.5/case)   turns 14.5  $0.57
meanDelta -0.014, casesPassed 10/18 (exit 1 on threshold)
```

Localize flipped sign vs the 13-30 sweep (F1 +0.06 now, −0.01 then): one
run per case is inside the noise; per-case swings of ±0.3 F1 between sweeps
on the same arm (be-vs-5928 without: 1.00 → 0.50; be-vs-5766 without: 0.60
→ 0.44). Review: 7/8 armed runs again refused `ambicode review` for the
"do not edit" reason; the 8th (fe-vs-6292) never fired the plugin.

## Recording the reviewer (iteration 1)

- `npm run evals:record`: 4/8 recorded first pass (sonnet, $0.35–0.60 and
  295–667 s each); replay verified locally on be-vs-6261 (`reviewer.status
  ok, source replay, 1 finding`, same snapshot id as the sandbox scaffold).
- 1 case lost to a temp-dir cleanup race (ENOTEMPTY under .git/objects);
  fixed with retrying, non-masking cleanup; re-recorded.
- **3 of 4 FE review cases are refused by the pipeline itself**:
  `snapshot-too-large`, every changed `main/assets/i18n/*.json` (15 files,
  300–535 KB each) is over the 262,144-byte per-file ceiling, which no
  setting raises. docs/review.md already knows the shape ("a 390,029-byte
  translation JSON"). In the real FE repo every MR that touches
  translations hits this. Recorded with `--exclude 'main/assets/i18n/**'`;
  the id is patch-derived so any exclusion removing the same files replays.
  outcomes.md now says: when every named file is a locale bundle, lockfile
  or build output, exclude at once and report it as not reviewed; ask only
  when a named file is source.

## Prod review, MR !2696 (inseer-frontend), 0.3.1 vs 0.3.4 — logs in archive/logs/

Same pinned revision both times: `mr-2696-v2052447149-fa727001bf4a`, 77 of
94 files included, 5,164 changed lines.

```
                 reviewer   cost    turns  findings  user-accepted  agent tool calls  questions  review launches
0.3.1 (VS-5813)  369 s      $1.52   26     3         —              15                1 (i18n)   2
0.3.4 (+VS-5812) 438 s      $1.83   27     4         0/4            21                2 (MCP, limits) 3
```

- **Precision 0/4 (user's labels).** Same three themes in both runs, so it's
  systematic: hex colour drift (`#3f3f3e` vs `#3A3A3D`), torque shown in N·m
  against a documented code comment, bare `.subscribe()` on a one-shot
  delete whose error the API service already notifies (`tap`/`catchError`,
  the service is in the diff and was read). 0.3.4 added "wizard preloads
  two unused SVGs". None names a failure a user would see.
- **MR mode gives the reviewer changed files only** ("Only changed files are
  present"). Shared components (`app-score-card-container`, facades, pipes)
  are listed in coverage notes as unreadable. A reviewer that can't verify
  cross-file behaviour drifts to local, verifiable nits.
- **Parent epic.** `claude_ai_Atlassian` (0.3.1) returned VS-5813 without a
  `parent` field; `plugin:atlassian` (0.3.4) returned `parent: VS-5812`.
  skills/shared/requirements-mcp.md says nothing about parents. The user
  passed the parent by hand in 0.3.4. Adding the epic (3.7 KB vs 0.6 KB of
  requirements) did not improve findings.
- **Limits surface one at a time.** 0.3.4: `input-too-large` (files/lines),
  user chose raise, then `snapshot-too-large` (i18n) on the next launch.
  One pass reporting both would save a launch.
- **Iteration-1 change observed working:** 0.3.4 excluded the i18n bundles
  at once and reported them as not reviewed; 0.3.1 asked the user.
  Not exercised: no-edit clause, investigate Files, LSP.
- Minor overreach: user approved raising the file/line limits; the agent
  also raised `review.timeoutSeconds` 300 → 900 unasked.
- Existing discussions: 22, all GitLab system notes, already filtered out of
  the reviewer prompt (section empty). No cost there.

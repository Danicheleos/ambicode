# Evals: skill coverage

One synthetic case per behaviour each skill must show, graded from the ledger and the files the run leaves, with
a history row per case per run. Nothing here is real project data: every case runs on a fixture from
`fixtures/definitions.mjs`, so the suite is tracked in git and a bare `claude plugin eval .` runs it.

The previous suites (benchmark tickets, trigger boundary, tuning harness) are under `archive/evals/` and are not
run any more: real tickets were unstable from run to run and could not be committed.

```
evals/
  cases/<skill>-<name>/   case.yaml, prompt.md, scaffold.sh, graders/*.md   (claude plugin eval layout)
  cases/results/          raw harness output, gitignored
  scripts/run.mjs         builds the harness argv, runs it, then tracks the result
  scripts/track.mjs       one history row per case; rewrites history.md
  scripts/suite.test.mjs  static checks over every case (part of npm run test:unit)
  history.jsonl           one row per case per run, appended, tracked in git
  history.md              latest row per case with the delta to its previous row
```

## Run

```sh
npm run build                                   # the cases run scripts/ambicode.mjs, not src/
npm run evals                                   # 13 cases, 1 run each, Sonnet 5.5, $15 cap, 4 in parallel
npm run evals -- --case 'review-*'              # one skill (a glob on the case name; --case is not repeatable)
npm run evals -- --tag gate --runs 3            # by tag; more runs per case
npm run evals -- --ablation with-without        # add the no-plugin arm (skill cases mostly cannot pass without it)
npm run evals:dry                               # print the harness command and change nothing
npm run evals:track -- <result.json> --model <m>  # record a result produced by hand
```

The first full run (2026-10-10, Sonnet 5.5, 1 run per case) is the first row of `history.jsonl`; `history.md` shows
its cost per case. Two probes before it: `task-fix` $0.14 and 11 turns, `init-auto` $0.18 and 8 turns.

## Cases

| Case | Fixture | Shows |
| --- | --- | --- |
| investigate-how | ts-feature-boundary | note saved, citations valid, the answer names the service and the route, decoys excluded |
| investigate-files | ts-feature-boundary | the file list is the invoice boundary, not the keyword decoys |
| investigate-nomatch | ts-feature-boundary | the scope gate is raised on an empty map and nothing is invented |
| plan-accept | ts-feature-boundary | draft written with six fields and valid anchors, promoted on Accept, no code touched |
| plan-draft | ts-feature-boundary | without an answer the plan stays a draft and is not called accepted |
| task-fix | eval-page-bug | red check before green, format, reviewer subagent, review recorded, report sections, fix and test correct |
| task-review-skipped | eval-page-bug | the review offer defaults to skip and the report says so |
| review-defect | ts-off-by-one | reviewer subagent, a finding with its location, part 4 fenced |
| review-clean | py-clean-docstring | no false defect, verification gap still stated |
| review-regression | ts-source-regression | a check is recorded, the broken unchanged test is found |
| review-skipped | ts-off-by-one | the estimate gate defaults to skip, no reviewer, no finding |
| rules-migrate | eval-rules-contributing | drafts checked and applied, quotes verbatim, the vague line and the embedded `rm -rf` instruction ignored |
| init-auto | ts-feature-boundary (installed, no config) | scaffold, scout subagent, context files, checks wired, config validated |

Every route case fixes its task with `--task <slug>` so graders can name `repo/.ambicode/tasks/<slug>/ledger.jsonl`
(reviews: `repo/.ambicode/reviews/<slug>/`): the harness resolves no globs in file paths. Gate answers are typed in
the prompt (`--headless --answer <gate>=<option>`), which the UserPromptSubmit hook records as trusted preanswers;
a case without an answer measures the default.

## Graders

Structural graders read the ledger or a produced file (`type: regex` with `target: {source: file, path}`), the
trace (`tool_used`) or created files (`file_exists`); they are free. One or two `llm` graders per case judge
what no regex can (the answer is right, the fix is right, the gap is stated); they are judged by Haiku, three votes.

| Grader family | Reads | Means |
| --- | --- | --- |
| route-done | ledger `exit … reason done` | the route reached its end |
| note-saved, citations-valid | ledger `note`, `worker check-citations … failed:false` | the answer was saved and every `path:line` exists |
| red-before-green | ledger `check` entries | a failing check was recorded before a passing one |
| review-recorded, finding-recorded | ledger `review … stage recorded`, `findings:N` | the reviewer's answer went through `review record` |
| reviewer-invoked, scout-invoked | trace `Agent` tool with `ambicode:<agent>` | the subagent ran, the model did not stand in for it |
| *-defaulted, *-gate-raised | ledger `default-taken`, `gate` | the gate behaved without an answer |
| no-edit, no-git-mutation, instruction-not-obeyed | trace `Edit`/`Write`/`Bash` with `max: 0` | the skill stayed inside its boundary |

A case score is the weighted share of its graders that passed; the harness's own threshold is 1.0, so the exit
code is 1 unless every case is perfect. Read `history.md` rather than the exit code.

## Adding a case

1. A fixture: reuse one or add an `eval-*` entry to `fixtures/definitions.mjs` (committed state, passing tests).
2. `evals/cases/<skill>-<name>/` with `case.yaml`, `scaffold.sh` (copy a sibling's), `prompt.md` starting with
   `/ambicode:<skill> --task <slug> …`, and graders. Ledger entry shapes are in `src/platform/ledger/kinds.ts`.
3. `node --test evals/scripts/suite.test.mjs`, then `npm run evals -- --case <name>`.

Keep a case to one behaviour and under 15 graders. A grader that cannot fail measures nothing; a grader that
always fails is a finding about the plugin and belongs in a ticket, not in the suite forever.

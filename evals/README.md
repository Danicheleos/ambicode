# Evals: skill coverage

Seventeen synthetic cases, at least one per skill, each checking one behaviour. Twelve of them also run with no
plugin loaded, which is the baseline. Every case runs on a fixture from `fixtures/definitions.mjs`, so nothing
here is real project data and the whole suite is in git. The previous benchmark suites are in `archive/evals/`
and are not run any more.

```
evals/
  scripts/cases.mjs       the single source: every case, its prompt per arm, its graders
  cases/<case>/           plugin arm, generated (claude plugin eval layout: case.yaml, prompt.md, scaffold.sh, graders/)
  bare/<case>/            no-plugin arm, generated: same request in plain words, shared graders only
  scripts/run.mjs         runs one arm through `claude plugin eval`, then tracks the result
  scripts/track.mjs       appends one row per case to history.jsonl and rewrites history.md
  scripts/context.mjs     reads the context size from each run's trace
  scripts/metrics.mjs     recall, precision and F1 of the files an answer lists (cases that declare `metrics`)
  scripts/chain.mjs       turn-by-turn chain of a run; after each run, of the longest one (chains/<arm>-longest.md)
  cases/results/          raw output of the last run per arm, and traces/<arm>/<case>-<n>.jsonl (gitignored)
  history.jsonl           every run, one row per case, in git
  history.md              latest plugin row and latest bare row per case, with the lift
```

## Run

```sh
npm run build                       # cases run scripts/ambicode.mjs, not src/
npm run evals                       # plugin arm: 17 cases
npm run evals:bare                  # bare arm: 12 cases, no plugin
npm run evals -- --case 'task-*'    # one skill (a glob; --case is not repeatable)
npm run evals -- --tag gate         # by tag
npm run evals -- --runs 3           # more runs per case, for a decision
npm run evals:dry                   # print both commands and change nothing
```

Defaults: Sonnet 5.5, effort low, 1 run per case, 4 runs in parallel, a $15 cap per arm. Override any of them with
`--model`, `--effort`, `--runs` or `--max-cost-usd`. The harness has no effort flag, so `run.mjs` sets
`CLAUDE_CODE_EFFORT_LEVEL` in the environment. A probe showed the variable inside the run. It does not prove the
model honoured it.

Each run also writes `evals/chains/<arm>-longest.md`, linked from `history.md`: the turn-by-turn chain of the run with the most turns.
Each line shows the time since the start, the context, the tool call and its result with the time it took. A gap of
30 s or more is marked ⏱. `node evals/scripts/chain.mjs evals/cases/results/traces/<arm>/<run time>/<case>-1.jsonl` prints the
chain of any other run.

## Recall, precision, drift

A case with `metrics` in `cases.mjs` is scored on the files its answer lists. The prompt asks both arms for a
`## Files` section, and only that section counts, because answers also name decoys in order to rule them out.
- **Recall** is the share of the `relevant` files the list names.
- **Precision** is the share of listed files that are `relevant` or `allowed`.
- **F1** combines the two.

A run with no Files section scores recall 0 and F1 0, and is counted separately.

With `--runs N`, the `Runs` section of `history.md` lists every run of the latest row: score, recall, precision, F1,
turns, context, cost, and the files missed and extra. A spread line under it gives mean ± sample standard deviation.
That section is where drift on one task shows.

Raise a case's `version` whenever its prompt or graders change. A lift is shown only between rows of the current
version.

Each run appends to `history.jsonl` and rewrites `history.md`. Read `history.md`, not the exit code. The harness
exits 1 whenever any case scores below 1.0.

## How a case works

1. **Scaffold.** `scaffold.sh` replays a fixture into `repo/`, a fresh git repository with known history. The
   plugin arm also commits `.ambicode/config.yaml`. `--install` fixtures run `npm ci`, so jest and eslint are real.
2. **Prompt.** The plugin arm types the skill exactly as a user would, for example
   `/ambicode:task --task fix-page --headless --answer review-offer=run Fix page() …`. `--task` fixes the slug so
   graders can find the ledger. `--answer` pre-answers a gate. A case with no answer tests the gate's default. The
   bare arm sends the same request in plain words: "Fix page() …", or "Review the uncommitted change in `repo/`".
3. **Graders.** They run after the session ends, on what it left behind:
   - `regex` on the ledger (`repo/.ambicode/tasks/<slug>/ledger.jsonl`), on a produced file, or on the final message.
   - `tool_used` on the trace, for example the `Agent` tool with `ambicode:reviewer`, or "never `git commit`".
   - `file_exists` for files the run created.
   - `llm` when only judgment works: is the answer right, is the fix right, is the gap stated. Haiku judges with
     three votes.
4. **Score.** The weighted share of graders that passed.

## Plugin against bare

Graders come in two kinds:

- **Shared graders** judge the outcome: the answer, the code, the review finding, the boundary (no edits, no git).
  They run in both arms.
- **Plugin-only graders** check what only AMBICODE writes: ledger entries, the reviewer subagent, report sections.
  They run in the plugin arm only.

`history.md` shows four numbers per case:

| Column | Meaning |
| --- | --- |
| plugin | Full score of the plugin arm. |
| outcome | Shared graders only, in the plugin arm. |
| bare | Shared graders in the bare arm. |
| lift | outcome − bare. Shown only when both rows ran the same model and effort. |
| turns | Model turns, plugin / bare. |
| context k | Largest context the main session sent the model in one call, in thousands of tokens (input plus cache), plugin / bare. `history.jsonl` also keeps `contextFinal`, the last call's context. Subagent calls are left out, because the trace records only some of them. |

Five cases have no bare arm because what they test belongs to the plugin: a gate default (`plan-draft`,
`task-review-skipped`, `review-skipped`), policy packs (`rules-migrate`) and `init-auto`.

## Cases

| Case | Fixture | Checks | Bare |
| --- | --- | --- | --- |
| investigate-how | ts-feature-boundary | note saved, citations valid, the answer names the service and route, decoys excluded | yes |
| investigate-files | ts-feature-boundary | the file list is the invoice boundary, not the keyword decoys | yes |
| investigate-nomatch | ts-feature-boundary | the scope gate is raised on an empty map, nothing invented | yes |
| plan-accept | ts-feature-boundary | six-field draft, valid anchors, promoted on Accept, no code touched | yes |
| investigate-trace | ts-app-medium | a payment flow that reaches notifications only through the event bus; the legacy hook is not part of it | yes |
| plan-reuse | ts-app-medium | the plan reuses shared validation, money and the reports module and leaves legacy alone | yes |
| plan-draft | ts-feature-boundary | with no answer the plan stays a draft and is not called accepted | no |
| task-fix | eval-page-bug | format, reviewer subagent, report sections, fix and test correct | yes |
| task-multi | ts-app-medium-refund-bug | a fix across payments service and repository with AppError and the test factory | yes |
| task-review-skipped | eval-page-bug | the review offer defaults to skip and the report says so | no |
| review-defect | ts-off-by-one | the off-by-one is found with its location | yes |
| review-subtle | ts-app-medium-money-change | the broken caller outside the diff is named, the bare Error is flagged | yes |
| review-clean | py-clean-docstring | no false defect, verification gap stated | yes |
| review-regression | ts-source-regression | a check is recorded, the broken behaviour is found | yes |
| review-skipped | ts-off-by-one | the estimate gate defaults to skip, no reviewer, no finding | no |
| rules-migrate | eval-rules-contributing | drafts checked and applied, the vague line and the embedded `rm -rf` ignored | no |
| init-auto | ts-feature-boundary, no config | scaffold, scout subagent, context files, checks wired, config validated | no |

## Change or add a case

1. Edit `evals/scripts/cases.mjs`. Use an existing fixture or add an `eval-*` one to `fixtures/definitions.mjs`.
   Wrap a grader in `shared(...)` when a bare run could pass it too. Pass a second grader when the bare arm reads
   the artefact somewhere else, like `plan-quality`, which reads the plan file in one arm and the message in the
   other.
2. `npm run evals:generate`. It rewrites `evals/cases/` and `evals/bare/`, so never edit those by hand.
   `suite.test.mjs` fails when the trees drift from `cases.mjs`.
3. `node --test evals/scripts/*.test.mjs`, then `npm run evals -- --case <name>` and, if it has a bare arm,
   `npm run evals:bare -- --case <name>`.

Keep a case to one behaviour and under 15 graders. Ledger entry shapes are in `src/platform/ledger/kinds.ts`. Graders
must name literal paths, because the harness does not resolve globs.

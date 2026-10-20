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
  scripts/run.mjs         runs one arm through `claude plugin eval` and leaves the result in `cases/results/`
  scripts/context.mjs     reads context size, session and model seconds, and session cost from each run's trace
  scripts/trace.mjs       trace parsing and `mean`, shared by the scripts below
  scripts/metrics.mjs     recall, precision and F1 of the files an answer lists (cases that declare `metrics`)
  scripts/breakdown.mjs   where a run's calls, tokens, seconds and injected bytes go (`npm run evals:breakdown -- <trace.jsonl | dir>`)
  cases/results/          raw output of the last run per arm, and traces/<arm>/<stamp>/<case>-<n>.jsonl with the run's ledgers in `.ambicode` beside it, without the `context/` copy (gitignored)
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

Read a run in `evals/cases/results/<arm>.json` and its traces under `results/traces/<arm>/<run time>/`; the plugin-master viewer shows both.

## Navigator cases

Ten ordinary cases (`fe-vs-<id>-navigator`; the asset folders keep their `fe-vs-<id>-investigate` names) on the NDA bench repo in `../ambicode-evals-assets`, rendered by
`scripts/navigator-cases.mjs` (also run by `npm run evals:generate`) into `evals/cases/navigator/` (plugin arm) and
`evals/bare/navigator/` (bare arm). Both are gitignored: they hold ticket text and truth paths. Without the assets the generator
prints one line and skips; env `NAV_BENCH`, `NAV_CASES` override the sibling-directory defaults.

```sh
npm run evals -- --tag navigator        # plugin arm, one harness call, -j 4
npm run evals:bare -- --tag navigator   # bare arm
```

- Each run starts with the bench copied into a fresh git repo and no `.ambicode/`. The plugin arm's scaffold copies the
  bench's `.ambicode/context/` back in, because the navigator reads only that; the bare scaffold copies nothing.
- The prompt is the ticket plus one instruction, the same for both arms: return the files as a ```files block. The plugin arm
  measures the navigator alone: `allowed_tools: [Agent]`, no `--allow-tools` shell grant, and an `append_system_prompt` that makes
  the session call `ambicode:navigator` once in the foreground and copy its paths unchanged (grader `navigator-called`). The harness
  has no main-agent option, and its tool lists bind subagents too, so the session keeps the read tools; the relay text forbids using them.
- Score = recall over the truth folders. The nav truth (logic files; i18n and fixtures dropped; companion files dropped except that a companion-only directory becomes a directory item) is collapsed to its unique folders, and a folder is covered when any line of the first ```files block is that folder, lies under it, or is an ancestor directory (or a file directly in one) with at least 30% of the source folders under it covered by the truth (`ancestors` in `truth.json`, computed from the bench at generation; the 0.3 is a choice, not measured). One regex grader per truth folder. Step graders (`files-block`, plugin-only `navigator-called`) weigh 0.0001 each, so
  score = (hits + 0.0001 * steps passed) / (|T| + 0.0001 * steps) is within 1e-4 of recall. Precision and F1 come from
  `truth.json` in the case dir (nav truth `relevant`, the rest `allowed`, plus `level: 'folder'`, `ancestorShare` and the `ancestors` map, which the graders and `scoreNavigator` read). `run.mjs` writes `recall`, `precision`, `f1`, `missed`, `extra` and `contract` into each run's `metrics` in the result JSON, computed by `scoreNavigator` in `navigator-cases.mjs` from the trace's first ```files block and `truth.json`. Recall is pinned to the recall graders (passed / total); if the computed value differs, the grader value is written and `mismatch: true` is set.
- `--tag navigator` is one `claude plugin eval` call at the default `-j 4`, like any other selection: the cases share no state.
  The result goes to `cases/results/<arm>.json` and, with the metrics, to `cases/results/<stamp>/aggregate-result.json`
  (bare: `cases/results/bare/<stamp>/`), which the viewer reads.
- Navigator cases run only with `--tag navigator`: an unfiltered run lists the skill tags instead (the harness has no exclude option).


## Recall, precision, drift

A case with `metrics` in `cases.mjs` is scored on the files its answer lists. The prompt asks both arms for a
`## Files` section, and only that section counts, because answers also name decoys in order to rule them out.
- **Recall** is the share of the `relevant` files the list names.
- **Precision** is the share of listed files that are `relevant` or `allowed`.
- **F1** combines the two.
- Navigator cases do not use `scoreFiles` (it stays file-level, for the skill cases). `scoreNavigator` in `navigator-cases.mjs` computes recall, precision and F1 by the folder rule and `run.mjs` writes them to the result JSON; a viewer reads them generically from `metrics`. The rule: a file counts as its directory, a truth folder is covered by an answer folder equal to or under it, or above it when at least 30% of the source folders under that ancestor (directories holding a logic file) are covered; an answer folder is correct when related the same way to a folder of `relevant` or `allowed`.

A run with no Files section scores recall 0 and F1 0, and is counted separately.

Read the result files, not the exit code. The harness exits 1 whenever any case scores below 1.0.

## How a case works

1. **Scaffold.** `scaffold.sh` replays a fixture into `repo/`, a fresh git repository with known history. The
   plugin arm also commits `.ambicode/config.yaml`. `--install` fixtures run `npm ci`, so jest and eslint are real. `--context` also writes
   `fixtures/contexts/<fixture>.md` into the gitignored `.ambicode/context`, standing in for the scout (8 of the 17 cases).
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

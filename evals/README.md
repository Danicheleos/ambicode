# Evals: skill coverage

Seven synthetic cases in `scripts/cases.mjs`, each checking one behaviour; 5 of them also run with no plugin
loaded, which is the baseline (`CASES.length` and the cases whose `bare` is not null). The live tree holds 28 plugin and 20 bare case directories (`find evals/cases -name case.yaml | wc -l`, and the same for `evals/bare`): the 7 and 5 that `CASES` holds now, `init/` (5, no generator), and the gitignored `suite-investigate/` (5 each), `suite-real/` (5 each) and `task-chain/` (6 plugin, 5 bare) (7 + 5 + 5 + 5 + 6 = 28 plugin; 5 + 5 + 5 + 5 = 20 bare). `suite-investigate/`, `suite-real/` and `task-chain/` are real project data (gitignored, rendered by `real-cases.mjs` and `chain-cases.mjs` from `evals/local/`); every other case runs on a fixture from `fixtures/definitions.mjs` and is in git. `scripts/downstream-cases.mjs` can add five more runnable cases (`downstream`), rendered from a bench checkout into the gitignored `evals/cases/downstream/`; that directory is absent here. Two offline map bench suites (`bench/map`, and `evals/local/bench/map-k12` once `map-k12-cases.mjs` has written it) score `search map` without a model; `claude plugin eval` and the plugin-master Evals view see only the session cases under `evals/`. The previous benchmark suites are in `../eval-archive/evals/` (outside the repository) and are not run any more.

Grader rules: see [GRADERS.md](GRADERS.md) before writing or changing any case or grader. The blind-judge protocol that decides quality and the gate is `evals/local/judge/PROTOCOL.md` (gitignored); `node evals/scripts/judge-inputs.mjs <stamp>...` lists each run's judge inputs.

```
evals/
  scripts/cases.mjs       the single source: every case, its prompt per arm, its graders
  cases/<suite>/<case>/   plugin arm, generated (claude plugin eval layout: case.yaml, prompt.md, scaffold.sh, graders/); the suite is the case name's first word (rules, review, plan); `map/` and `downstream/` come from their own generators
  bare/<suite>/<case>/    no-plugin arm, generated: same request in plain words, shared graders only
  scripts/run.mjs         runs one arm through `claude plugin eval` and leaves the result in `cases/results/`
  scripts/context.mjs     reads context size, session and model seconds, and session cost from each run's trace
  scripts/trace.mjs       trace parsing and `mean`, shared by the scripts below
  scripts/metrics.mjs     recall, precision and F1 of the files an answer lists (cases that declare `metrics`; source `changed` scores the workspace diff that harvest snapshots, as the `task-real` cases do)
  scripts/breakdown.mjs   where a run's calls, tokens, seconds and injected bytes go (`npm run evals:breakdown -- <trace.jsonl | dir>`)
  cases/results/          raw output of the last run per arm, and traces/<arm>/<stamp>/<case>-<n>.jsonl (gitignored); each run's `.ambicode` workspace copy (ledgers, `context/`) goes to `../eval-archive/` at the same relative path, or `$AMBICODE_EVAL_ARCHIVE` (inside the repo they pushed evals/ past the 20,000-entry limit of `claude plugin eval`)
```

## Run

```sh
npm run build                       # cases run scripts/ambicode.mjs, not src/
npm run evals                       # plugin arm: the 12 cases of cases.mjs (+ downstream once `downstream-cases.mjs` rendered it; none in this tree)
npm run evals:bare                  # bare arm: 10 cases of cases.mjs (+ downstream when rendered), no plugin
npm run evals -- --case 'review-*'    # one skill (a glob; --case is not repeatable)
npm run evals -- --tag gate         # by tag
npm run evals -- --runs 3           # more runs per case, for a decision
npm run evals:dry                   # print both commands and change nothing
```

Defaults: Sonnet 5.5, effort low, 1 run per case, 4 runs in parallel, a $15 cap per arm. Override any of them with
`--model`, `--effort`, `--runs` or `--max-cost-usd`. The harness has no effort flag, so `run.mjs` sets
`CLAUDE_CODE_EFFORT_LEVEL` in the environment. A probe showed the variable inside the run. It does not prove the
model honoured it.

Before each case `run.mjs` prints `preflight: evals/ <n> entries` (it refuses to run at 20000 or more) and one line per bench repository
(env `NAV_BENCH` and `K12_BENCH`): the absolute path, marked `(missing)` when the directory does not exist.
Briefs need not locate the repositories, and nobody should `find /` for them.
`--max-cost-usd` is one total per command, checked before each run launches. The runs of a case start in parallel (`-j 4`), so one command can overshoot it by up to the runs in flight.
A `--case` or `--tag` that matches no case fails the command (exit 1, `--case/--tag matched no case: <value>`). A paid grader the harness skipped for the cost ceiling is left out of the run's score; the run gets `partialGrading` and `skippedGraders`, and the summary prints one `warning:` line per such run.

A series of one-case commands reports progress: pass every command the same `--series <case1,case2,...>` plus its own `--case <name>` (`npm run evals -- --series a,b,c --case a`, then `--case b`, ...). Each command updates `evals/cases/results/running.json` (series id, arm, per-case queued/running/done/failed, score, cost, `finishedAt` once all are done), which the plugin-master Evals view shows. A different list or a finished file starts a new one; without `--series` a lone `--case` is a one-case series. The file has no `schemaVersion`, so the viewer does not list it as a run, and a write failure only warns.

A $0 load check of one case is `npm run evals -- --case <name> --model <fake> --load-check` (add `--bare` for the bare arm). `--load-check` sends the result, traces and copies to a scratch folder under `.tmp/load-check/` and deletes it, together with the `<stamp>/report.html` folder the harness itself leaves under the eval dir, so `plugin.json`, `bare.json`, `running.json` and the earlier run folders are untouched. It prints `load check <arm> <case>: loaded; prompt N chars, N graders, N runs reached the harness` plus each run's error (with a fake model: the model's rejection, after the scaffold built the workspace), and exits 1 when the case has no prompt or graders or its scaffold failed. Without the flag a fake-model run overwrites the shared summaries like any other run.

`npm run evals -- [--bare] --regrade <stamp>` is a $0 re-score of a finished run: it re-reads the stamp's `aggregate-result.json` (`results/<stamp>/`, or `results/bare/<stamp>/` with `--bare`), re-folds the `changed` metrics and the diff graders from the `changed` list and `.diff` file the run names, and rewrites that file. No model is called and the llm verdicts stay; `results/<arm>.json` is not touched.

Read a run in `evals/cases/results/<arm>.json` and its traces under `results/traces/<arm>/<run time>/`; the plugin-master viewer shows both.


## Map bench (offline, no model)

`scripts/map-bench.mjs` runs the bundled `ambicode route start investigate` in a scratch clone of the bench repository (its `.ambicode/config.yaml` and `context/` are copied in, so the search index `folders.jsonl` is the one the context holds; a change to the index code is measured on a bench repository whose `context/search/` is removed, or the stored index is read as it is), takes the files of the printed map and scores their folders against each case's `truth.json`. It prints one row per case, the means (all, tune, hold) with the top-8 columns, and where the target folders were lost (absent from the pool, cut, printed, in the top 8). Results go to `evals/cases/results/map-bench/<stamp>.json`. Nothing is paid for.

```
node evals/scripts/map-bench.mjs --bench <repo>                                  # the ten fe-angular cases, bench/map
node evals/scripts/map-bench.mjs --bench <repo> --cases evals/local/bench/map-k12      # a second repository: its own cases directory
node evals/scripts/map-bench.mjs --bench <repo> --case 6141 --top 8              # one case (id or name substring)
```

`--bench` defaults to env `NAV_BENCH`; `--cases` is a directory of `<name>/{prompt.md,truth.json}`. The repository needs `.ambicode/` with a config and `context/` (run `/ambicode:init`, or `ambicode context index` for the search index alone). To bench a second repository, write tickets and truths into a new directory under `bench/` (not `evals/`: a directory there holding `prompt.md` counts as a session case) (the bench reads only `prompt.md` and `truth.json`; `truth.json` holds `relevant`, `allowed`, `ancestors`, `ancestorShare`) and pass it with `--cases`. The two generators below show two ways to produce one:

- `map-cases.mjs` (ten tickets of the fe-angular bench): truths come from each ticket's merge request and are corrected against the bench checkout, which cannot hold files the MR created. It drops, and lists in `truth.json` (`dropped`, `bench.head`), files the MR created (`created`), files gone from HEAD (`removed`) and non-code targets (`nonCode`: html/scss/json/md/images, and directories whose source files are all of those), then recomputes `ancestors`. `prompt.md` is the ticket text only. Source: env `MAP_SOURCES` (default `eval-archive/navigator-case-sources`, `fe-vs-<id>-investigate/{prompt.md,truth.json}`; the directory keeps its old name); the numbering is `CASE_ORDER` in `folder-truth.mjs`. `NAV_BENCH=<bench repo> node evals/scripts/map-cases.mjs`.
- `map-k12-cases.mjs <checkout>`: five synthetic tickets over a Python backend (cases are written to the gitignored `evals/local/bench/map-k12`), truth from the source folders each first-parent merge touched, tickets in a product person's words.

`scripts/folder-truth.mjs` holds what all of them share: `CASE_ORDER`, `folderTruth` (logic files, companion-only directories as directory items), `ancestorShares` and the folder scorer `scoreFolders`. `map-funnel.mjs` is the bench's lost-target accounting. There is no navigator agent any more, so no agent-based map case exists.

Reference means (F1 over the ten fe-angular cases, 2026-10-26, 0.6.27 map): all .418 (recall .554, precision .394; top 8 .415); second stack `map-k12` .522 (recall 1.0, precision .356; top 8 .619).

## Downstream cases (real bench, end to end)

`scripts/downstream-cases.mjs` turns five corrected map cases (6141, 3571, 6404, 5967, 6292: the first three by choice, then the two with the most reachable targets) into `fe-vs-<id>-downstream`, written to `evals/cases/downstream/` (plugin arm: `/ambicode:investigate <ticket>`, with the bench's `.ambicode/config.yaml` and `context/`) and `evals/bare/downstream/` (bare arm: same request, no skill). Both gitignored.

`scripts/real-cases.mjs` renders `task-real` cases (tag `task-real`: a past merge of a bench repository, the task stated as a user would) to `evals/cases/task-real/` and `evals/bare/task-real/` (gitignored: the scaffold names the local checkouts). The cases are data about those repositories and are never in git: they live in `evals/local/real-cases.json` (gitignored; `REAL_CASES_FILE` points elsewhere), whose shape the header of `real-cases.mjs` documents, and the checkout of each repository comes from the env var that file names: `<ENV>=<checkout> node evals/scripts/real-cases.mjs`. Only the variants of `KEEP` in real-cases.mjs are rendered (since 2026-10-29: `19-...-k12-report-settings-plan`, `22-...-k12-celery-email-plan`, `30-...-k12-recognition-notifications`, the last one raw, tag `task-real-raw`), under the directory numbers `KEEP` pins; the other 27 variants and the full `real-cases.json` are in `../eval-archive/task-cases-2026-10-29`. The scaffold is downstream-cases.mjs's, archiving the parent of the merge. The prompt states the outcome only. Each case yields three variants, `<name>-plan`, `<name>-inv` and `<name>` (tag `task-real-raw`: the task prompt alone, nothing seeded, no `plan-picked-up` grader): the plugin arm starts from a seeded accepted plan or investigation note in `.ambicode/tasks/<slug>/` (task-seeds.mjs), the bare arm has the same text in the prompt (the raw variant has none), and both prompts end with a sentence not to run builds, tests, linters or reviews (the plugin arm also has every configured check set to null by `config-checks-off.mjs`, and `--headless iteration 1` skips the review offer). Graders are regexes on fixed workspace files, `diff` graders (diff-graders.mjs: a regex over the added lines of the run's final workspace diff, which harvest saves as `<case>-<n>.diff`; scored by run.mjs after the harness and folded into the run's graders and score) for new files of any name, and one `llm` judge of weight 1 on the report (plugin arm: `.ambicode/tasks/<slug>/report.md`, the implementer's report, since the final message is one pointer line; bare arm: the final message); measuring ones fail on the parent and pass on the real merge, guards forbid the naive alternative and pass on the parent. `truth.json` (`source: changed`) is scored by run.mjs on the workspace diff; any rendered case that has one is scored, whatever its name (suite cases such as `task-k12-1016` do not start with `task-real-`). `real-cases.test.mjs` tests the generator on invented cases and, when the local file and the checkouts exist, checks every local case against its repository (read-only git show/diff/ls-tree); without them those tests skip.

`node evals/scripts/real-cases.mjs --cases <file>` renders any other cases file; a file may set `tag` (its own tree, e.g. `suite-real`, so `task-real/` is not cleared), `noRuns` (the no-checks sentence of both arms), and per case `promptFile` (ticket text read as-is, an empty one is an error), `investigationFile` (an investigation note read the same way, into `investigation`), `remove` (workspace files dropped before the scaffold's commit) and, on an llm grader, `focus` (a workspace file to judge). `node evals/scripts/real-cases-check.mjs --cases <file>` is the $0 contract check: it materializes the parent and the change with `git archive` and prints each non-model grader's verdict on the real change and on an untouched parent.

`scripts/chain-cases.mjs` renders the plan then task chain for the tickets named in its `PLAN_VALUES` (an empty list, as for the suite's `task-k12-1016` and `task-k12-1094`, grades stage 1 on `plan-accepted` alone; a ticket from a suite file starts from its frozen `.ambicode` material) (tag `task-chain`; cases in `evals/cases/task-chain/` and `evals/bare/task-chain/`, gitignored). Plan and task are two separate invocations, never one prompt: the plan route's closing forbids further route calls and skills have no automatic transition. The sequence, with `claude plugin eval` taking one prompt per case:

1. `<bench env vars> node evals/scripts/chain-cases.mjs` writes stage 1 (`<name>-chain-plan`: `/ambicode:plan ... --answer plan-accept=Accept <ticket>`, plan limits 30 turns / 900 s, plan-side graders only) and the bare arm (`<name>-chain`: the raw ticket). A ticket with `investigationFile` also renders `<name>-chain-plan-inv`, the plan started on that note (plugin arm only; no bare case, no stage 2). Run stage 1: `npm run evals -- --case <name>-chain-plan`.
2. `<bench env vars> node evals/scripts/chain-cases.mjs --from-stamp <stamp> [--from-stamp <stamp> ...]` writes stage 2 (`<name>-chain`, task limits) from the result stamp(s) of finished stage 1 runs: it copies the harvested `.ambicode/tasks/<slug>/` of each run (found under the eval archive's `traces/plugin/<stamp>/<case>-<n>.ambicode/`, see `harvest` in context.mjs) into the case's `seed/`, and `scaffold.sh` puts it into the sandbox before the prompt (`/ambicode:task --task <slug> --headless "Go ahead with the plan. ..."`). A stage 1 run whose plan is not `status: accepted` is refused; `report.md` and `summary.md` are not copied and the ledger is cut at the plan route's exit. Regenerating one stage keeps the other.
3. Run stage 2: `npm run evals -- --case <name>-chain`; the bare arm as before: `npm run evals:bare -- --case <name>-chain`.

The plugin-arm scaffold also runs `ambicode context index` after copying `context/`, so the search index exists at the archived HEAD and the first map does not build it cold.

```
NAV_BENCH=<bench repo> node evals/scripts/downstream-cases.mjs     # needs bench/map from map-cases.mjs
npm run evals -- --series <the five names> --case fe-vs-6141-downstream --runs 3 --max-cost-usd 6   # one command per case; add --bare for the bare arm
```

- The session directory is `git archive <bench.head from truth.json>` as a fresh one-commit repository (no history, so the ticket's own merge request is not in it): the session starts in the repository root, as in real use (the plugin arm also gets the bench's `.ambicode/config.yaml` and `context/`; the route ledger is `.ambicode/tasks/inv-<id>/ledger.jsonl`). The prompt asks for a `## Files` section in both arms; `routes/investigate/read.md` prescribes no heading, so the metric needs that line.
- The prompt is one line (ticket newlines collapsed to spaces), `/ambicode:investigate --task inv-<id> <request>` in the plugin arm: a multi-line prompt without a slug never fired the skill. The bare numbers taken 2026-10-23T19-14 to 20-55 used the multi-line prompt; re-run them for a like-for-like comparison if the one-line wording changes bare behaviour.
- Score by file: `truth.json` (`source: files-section`, `relevant`, `allowed`, the map case's corrected truth) is read by `run.mjs` (`downstreamMetrics`, `scoreFiles`) into each run's `metrics`: recall, precision, F1, `missed`, `extra`, `contract`. A directory item is hit by a file directly in it. Graders only check the contract (`files-section`, `no-edit`, plugin-only `route-done`, the ledger exit entry), each weight 1; the case score is not the retrieval score.

## Recall, precision, drift

A case with `metrics` in `cases.mjs` is scored on the files its answer lists. The prompt asks both arms for a
`## Files` section, and only that section counts, because answers also name decoys in order to rule them out.
- **Recall** is the share of the `relevant` files the list names.
- **Precision** is the share of listed files that are `relevant` or `allowed`.
- **F1** combines the two.
- The map bench does not use `scoreFiles` (it stays file-level, for the skill cases). `scoreFolders` in `folder-truth.mjs` computes recall, precision and F1 by the folder rule for `map-bench.mjs`. The rule: a file counts as its directory, a truth folder is covered by an answer folder equal to or under it, or above it when at least 30% of the source folders under that ancestor (directories holding a logic file) are covered; an answer folder is correct when related the same way to a folder of `relevant` or `allowed`.

A run with no Files section scores recall 0 and F1 0, and is counted separately.

Read the result files, not the exit code. The harness exits 1 whenever any case scores below 1.0.

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
   - `llm` when only judgment works: is the answer right, is the fix right, is the gap stated. The harness judges with
     three votes (`judgeVotes` in `aggregate-result.json`) on its default judge model, haiku (`claude plugin eval --help`:
     `--judge-model`, default haiku; the runner does not pass the flag).
4. **Score.** The weighted share of graders that passed.

## Plugin against bare

Graders come in two kinds:

- **Shared graders** judge the outcome: the answer, the code, the review finding, the boundary (no edits, no git).
  They run in both arms.
- **Plugin-only graders** check what only AMBICODE writes: ledger entries, the reviewer subagent, report sections.
  They run in the plugin arm only.

Two cases of `cases.mjs` have no bare arm because what they test belongs to the plugin: the two `rules` cases (`rules-cases.mjs`).

## Suites

Counts come from `scripts/cases.mjs` (`CASES`) and the generated trees, not from the old suite lists.

| Suite | Cases | Bare | Source |
| --- | --- | --- | --- |
| review | 4 (2 jvm, `review-ts-boundary`, `review-mono-clean-rust`) | 4 | `cases.mjs`, see Review cases |
| investigate | 5 (downstream) | 5 | none in `cases.mjs`; the 5 downstream cases from `downstream-cases.mjs`; the live investigate cases are `suite-investigate` |
| plan | 2 (`plan-app-vague`, `plan-policy-staged`) | 1 | `plan-cases.mjs`: `plan-app-vague`; `plan-policy-staged` is in `rules-cases.mjs` |
| task | 0 (the two synthetic cases were dropped 2026-11-08; the live task cases are `suite-real` and `task-chain`, gitignored, below) | 0 | none in `cases.mjs`; the other 20 older ones are in `../eval-archive/task-cases-2026-10-29` |
| rules (tag; the cases sit in the rules and plan suites) | 2 | 0 | `rules-cases.mjs` |
| init | 5 (`cases/init`, on disk only: no generator since d7ab5349, skipped by `suite.test.mjs`) | 0 | none |
| bench/map | 10 | offline | `map-cases.mjs`, scored by `map-bench.mjs` |
| evals/local/bench/map-k12 | 5 once written; absent here | offline | `map-k12-cases.mjs <checkout>`, second stack (Python) |

`bench/map` and `downstream` are gitignored and regenerated from a bench checkout; `evals:generate` does not touch them.

## Cases

| Case | Fixture | Checks | Bare |
| --- | --- | --- | --- |
| review-<stack>-<topic> (14) | the stack's `*-review-<n>` fixture | see Review cases below | yes |
| rules-draft-sources | policy-contributing | drafts checked and applied; the vague line and the embedded `rm -rf` ignored, the config left alone | no |
| plan-policy-staged | policy-ledgerly | the plan's policy row stages whole plan rules, the draft is delivered, `plan.md` cites each applicable rule once by id (`applied at` or `not applicable`) and respects a staged rule (llm) | no |

## Review cases

Four kept cases of the fourteen defined by the matrix (`evals/scripts/review-cases.mjs`; the other ten are in `../eval-archive` or dropped, `review-jvm-retire-rule` on 2026-11-08) review an uncommitted change of 48 to 91 added lines (blank lines included) on three init stacks (ts, jvm, monorepo) (`fixtures/review-changes.mjs`, fixtures `<base>-review-<n>`, numbered so a name says nothing about the defect). Three hold one main issue and two or three others, each from a category other than the main's, and every real issue in a diff is in the truth; `mono-clean-rust` is a clean control. Both arms get the same scaffold: config (`--ambicode-init`), conventions (`--context`) and, where the matrix assigns a team rule, a project pack (`--policy`, `fixtures/policies/<stack>.yaml`, authority `team`, listed under `policyFiles`). The lift measures the reviewer route, not the material.

Each case directory holds `review-truth.json`: `[{id, category, main, what, locations: [{file, lines}], anchors: [{ids, near | gap}]}]`, `[]` for a control. An issue has one or more locations (resolved from `find` strings in the fixture; the first lies inside the added lines of the working-tree diff, checked by `fixtures/review-fixtures.test.mjs`, the others may name code the change leaves alone, like the second limit a new constant duplicates) and anchors. Task names are neutral (`rev-<n>`) and the case description names no defect: the scaffold materializes only `repo/`, so nothing of the case directory is in the run's working directory.

- `found-<id>` (shared; `found-main` weighs 2, the rest 1): passes on any location or any anchor of the issue.
  - A location is the shortest trailing path that names one file of the repository (down to the basename), then a line, an `a-b` range or an `a, b` list that reaches the location's lines widened by three (`f.ts:12`, `f.ts (line 12)`, `f.ts:5-40`, `f.ts#L12-L20`).
  - An anchor is one of its identifiers (exact case, whole word) within 200 characters of one of its keywords (any case, standing alone: "latest" and a path such as `tests/test_x.py` are not "test"; an identifier may not supply its own keyword), in either order, for the report that names the problem without a line. A tests issue uses a gap anchor instead: the identifier and a phrase saying a test is absent ("no test", "untested", "tests missing"), so a remark that only mentions a test credits nothing. Issues whose windows share lines in one file declare it with `overlaps`.
  - The plugin arm reads `repo/.ambicode/reviews/<slug>/1/report.txt`, because the final message paraphrases the report and has dropped locations; the bare arm reads the final message. The same pattern runs in both arms.
- `main-nature`, `no-false-claim`: llm graders, shared. `no-false-claim` shows the judge the touched files, the real issues and the sound parts, and defines a false claim as a finding about a sound part, a claimed passing check that is not listed, or a finding outside the touched files. The harness runs 3 votes of one word on its default judge model (haiku; the exact id is not recorded in the results) and keeps no reasoning. The offline re-grade below is a different judge (`claude-haiku-5-5`, 5 votes).
- Controls: `no-high-risk-finding` (plugin only, `not_contains` a medium or high `risk` in `answer.json`) and the shared llm `no-defect-claimed`, which defines a false alarm as a finding of medium or high risk or a claim that the change is verified when no check ran.
- Plugin only: `reviewer-invoked`, `review-recorded`, `route-done`, `finding-recorded` (defect cases).

`review-cases.test.mjs` feeds every case synthetic outputs and asserts each deterministic grader: a perfect output (every issue cited as full path, basename, range, list and anchor only) credits every issue in both arms; one issue's exact citation credits only it and the issues it declares overlap with, and its anchor credits no other; the audit probes (a remark about one issue that used to credit another: "retested", "a unit test would have caught it", a generic id and keyword pair) credit only their own issue; an empty output, a clean report, an identifier alone, a citation moved ten lines and a citation of another file credit nothing; a control fails on a medium finding and passes on a low one.

The category-by-stack table of the full fourteen-case matrix went with the ten cases removed from the live set; the kept cases cover the categories their `REVIEW_TRUTHS` entries name.

`node evals/scripts/cases.mjs --case 'review-*'` rewrites just these cases. `review-cases.test.mjs` checks them at no cost; no paid run has scored them yet. Each fixture also builds and passes its own tests with the stack's toolchain (go build, vet and test; cargo check, clippy and test; gradle test; tsc and the tests; pytest) apart from the intended defects.

## Change or add a case

1. Edit `evals/scripts/cases.mjs`. Use an existing fixture or add an `eval-*` one to `fixtures/definitions.mjs`.
   Wrap a grader in `shared(...)` when a bare run could pass it too. Pass a second grader when the bare arm reads
   the artefact somewhere else, like a plan quality grader that reads the plan file in one arm and the message in the
   other.
2. `npm run evals:generate`. It rewrites `evals/cases/` and `evals/bare/`, so never edit those by hand.
   `suite.test.mjs` fails when the trees drift from `cases.mjs`.
3. `node --test evals/scripts/*.test.mjs`, then `npm run evals -- --case <name>` and, if it has a bare arm,
   `npm run evals:bare -- --case <name>`.

Keep a case to one behaviour and under 15 graders. Ledger entry shapes are in `src/platform/ledger/kinds.ts`. Graders
must name literal paths, because the harness does not resolve globs.

### Review run archive and offline re-grade

Every `review-*` run, in both arms, leaves `eval-archive/review-runs/<arm>/<stamp>/<case>-<n>/` (`$AMBICODE_EVAL_ARCHIVE` moves the root; `harvest` in `context.mjs` writes it beside the `.ambicode` copy): `final-message.md`, `trace.jsonl`, `meta.json`, and for the plugin arm `report.txt`, `answer.json`, `brief.md` and `changed.diff`. The regex graders stay the harness's fast signal. `node evals/scripts/review-regrade.mjs <run dir | <arm>/<stamp> | stamp>...` grades the same runs offline: it takes the findings of `report.txt` (deterministic split) or has the judge enumerate those of a free-text final message, then asks `claude -p` (`claude-haiku-5-5`, 5 votes, all votes stored) which one known issue each finding reports, or whether it is a real, arguable or false finding outside the list. It writes `review-runs/regrade/<time>/regrade.{json,md}`: recall (main, all, per category), outside-real, arguable and false findings, and the regex verdict beside each matcher verdict. `review-regrade-validate.mjs` scores the matcher on hand-labelled findings (`review-regrade-labels.mjs`: the audit probes plus one paraphrase per truth issue) before a baseline is graded; the judge budget is a hard stop (`--budget`, dollars).

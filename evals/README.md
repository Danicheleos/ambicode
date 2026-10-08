# Evals

| Folder | Holds | In git |
| --- | --- | --- |
| `evals/common/` | The shared suites (`core`, `task`, `triggers`, `archived`) and the reviewer recordings | suites under NDA are not; see `evals/.gitignore` |
| `evals/<project>/` | Per-project suites: `full/` (the generated full set), `impact/`, `reuse/` | no (NDA) |
| `evals/scripts/` | The harness (`src/`) and one-off local tools (`local/`, gitignored) | `src/` yes |
| `../ambicode-evals-assets/benchmarks/<project>/` | Static benchmark data, one folder per project: `.git/` (history), `project/` (code snapshot), `assets/` (tickets), `reviews/` (prepared review versions) | no (NDA) |
| `../ambicode-evals-assets/outputs/<eval type>/<date>/` | Raw run output: one `<NN>_<HHMM>_<label>/` folder per iteration with `results/`, `traces/`, `reports/`, and `iterations.md` with one row per iteration | no |
| `../ambicode-evals-assets/reports/<eval type>/<date>/<iteration>/` | Analyses written from the raw output | no |

`ambicode-evals-assets/` sits beside the repo, not in it: the harness walks the whole plugin directory for eval folders
and refuses one over 20,000 entries. `AMBICODE_EVALS_ASSETS` points elsewhere; scaffolds reach it by relative path,
so regenerate the suites after moving it.

Eval types: `core` (the average preset, run as `--set curated`), `full`, `task`, `archived`, `triggers`, `search-maps` (offline map scoring).
An iteration is numbered in start order within its date; its label is the tag or set, the plugin, the prompt arm and the model.

What each `npm run evals:*` command does, measures and is for: the manual below.
How to tune the plugin layer by layer, with pass thresholds per stage: [TRAINING-PLAN.md](TRAINING-PLAN.md).


# Eval commands manual

Every `evals:*` script in `package.json`: what it does, what it measures, and why it exists. Folder layout is in
[README.md](README.md). Case design is in [common/core/README.md](common/core/README.md).

Before any paid run, run `npm run build`. The evals run the bundle (`scripts/ambicode.mjs`), not `src/`.

## Which command to use

| Question | Command | Cost |
| --- | --- | --- |
| Did my change to `locate` or the map lose true files? | `evals:shortlist-recall`, `evals:map-recall` | free |
| Does the plugin still behave on real tickets? | `evals:walk` | ~$3 (estimate) |
| Is the plugin better than the bare model? | `evals:decide`, then `evals:gate` against `evals:baseline` | ~$80 (estimate) |
| What happened in a run, and where should I focus? | `evals:report` | free |
| Did Claude Code change under us? | `evals:baseline` | ~$80 (estimate) |
| How does it do on every ticket? | `evals:full` | up to $45 |
| How does each skill do on smaller or larger tickets? | `evals:presets`, then `run --set preset --preset light\|large` | set by `--max-cost-usd` |
| Does the right skill fire on each phrasing? | `evals:triggers` | ~$2.3 |
| Does the old synthetic suite still pass? | `evals:archived` | up to $10 |

Tiers go cheapest first. Only move up when the cheaper tier says the change is worth paying for.

## Building blocks

The other scripts call these. You rarely call them yourself.

### `evals:bench`

`node evals/scripts/src/harness/evals-bench.mjs`. This is the harness CLI. Its subcommands are `select`,
`generate`, `run`, `restore-prompts`, `score` and `walk`.

- `run` wraps `claude plugin eval` for the benchmark suites. It always passes `--no-publish`. It also refuses
  output outside the gitignored folders, because the cases hold NDA tickets and the harness would otherwise
  publish its report to claude.ai.
- `run` refuses a sweep without `--model`. On 2026-09-29, a model change was misread as a plugin change.
- `run` refuses a sweep without `--max-cost-usd`. An uncapped campaign once spent about $221.
- While a sweep runs, `run` copies every trace into the iteration. The harness deletes its sandboxes when it
  finishes, so a trace that was not copied is lost.
- `run` writes to `../ambicode-evals-assets/outputs/<type>/<date>/<NN>_<HHMM>_<label>/` and appends a row to `iterations.md`.
- `--dry-run` prints the plan and spends nothing.
- When a run finishes, its `results/plugin-eval/` (`report.html`, `aggregate-result.json`) is also copied to `eval-replay/<date>/<iteration>/` (gitignored); an existing copy is never replaced.

### `evals:run`

This is `evals:bench run` with `EVAL_AMBICODE_REVIEWER_REPLAY` pointed at
`eval-replay/core.json`. The independent reviewer cannot sign in inside the eval sandbox,
so the core review cases replay its recorded answers. Recordings made for the earlier core cases do not match
the current ones; record them again with `evals:reviewer` (below) before trusting review results.

### `evals:plugin-eval`

This is `claude plugin eval . --scaffold --no-publish` with the archived reviewer recordings
(`reviewer-recordings/archived.json`). It is the plain harness, used by the tracked synthetic suites
(`archived`, `triggers`). It has no NDA guards, so never point it at `evals/common/core` or at `evals/` as a whole.

## Cases

### `evals:select`

**Does:** fills `evals/common/core/cases/` with the core suite: the **average** preset, generated from
`../ambicode-evals-assets/presets/average/` exactly as `evals:presets` would. That is 76 cases on 20 merged
tickets: 20 investigate, 20 plan, 20 task and 16 review. It makes no model calls. `--regenerate` rewrites the
per-arm prompts; `--presets <dir>` reads another source.

**Measures:** nothing. `manifest.json` lists the cases per skill and the hash of each source ticket.

Eight cases are tagged `walk`: per project and skill, the eligible ticket that touches the fewest files.

The plugin prompts answer every route gate from `harness/eval-answers.mjs`: accept what the route proposes
(`plan-accept=Accept`, `draft-ok=implement anyway`, `estimate=run`), and decline extras after the requested
work (`review-offer=skip — verification incomplete`). Gates outside that table (scope, budget) get no answer, so
a run that reaches one takes its headless default, and `evals:gate` reports it as a `gate answers` gap. After
changing the table, run `select --regenerate`.

`--localize`, `--review`, `--candidates` and `--baseline` are refused: cases are no longer picked from
`benchmarks/<project>/assets/`. The earlier 18-case core and its lock are archived in
`../ambicode-evals-assets/archive/core-2026-10-07/`.

**Why:** one set of real tickets measures every skill on its own metric, and every core run calls `select` first, so the
cases always match the generator.

### `evals:generate`

**Does:** writes every ticket of each project into `evals/<project>/full/` (the full set). It makes no
model calls.

**Why:** gives `evals:full` its cases, and gives a source to curate from.

### `evals:presets`

**Does:** writes the light and large preset sets into `evals/common/presets/<preset>/`, and average into the core
suite (`evals/common/core/cases/`), from
`../ambicode-evals-assets/presets/`: one case per ticket and eligible skill (investigate, plan, task, review).
It makes no model calls. `--preset <name>` writes one set.

**Why:** gives each skill its own case on real merged tickets, scored by that skill's metric. Run them with
`npm run evals:bench -- run --set preset --preset light|large …`; average runs as the core suite. [common/presets/README.md](common/presets/README.md)
has the layout, the metrics and the bare-model arm.

`generate` needs `../ambicode-evals-assets/benchmarks/<project>/{assets,reviews}` and `project/.ambicode/config.yaml`
on disk. `select` and `evals:presets` need `../ambicode-evals-assets/presets/` and each project's `.git`.

## Paid runs on the benchmark

All of these use the plugin arm with `--ablation none`. The bare-model side comes from `evals:baseline`.

### `evals:walk` (also `npm run evals`)

**Does:** runs `select`, then the 8 `walk`-tagged cases: one per skill per project where the skill is eligible
(investigate, plan and task on both; review on both). It uses 1 run, Sonnet 5.5, `-j 4` and a $5 cap, and writes
`reports/walk.md` in the iteration.

**Measures:** per run, the cost, turns, skills fired, `prepare` use and score. It also records the **first
deviation** in trace order, which is the first of:

- a peek into `../ambicode-evals-assets/benchmarks/`;
- an edit to the code;
- `prepare` cut short;
- a re-run review;
- a helper error;
- no route started (neither a typed route in the ledger nor a Skill call);
- the turn limit.

**Why:** this is the cheapest way (an estimated ~$3) to see *how* a change behaves before paying to measure *how
much* it helps. Read the first deviations and note what you saw, not why.

### `evals:walk:haiku`

The same as `evals:walk`, on Haiku 4.5.

**Why:** checks that a change still works on the weaker model. Weaker models skip steps the stronger model
takes: Sonnet ran `prepare` in 3 of 50 runs where Opus ran it in 26 of 29.

### `evals:decide`

**Does:** runs `select`, then all 76 core cases. It uses 3 runs, Sonnet 5.5 and a $90 cap.
`--tag localize|plan|task|review` narrows it to one skill.

**Measures:**

- **Investigate (localize):** precision, recall, F1 and hit of the `## Files` list against the merged change's files.
- **Plan:** the same file metrics, read from the plan note, else from the final message.
- **Task:** the run's patch against the merged one: file P/R/F1, hunk and identifier recall.
- **Review:** recall of the human reviewers' inline threads, one LLM judge per thread, also per label. Precision is
  not measured: a concern no human raised cannot be graded.
- **All:** cost and turns.

[common/presets/README.md](common/presets/README.md) defines each metric.

**Why:** this is the decision run. Feed its result to `evals:gate` with the baseline. Three runs per case are
needed because one run is noisy by ±5–10 percentage points.

### `evals:baseline`

**Does:** runs `select`. Then `arms/naked-arm.mjs` builds `.tmp/naked`, a plugin with no components, and the
76 cases run against it. It uses 3 runs, Sonnet 5.5 and a $90 cap.

**Measures:** the bare model on the same cases and graders, with recall, cost and turns as in `decide`.

**Why:** the bare model's numbers depend on the model, the Claude Code version and the prompt, not on the
plugin. Run it once per Claude Code version or case set, then pin it with `npm run evals:bench -- lock <its eval.json>`.
`score`, `walk`, `gate` and `report` then compare every plugin-only run against the lock without another bare run.
Locking is per run, not per suite: each `lock` adds the cases of that run to the existing lock and replaces any case it
runs again, so the investigate, plan, task and review baselines can be locked one skill at a time. One lock holds one
model, Claude Code version and arm; a run on another is refused. The lock records each source result's hash, the model,
Claude Code version, and per case the prompt and truth hashes and the bare
means: recall, precision, cost, turns, tool calls, peak context and file reads (Read calls and Bash reads), the last three from the
traces beside the result. The run's effort is set by `CLAUDE_CODE_EFFORT_LEVEL` (the harness has no effort flag) and is not recorded in the result.
A changed or missing source, another model or version, an unknown case, a changed prompt or a changed truth is an
error naming the mismatch, never a fallback to another run. The harness cannot run a no-plugin arm on its own, so an
empty plugin stands in for it.

### `evals:full`

**Does:** runs `generate`, then `run --set full --project BE-express` and `--project FE-angular`. It uses 1 run,
Sonnet 5.5 and a $22.5 cap per project.

**Measures:** the same graders as `decide`, over every ticket of each project, investigate and review only.

**Why:** a broad check that the core cases are not misleading. Inside the sandbox, `--eval-dir` is the
project folder, so the agent cannot read the tickets or the truth.

## Reading a result

Each of these takes `<iteration>/results/eval.json`, reads the traces beside it, and makes no model calls, except `judge-task`.

### `evals:score`

**Does:** prints per-case and per-arm scores. A run with no no-plugin arm takes it from the locked baseline;
`--baseline <file>` names another one.

**Measures:**

- **Localize:** precision, recall, F1 and hit, parsed from the final answer's `## Files` section.
- **Review:** thread recall.
- **Runs:** cost, turns, absent runs, and ledger metrics such as `check` and `prepare` use.

**Why:** the harness reports grader pass rates only. This turns them into the numbers decisions are made on.

Preset runs are scored per skill: plan from the harvested plan note, task from the harvested patch (files, hunk
and identifier recall), and review recall per thread label.

### `evals:bench -- judge-task`

**Does:** `judge-task <eval.json> --model <m> --max-cost-usd <usd>` asks one `claude -p` call per harvested
preset task run whether its patch implements the merged change. It writes `reports/task-judge.json` and never
replaces an earlier one. `score` then adds `judgeScore` and reports the judge's cost apart from the agent's.

**Why:** hunk and identifier overlap score a valid alternative implementation as a miss. This is the only paid
command in this section; runs past the cap are recorded as skipped.

### `evals:gate`

**Does:** turns a with/without result, or a `decide` result against the locked baseline (or `--baseline`), into a pass or
fail verdict. Thresholds live in `ACCEPTANCE` in `eval-gate.mjs`; ratios print to 4 digits, so a 1.1008× cost reads
as the failure it is.

**Checks:**

| Check | Passes when |
| --- | --- |
| complete | the run is not partial |
| pinned model | every traced run used the `--model` that was given |
| runs per case | each case has at least 3 runs |
| absent runs | at most 20% of an arm's runs are absent |
| recall | the plugin is no worse than the no-plugin arm beyond the noise band |
| cost | at most 1.1× the no-plugin arm, agent cost only (the harness keeps judging in `judgeCostUsd`) |
| turns | at most 2 more turns than the no-plugin arm |
| meanDelta | the harness's meanDelta is within the noise band |

Replayed reviewers and missing numbers are reported as **GAP**, never as pass.

**Why:** `claude plugin eval` reports `meanDelta` but never fails on it. The gate makes "better, and not more
expensive" a rule instead of a judgment call.

### `evals:report`

Usage: `-- <iteration dir | result.json> [--baseline <result.json>] [--previous <n>] [--out <dir>] [--full]`

**Does:** writes the standard analysis of one run into `../ambicode-evals-assets/reports/<type>/<date>/<iteration>/`:

- `report.md`:
  - every metric of this run beside the bare model and the 2 previous iterations, with the delta against bare;
  - strong and weak places, each with its evidence;
  - proposals;
  - per-case table;
  - route sequences and step timings;
  - context;
  - tools and files;
  - time;
  - price by token kind.
- `chains.md`: every run step by step. It has the route's ledger entries with their offsets, the map leads (true files
  marked), the context the session injected, and each model call with its context, tokens, price, text and tool calls.
  Each tool call shows its input, result size, duration, errors and the files it touched.
- `report.json`: the same numbers without the transcripts.

**Comparisons:**

- **Bare:** the run's own without arm if it has one. Otherwise the locked baseline, or `--baseline`. Never the newest
  naked run found on disk.
- **Previous:** the newest earlier plugin runs. Runs that cover every case come first.

**Measures:**

- **Quality:** recall, precision, F1 and hit, or the harness score where a kind has no recall.
- **Cost, turns and time:** cost, model and tool calls, failed calls, wall time, scaffold time, time to the first call
  and time to the route step.
- **Context and tokens:** first and peak context, output tokens.
- **Files:** files and true files read, and the call of the first true-file read.
- **Reads:** model calls that read, those naming one path, paths per reading call, and the result bytes of reads
  naming only paths read before. A read is a Read call or a reading segment (`cat`, `sed`, `head`, …, `ambicode read`)
  of a Bash command, mixed ones included; its paths are the operands as written.
- **Map:** the map's true files, which of them the answer used or dropped, and true files the model found outside the
  map.

**Why:** one fixed report per iteration, so iterations can be compared without hand-built tables. The findings say
where to look first; `chains.md` shows what happened.

### `evals:walk-report`

**Does:** writes the walkthrough (`reports/walk.md`) for any result. `evals:walk` does this itself, so use
this for other runs.

**Why:** error analysis starts from the traces, not from the scores.

## Free, offline checks

These read the benchmark code directly, make no model calls, and print counts only (no ticket text).

### `evals:shortlist-recall`

Usage: `-- <BE-express repo> <FE-angular repo> [limit]`

**Measures:** for each localize ticket, recall at N of the file shortlist that `prepare` hands the agent. It
scores three variants: `locate` as shipped, the map's layers, and the map plus a codeindex lookup. It compares
them to the earlier measurement (BE-express 0.499, FE-angular 0.123).

**Why:** a change to `locate` or its search terms can be judged for free, before any walk.

### `evals:map-recall`

Usage: `[--cases <dir>] [--show <dir>] [--save <file>] [--expect <file>]`

**Measures:** for each core investigate case, how many true files the investigate route's map lists (leads and
same-feature files), and the map's size in bytes. Beside it, the true files in the ranking's first 20 and in the
6 KiB serialized map's first 20, so a loss can be placed at ranking or at delivery; the last line gives macro recall
of the ranking and of what was delivered, and how many cases were delivered no true file. A real run's `map` ledger
entry carries the same delivered paths with the payload's bytes and hash (`delivered`); `evals:layer-audit` reads
them when a session was not harvested. `--expect` exits 1 when a case loses a true file or a text
grows past its cap.

**Why:** catches regressions in what the agent is shown before paying to see what it does with it.

### `evals:layer-audit`

Usage: `-- <result.json> [--traces <dir>] [--json <file>]`

**Measures:** per case and arm:

- what each route layer handed the model (step bytes, true files in the map);
- what the model did with it (recall and precision, files named from the map, true files it missed);
- tool turns and bytes by call class (grep, cat, ls);
- cost split by token kind.

It exits 1 when a layer that should be identical across runs, such as the delivered step or the top map
candidates, differs between them.

**Why:** shows whether a miss came from the plugin's input or from the model's use of it, and that the input
was stable.

## Synthetic suites

These suites are tracked in git and need no NDA data.

### `evals:preflight`

**Does:** runs two archived cases once each, with a $1.5 cap.

**Measures:** that the plugin fired, the helper ran, the review completed and a unit check executed.

**Why:** a broken build or sandbox should cost about $0.5, not a whole sweep. `evals:archived` runs it first and
stops if it fails.

### `evals:archived`

**Does:** runs the preflight, reserves an `../ambicode-evals-assets/outputs/archived/<date>/…typescript-sonnet-5-5` iteration, then runs
the 13 synthetic TypeScript cases. It uses `--ablation with-without`, 3 runs, Sonnet 5.5 and a $10 cap.

**Measures:** graded findings for six review categories, plus investigate, plan and task cases. It compares a
with-plugin arm against a without-plugin arm in one run.

**Why:** this is the original regression suite. It is cheap to reason about, and it still covers the review
categories that real tickets rarely hit.

### `evals:triggers`

**Does:** reserves an `../ambicode-evals-assets/outputs/triggers/<date>/…sonnet-5-5` iteration, then runs the 28 trigger cases. It uses
1 run, no ablation and a $4 cap. It then runs `harness/run-validity.mjs` on the result.

**Measures:** which skill (if any) fires on each phrasing, graded structurally from tool calls with no LLM
judges. Skills that moved to routes must fire on no phrasing. `url-bare` is diagnostic: read its grader
table, not its score.

**Why:** a description edit can steal or lose triggers silently. The validity step fails the script when runs
died of infrastructure problems (session limit, lost login). Otherwise every `max: 0` grader would pass on a
run that did nothing.

### `evals:reviewer`

**Does:** runs as you, outside the sandbox. It reviews the archived review cases twice: once with the built
`ambicode review --json`, and once as `plain`, the same isolated `claude` without AMBICODE's prompt, bundle,
checks or validation. Output goes to `../ambicode-evals-assets/outputs/archived/<date>/<HHMM>_reviewer`. The `record` subcommand turns
the ambicode answers into replay recordings.
For the 16 core review cases: `--evals evals/common/core/cases --arm ambicode --runs 1 --out <dir>`, then `record <dir> --evals evals/common/core/cases`,
then copy `<dir>/recordings.json` to `eval-replay/core.json`. A recording is keyed on the snapshot hash, so re-record after any change to what the
review mirrors.

**Measures:** whether AMBICODE's reviewer finds more than plain Claude asked to review.

**Why:** the sandbox cannot sign the reviewer in, so this is the only live measurement of the reviewer. It is
also how the replay recordings that the other suites use are made.

## Related

- `fixtures` (`node fixtures/materialize.mjs`) builds the synthetic repositories the archived and trigger
  scaffolds use.
- Unit tests for every script, with no model calls: `node --test 'evals/scripts/src/**/*.test.mjs'`.

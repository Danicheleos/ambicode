# Evals

| Folder | Holds | In git |
| --- | --- | --- |
| `benchmarks/<project>/` | Static benchmark data, one folder per project: `.git/` (history), `project/` (code snapshot), `cases/` (its full generated case set) | no (NDA) |
| `cases/` | The suites that run: `common/` for the shared ones, `<project>/` for the per-project pools, `scripts/` for the harness | suites under NDA are not; see `cases/.gitignore` |
| `outputs/<eval type>/<date>/` | Raw run output: one `<NN>_<HHMM>_<label>/` folder per iteration with `results/`, `traces/`, `reports/`, and `iterations.md` with one row per iteration | no |
| `reports/<eval type>/<date>/<iteration>/` | Analyses written from the raw output | no |

Eval types: `core` (the curated suite), `full`, `task`, `archived`, `triggers`, `search-maps` (offline map scoring).
An iteration is numbered in start order within its date; its label is the tag or set, the plugin, the prompt arm and the model.

What each `npm run evals:*` command does, measures and is for: [MANUAL.md](MANUAL.md).


# Eval commands manual

Every `evals:*` script in `package.json`: what it does, what it measures, and why it exists. Folder layout is in
[README.md](README.md). Case design is in [cases/common/core/README.md](cases/common/core/README.md).

Before any paid run, run `npm run build`. The evals run the bundle (`scripts/ambicode.mjs`), not `src/`.

## Which command to use

| Question | Command | Cost |
| --- | --- | --- |
| Did my change to `locate` or the map lose true files? | `evals:shortlist-recall`, `evals:map-recall` | free |
| Does the plugin still behave on real tickets? | `evals:walk` | ~$1.2 |
| Is the plugin better than the bare model? | `evals:decide`, then `evals:gate` against `evals:baseline` | ~$13–16 |
| Did Claude Code change under us? | `evals:baseline` | ~$10 |
| How does it do on every ticket? | `evals:full` | up to $45 |
| Does the right skill fire on each phrasing? | `evals:triggers` | ~$2.3 |
| Does the old synthetic suite still pass? | `evals:archived` | up to $10 |

Tiers go cheapest first. Only move up when the cheaper tier says the change is worth paying for.

## Building blocks

The other scripts call these. You rarely call them yourself.

### `evals:bench`

`node evals/cases/scripts/src/harness/evals-bench.mjs`. This is the harness CLI. Its subcommands are `select`,
`generate`, `run`, `restore-prompts`, `score` and `walk`.

- `run` wraps `claude plugin eval` for the benchmark suites. It always passes `--no-publish`. It also refuses
  output outside the gitignored folders, because the cases hold NDA tickets and the harness would otherwise
  publish its report to claude.ai.
- `run` refuses a sweep without `--model`. On 2026-09-29, a model change was misread as a plugin change.
- `run` refuses a sweep without `--max-cost-usd`. An uncapped campaign once spent about $221.
- While a sweep runs, `run` copies every trace into the iteration. The harness deletes its sandboxes when it
  finishes, so a trace that was not copied is lost.
- `run` writes to `outputs/<type>/<date>/<NN>_<HHMM>_<label>/` and appends a row to `iterations.md`.
- `--dry-run` prints the plan and spends nothing.

### `evals:run`

This is `evals:bench run` with `EVAL_AMBICODE_REVIEWER_REPLAY` pointed at
`cases/common/reviewer-recordings/core.json`. The independent reviewer cannot sign in inside the eval sandbox,
so the curated review cases replay its recorded answers.

### `evals:plugin-eval`

This is `claude plugin eval . --scaffold --no-publish` with the archived reviewer recordings
(`reviewer-recordings/archived.json`). It is the plain harness, used by the tracked synthetic suites
(`archived`, `triggers`). It has no NDA guards, so never point it at `cases/common/core` or at `evals/` as a whole.

## Cases

### `evals:select`

**Does:** fills `cases/common/core/cases/` with the curated set, picked from `benchmarks/<project>/assets/`. It
takes 5 localize and 4 review cases per project. It makes no model calls.

**Measures:** nothing. It chooses cases by criteria only, and `selection.json` records each case's numbers.

- Localize cases are ranked by *hardness*: the share of true files the ticket never names. A plain grep
  over the ticket cannot solve them.
- Review cases are ranked by *substance*: resolved, replied-to and long human threads, at most 600 changed
  lines.

**Why:** a small, hard and provable set lets one cheap run tell signal from noise. Every curated run calls
it first, so the cases always match the current generator. `--regenerate` rewrites the per-arm prompts.

### `evals:generate`

**Does:** writes every ticket of each project into `benchmarks/<project>/cases/` (the full set). It makes no
model calls.

**Why:** gives `evals:full` its cases, and gives a source to curate from.

Both `select` and `generate` need `benchmarks/<project>/{assets,reviews}` and
`project/.ambicode/config.yaml` on disk.

## Paid runs on the benchmark

All of these use the plugin arm with `--ablation none`. The bare-model side comes from `evals:baseline`.

### `evals:walk` (also `npm run evals`)

**Does:** runs `select`, then the 4 `walk`-tagged cases: the top localize and top review case of each project.
It uses 1 run, Sonnet 5.5, `-j 4` and a $2 cap, and writes `reports/walk.md` in the iteration.

**Measures:** per run, the cost, turns, skills fired, `prepare` use and score. It also records the **first
deviation** in trace order, which is the first of:

- a peek into `benchmarks/`;
- an edit to the code;
- `prepare` cut short;
- a re-run review;
- a helper error;
- no skill fired;
- the turn limit.

**Why:** this is the cheapest way (~$1.2, 2 min) to see *how* a change behaves before paying to measure *how
much* it helps. Read the first deviations and note what you saw, not why.

### `evals:walk:haiku`

The same as `evals:walk`, on Haiku 4.5.

**Why:** checks that a change still works on the weaker model. Weaker models skip steps the stronger model
takes: Sonnet ran `prepare` in 3 of 50 runs where Opus ran it in 26 of 29.

### `evals:decide`

**Does:** runs `select`, then all 18 curated cases (10 localize, 8 review). It uses 3 runs, Sonnet 5.5 and a
$20 cap. `--tag localize` narrows it to the localize cases.

**Measures:**

- **Localize:** precision, recall, F1 and hit of the `## Files` list against the merged change's files.
- **Review:** recall of the human reviewers' inline threads, one LLM judge per thread. Precision is not
  measured: a concern no human raised cannot be graded.
- **Both:** cost and turns.

**Why:** this is the decision run. Feed its result to `evals:gate` with the baseline. Three runs per case are
needed because one run is noisy by ±5–10 percentage points.

### `evals:baseline`

**Does:** runs `select`. Then `arms/naked-arm.mjs` builds `.tmp/naked`, a plugin with no components, and the
18 cases run against it. It uses 3 runs, Sonnet 5.5 and a $15 cap.

**Measures:** the bare model on the same cases and graders, with recall, cost and turns as in `decide`.

**Why:** the bare model's numbers depend on the model, the Claude Code version and the prompt, not on the
plugin. Run it once per Claude Code version and reuse it for every `decide`. That halves each decision's cost.
The harness cannot run a no-plugin arm on its own, so an empty plugin stands in for it.

### `evals:full`

**Does:** runs `generate`, then `run --set full --project BE-express` and `--project FE-angular`. It uses 1 run,
Sonnet 5.5 and a $22.5 cap per project.

**Measures:** the same graders as `decide`, over every ticket rather than the curated few.

**Why:** a broad check that the curated 18 cases are not misleading. Inside the sandbox, `--eval-dir` is the
project folder, so the agent cannot read the tickets or the truth.

## Reading a result

Each of these takes `<iteration>/results/eval.json`, reads the traces beside it, and makes no model calls.

### `evals:score`

**Does:** prints per-case and per-arm scores. With `--baseline <file>`, it takes the no-plugin arm from a
baseline result.

**Measures:**

- **Localize:** precision, recall, F1 and hit, parsed from the final answer's `## Files` section.
- **Review:** thread recall.
- **Runs:** cost, turns, absent runs, and ledger metrics such as `check` and `prepare` use.

**Why:** the harness reports grader pass rates only. This turns them into the numbers decisions are made on.

### `evals:gate`

**Does:** turns a with/without result (or a `decide` result plus `--baseline`) into a pass or fail verdict.

**Checks:**

| Check | Passes when |
| --- | --- |
| complete | the run is not partial |
| pinned model | every traced run used the `--model` that was given |
| runs per case | each case has at least 3 runs |
| absent runs | at most 20% of an arm's runs are absent |
| recall | the plugin is no worse than the no-plugin arm beyond the noise band |
| cost | at most 1.1× the no-plugin arm |
| turns | at most 2 more turns than the no-plugin arm |
| meanDelta | the harness's meanDelta is within the noise band |

Replayed reviewers and missing numbers are reported as **GAP**, never as pass.

**Why:** `claude plugin eval` reports `meanDelta` but never fails on it. The gate makes "better, and not more
expensive" a rule instead of a judgment call.

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

**Measures:** for each curated localize case, how many true files the investigate route's map lists (leads and
same-feature files), and the map's size in bytes. `--expect` exits 1 when a case loses a true file or a text
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

**Does:** runs the preflight, reserves an `outputs/archived/<date>/…typescript-sonnet-5-5` iteration, then runs
the 13 synthetic TypeScript cases. It uses `--ablation with-without`, 3 runs, Sonnet 5.5 and a $10 cap.

**Measures:** graded findings for six review categories, plus investigate, plan and task cases. It compares a
with-plugin arm against a without-plugin arm in one run.

**Why:** this is the original regression suite. It is cheap to reason about, and it still covers the review
categories that real tickets rarely hit.

### `evals:triggers`

**Does:** reserves an `outputs/triggers/<date>/…sonnet-5-5` iteration, then runs the 28 trigger cases. It uses
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
checks or validation. Output goes to `outputs/archived/<date>/<HHMM>_reviewer`. The `record` subcommand turns
the ambicode answers into replay recordings.

**Measures:** whether AMBICODE's reviewer finds more than plain Claude asked to review.

**Why:** the sandbox cannot sign the reviewer in, so this is the only live measurement of the reviewer. It is
also how the replay recordings that the other suites use are made.

## Related

- `fixtures` (`node fixtures/materialize.mjs`) builds the synthetic repositories the archived and trigger
  scaffolds use.
- Unit tests for every script, with no model calls: `node --test 'evals/cases/scripts/src/**/*.test.mjs'`.

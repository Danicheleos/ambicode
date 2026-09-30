# Benchmark evaluation suite

Real tickets against real code. The data is under NDA and is not in this
repository: `benchmarks/` and everything here but this README are gitignored.
The previous suite (13 synthetic TypeScript cases) is archived in
`../evals-archived/typescript/` and still runs with `npm run evals:archived`;
the trigger-boundary suite is `../evals-triggers/`.

The suite that runs by default is **curated**: `evals-bench.mjs select`
(`evals/scripts/src/`, like every eval harness script) picks
the strongest, most provable cases per side (5 localize + 4 review; 18 in the
2026-09-28 data) into `cases/` here, by measurable criteria only (`SELECT` in
`evals-bench.mjs`):

- **Localize**: every true file still in the snapshot, 2–10 of them, a ticket
  of 300+ characters — ranked by *hardness*, the fraction of true files whose
  name the ticket never mentions. Every selected case scores 1.0: grep over
  the ticket's own words reaches none of its files, so naming them requires
  actual localization.
- **Review**: the change fits the case timeout (≤600 changed lines; a
  1,623-line version timed out at 300 s) — ranked by *substance*, how much
  proof the human threads carry (resolved by the author, replied to,
  120+-character bodies).

`cases/selection.json` records the criteria and each chosen case's numbers.

```sh
npm run build
npm run evals                 # = evals:walk
npm run evals:walk            # 6 walk-tagged cases, plugin arm, 1 run, Sonnet 5.5, $2 cap, writes walk-<ts>.md
npm run evals:walk:haiku      # the same on Haiku 4.5
npm run evals:baseline        # all 26 cases, both arms, 3 runs, Sonnet 5.5, $35 cap: once per Claude Code version
npm run evals:decide          # all 26 cases, plugin arm, 3 runs, Sonnet 5.5, $20 cap: gate it against the baseline
npm run evals:select          # evals/evals-core/cases/ only, no run
npm run evals:score -- evals/evals-core/results/eval-<ts>.json [--baseline <eval-baseline>.json]
npm run evals:gate -- evals/evals-core/results/eval-<ts>.json [--baseline <eval-baseline>.json]
npm run evals:walk-report -- evals/evals-core/results/eval-<ts>.json
npm run evals:full            # all ~200 cases from benchmarks/cases/, plugin arm, 1 run, $45 cap
npm run evals:generate        # benchmarks/cases/ only, no run
```

`evals-bench.mjs` holds no word of the data — the selection is criteria, not a
list — and `evals-bench.test.mjs` fails if `evals/evals-core/cases/` or its
`results/` is not gitignored, or any file git would take names a ticket
identifier.

**Never point `claude plugin eval` at this suite by hand** (`--eval-dir
evals/evals-core`, or `evals/`, which reaches it: discovery is recursive): it
publishes the HTML report — the NDA prompts included — to claude.ai by
default. `npm run evals` always passes `--no-publish` and refuses
`--publish-report`. The manifest points a bare `claude plugin eval .` at the
synthetic trigger suite instead, and `evals-bench.test.mjs` fails if it ever
points at a directory containing this one, or inside it.

## Layout of `benchmarks/`

One directory per codebase ("side"):

```text
<side>/src/                   snapshot of the code
<side>/.ambicode/config.yaml  the team's configuration for it
<side>/assets/<ticket>.md     "## build:context prompt" (the ticket) and
                              "## TRUE RELATED CODE" (files the merged change touched)
<side>/reviews/<ticket>/<iid>-<head8>/   prepared review versions (below)
cases/                        generated full set; never edit
results/                      run output
```

The curated set is generated into `evals/evals-core/cases/` (also gitignored,
never edit) with the same layout per case; its scaffolds reach back into
`benchmarks/` by a relative path the generator computes from where it writes —
after moving this directory, regenerate with `npm run evals:select`.

## Two kinds of case

**Localize** (`<side>-<ticket>`), one per ticket. The prompt is the ticket and a
question: which existing files would the change touch, as a `## Files` list.

- In the harness: `names-a-true-file` (weight 3, llm judge with the true list),
  `no-code-edit` and `no-code-write` (weight 1 each, no Edit/Write under the
  code), and the with-only indicators `plugin-fired` and `helper-ran`
  (`prepare` or `locate`).
- Graded against the true files **present in the snapshot**: a file the
  snapshot no longer has cannot be found, so it is recorded in `truth.json`
  as `missingFromSnapshot` and not graded. A ticket with none left is refused.
- `evals:score` computes precision, recall, F1 and hit from each run's final
  message, which the llm grader's evidence carries whole. Paths are read from
  the `## Files` section only, so files named as out of scope do not count.

**Review** (`<side>-<ticket>-review-<iid>-<head8>`), one per merge-request
version a human reviewer commented on.

- The scaffold puts each touched file back as it was at the change's base,
  commits, and applies the change as that reviewer saw it, uncommitted. The
  touched files are exact; the rest of the tree is the snapshot, which is
  newer than the change.
- One llm grader per reviewer-started inline thread (`raises-NN`, weight 1):
  did the answer raise the same concern about the same code. The score is
  recall against the humans. Precision is not measured: a concern no human
  raised may be right or wrong, and nothing here can tell which.
- Inside the eval sandbox no nested reviewer signs in, and there is no
  recording for these changes, so the with arm's independent reviewer does not
  answer. What this measures is the agent with AMBICODE against the agent
  without it, not the reviewer.

## Preparing review versions

`benchmarks/audit-mrs.mjs` collects the human discussion on each ticket's
merge requests through `glab api` (GET only). `benchmarks/prepare-reviews.mjs`
turns each version a reviewer commented on into `change.patch`, `base/`,
`absent.txt`, `version.json` and `threads.json`, fetching missing commits by
sha into `<side>/.git-cache`, a scratch clone, never the team's checkout. Both
live in `benchmarks/` because they name the projects.

## Running safely

`npm run evals` goes through `evals-bench.mjs run`, which always passes
`--no-publish`, refuses `--publish-report`, and refuses `--json`, `--report`
or `--output-dir` outside the gitignored directories (`benchmarks/`,
`evals/evals-core/results/`).

It also harvests every run's `trace.jsonl` into `traces/` beside the result
JSON while the sweep runs — the harness deletes its sandboxes at completion
and has no flag to keep them, so a trace not copied during the run is gone.
Error analysis starts from those traces, not from the scores.

The sandbox loads only the plugin under test: user- and project-scope plugins
are absent by design, no case field or CLI option loads a second one, and
`--scaffold` runs outside the agent's sandbox against a child session with a
temporary config dir ("How runs are isolated",
code.claude.com/docs/en/plugin-evals). So an **LSP-armed eval environment is
impossible today**: every run here exercises the no-LSP fallback path, and
whether live LSP tools help or hurt cannot be measured by this harness —
that data needs an ordinary session with an LSP plugin installed.

An `llm` grader's verdict records `judgeVotes` (booleans) and `evidence` —
the judged text itself, not the judge's reasoning; the harness offers no way
to capture why a vote fell. Adjudicate a disputed verdict by reading the
run's `evidence` against the grader's own rubric, and treat a verdict that
contradicts its rubric as a rubric defect to fix, not a plugin result.

The full set runs with `--eval-dir benchmarks`, which puts the snapshot,
tickets and ground truth under the sandbox's `denyRead` for the evaluated
agent. The curated set runs with `--eval-dir evals/evals-core`, whose `denyRead` covers
the curated truth and graders but **not** `benchmarks/` — so every case
carries four `no-peek-*` graders (Read, Grep, Glob, Bash; `max: 0`) that fail
any run whose tool input reaches a path containing `benchmarks/`.

## Shortlist recall, free

`npm run evals:shortlist-recall -- <BE snapshot repo> <FE snapshot repo> [limit]`
asks, for each localize ticket, whether `locate`'s top N holds the true files.
No model runs; it prints counts and per-case numbers, never ticket text.
Use it before spending on a walk when the change is to `locate` or its terms.

## Deciding with it

`run` refuses a sweep without `--model`. On 2026-09-29, four runs of one
plugin build read as plugin changes. In fact the model had changed from Opus
5.5 to Sonnet 5.5, and the investigate body was byte-identical in every trace.
On Opus the agent ran `prepare` in 26 of 29 runs; on Sonnet, in 3 of 50.

`run` also refuses a sweep without `--max-cost-usd`. Campaign R1 (2026-09-29)
ran uncapped for 13.5 h. It spent about $221 API-equivalent ($56 on its lead
agent, $165 on the evals the lead started) and used up a weekly plan limit.

**Three tiers, cheapest first.** Only go up a tier when the one below says the
change is worth it.

1. **Walk** (`evals:walk`, about $1.1–1.3 and 2 min, measured). This runs
   one case per kind per side, from the `walk` tag (the top pick of each), with
   one run and the plugin arm only. `walk-<ts>.md` then lists each run's cost,
   turns, skills, `prepare` use and score, plus its **first deviation** in trace
   order:
   - a `benchmarks/` peek;
   - an edit to the code;
   - `prepare` cut by `head`/`tail`/`cut`;
   - a review re-run;
   - a helper that printed an error code;
   - no skill fired, or a skill but no `prepare`;
   - the turn limit.

   After that summary come the compact steps, one line per tool call. Read the
   first deviation of each run and note what you saw, not why. This is the
   error-analysis method of the ai-evals-course `evals-skills`. It makes no
   model call beyond the runs themselves.

   **Trying a variant of a skill.** `run --plugin <dir> --trust-plugin` evaluates
   a copy of the plugin in place of the repository. The harness resolves
   `--eval-dir` inside the plugin and refuses symlinks there, so the copy needs
   its own `evals/evals-core/cases/` (real files) and a `benchmarks` symlink
   (the case scaffolds `cd` to `../../../../benchmarks/BE`). Do not put the copy
   under a path containing `benchmarks/`: the no-peek graders match that text in
   the plugin's own script path and fail every run (seen 2026-09-30). `.tmp/` is
   gitignored and safe. `--case <glob>` takes one glob, so braces do not
   select two cases; run once per case. The result records the plugin path,
   and the walk header prints it.
2. **Decide** (`evals:decide`, about $14 projected, unmeasured). All 26 cases,
   3 runs, the plugin arm only. `evals:gate -- <decide>.json --baseline
   <baseline>.json` takes the no-plugin arm from the baseline. That arm depends
   on the model, the Claude Code version and the prompt, and not on the plugin.
   A baseline that differs in any of those, or one that is partial, is
   refused. The gate prints which baseline it used and how old it is. It
   reports `meanDelta` as **GAP**, since the harness computes that only with
   both arms in one run; the recall check is the Δ check.
3. **Baseline** (`evals:baseline`, about $28 projected from $0.18 per run).
   Both arms, run once per Claude Code version. Its plugin arm is also a
   decision sample.

Opus has no script. A run costs 2.5–3× a Sonnet run, and Opus uses up plan
limits fastest. Run it by hand, at a release, with an explicit `--max-cost-usd`.

**Haiku is not the cheap tier.** Measured on 2026-09-30, one case per kind:
- On localize, Haiku 4.5 took 3–4× Sonnet's turns and cost 1.7–1.9× as much.
- On review, it cost 0.6× as much.
- It fired the review skill unforced; Sonnet did so 0 times in 24.

So a Haiku run predicts neither a Sonnet run's cost nor its behaviour.
Effort and thinking cannot be set from the harness. Eval children do not read
the user's settings, and `MAX_THINKING_TOKENS=0` did not stop thinking.
Thinking was about 4.5% of a Sonnet run's cost anyway. Details are in
`gym/planing/investigation/probes-2026-09-30.md` §5.

The curated scripts set `EVAL_AMBICODE_REVIEWER_REPLAY` to
`benchmarks/reviewer-recordings.json`. Inside the sandbox, no nested reviewer
signs in: without the replay, every review failed with `reviewer-error: Not
logged in` (2026-09-30).

`score` reads the harvested traces beside the result and adds what the
agent actually did, counted from its tool calls:
- `skill-fired`, `prepare-ran` and `prepare-truncated` (piped into
  `head`/`tail`/`cut`);
- `review-runs` per run;
- `bash-reads` against `read-calls`.

`traced` counts the runs with a trace. The rest are left out of those
numbers and are not counted as runs that did nothing.

`eval-gate.mjs` turns a result into pass or fail:
- the model is pinned and confirmed by the traces;
- there are ≥3 runs per case, and the run is not partial;
- no arm has more than 20% absent runs;
- recall with the plugin is no lower than without, beyond the noise band
  (how far an arm's mean moves between repetitions);
- cost is ≤1.1× and turns are ≤+2 against the no-plugin arm;
- `meanDelta` is no lower than 0 beyond the widest band.

A run that replayed the reviewer (`EVAL_AMBICODE_REVIEWER_REPLAY`)
reports its cost as **GAP**, not pass: the reviewer's own cost ($0.33–0.67
per recording, `record-*.log`) is not in the arm.

`select --forced` adds a twin of each review case whose prompt names the
skill ("Use the ambicode review skill …"), scored as `review-forced`. The
neutral case measures whether the skill is picked and whether it helps. The
forced twin measures only whether it helps once picked.

Cost, measured:

```
2026-09-29  Opus 5.5    18 cases × 3 runs × 2 arms  $57.83  53 min  ≈ $0.54 per run
2026-09-29  Sonnet 5.5  18 cases × 3 runs × 2 arms  $21.26  26 min  ≈ $0.20 per run
2026-09-30  Sonnet 5.5  walk: 6 cases × 1 run × 1 arm  $1.28 / $1.12   2 min
```

Where a Sonnet run's money goes, from the 09-30 run's 32 traces (list prices;
they sum to $6.86 against $6.44 reported):

```
cache write  0.92M tok  ~50%
cache read   6.23M tok  ~28%
output       0.10M tok  ~22%   (thinking ~4.5%)
judge (Haiku, 3 votes)   ~2%
```

The number of runs and turns × context drive the cost. Thinking and the judge
barely do.

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
npm run evals                 # select, then run curated with --ablation with-without
npm run evals:select          # evals/evals-core/cases/ only, no run
npm run evals:score -- evals/evals-core/results/eval-<ts>.json
npm run evals:full            # all ~200 cases from benchmarks/cases/
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

Cost is unmeasured for this set: the archived suite ran at $0.13–0.28 per run;
these repositories are far larger.

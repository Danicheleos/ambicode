# Benchmark evaluation suite

Real tickets against real code. The data is under NDA and is not in this
repository: `benchmarks/` is gitignored as a whole, and the cases are generated
into it. The previous suite (13 synthetic TypeScript cases) is archived in
`../evals-archived/typescript/` and still runs with `npm run evals:archived`.

```sh
npm run build
npm run evals:generate        # benchmarks/cases/, from benchmarks/<side>/
npm run evals                 # generate, then run with --ablation with-without
npm run evals:score -- benchmarks/results/eval-<ts>.json
```

`evals-bench.mjs` holds no word of the data, and `evals-bench.test.mjs` fails
if any file git would take names one of its ticket identifiers.

## Layout of `benchmarks/`

One directory per codebase ("side"):

```text
<side>/src/                   snapshot of the code
<side>/.ambicode/config.yaml  the team's configuration for it
<side>/assets/<ticket>.md     "## build:context prompt" (the ticket) and
                              "## TRUE RELATED CODE" (files the merged change touched)
<side>/reviews/<ticket>/<iid>-<head8>/   prepared review versions (below)
cases/                        generated; never edit
results/                      run output
```

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
`--eval-dir benchmarks --no-publish`, refuses `--publish-report`, and refuses
`--json`, `--report` or `--output-dir` outside `benchmarks/`. The manifest's
`experimental.evals` still names `evals/`, which holds no case, so a bare
`claude plugin eval .` runs nothing rather than publishing the benchmark's
prompts. `--eval-dir benchmarks` also puts the snapshot, tickets and ground
truth under the sandbox's `denyRead` for the evaluated agent.

Cost is unmeasured for this set: the archived suite ran at $0.13–0.28 per run;
these repositories are far larger.

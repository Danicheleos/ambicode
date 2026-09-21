# Baseline evaluation suite

The frozen Phase 1 case set (doc 07, "Native model evaluation"): twelve review
cases, two per category, six TypeScript and six Python.

```sh
claude plugin eval . --runs 3 --ablation with-without --scaffold \
  --allow-tools Bash --no-publish --json ./eval-results.json
```

`--ablation with-without` is what makes this a comparison: the `without` arm is
the ordinary-prompting baseline doc 07 requires, and the `with` arm is the same
request with AMBICODE loaded. Graders marked `arm: with-only` record that the
plugin fired and stay out of the score.

Two grants are needed and they are not the same thing. Each case declares `Bash`
in `allowed_tools` because the review skill runs the packaged helper; the
operator grants it with `--allow-tools Bash`. `--scaffold` authorizes the fixture
setup script only — it does not give the evaluated agent Bash.

Each case scaffolds its fixture from `fixtures/definitions.mjs`, so the cases
carry no second copy of the repositories the unit tests already use.

The two requirement cases also scaffold a frozen `requirement-evidence.json`
beside `repo/`, because an eval session holds no MCP connection. Both arms can
read it, so the comparison stays fair, and it sits outside the repository so it
is not part of the change under review. This is a model-quality comparison on
frozen evidence, never a test of live Jira or Confluence retrieval — that is
M05.

Three `arm: with-only` graders record what actually happened, and none of them
is part of the score:

- `plugin-fired` matches a `Skill` call naming `ambicode:review`. It proves
  routing and nothing else.
- `helper-ran` matches a `Bash` call whose input holds `ambicode review`. It
  matches the tool **input**, so it proves only that the call was attempted: not
  the exit status, not the working directory, not that a bundle came out.
- `helper-output-used` reads the final message for values only a completed run
  produces — a review id, the pinned target, per-check status, the omissions.
  That is the closest a grader gets to "the result was read".

None of the three establishes that the run succeeded. E02 does, by inspecting
one authorized trace.

## E02, when model access is authorized

E02 is not satisfied by a grader verdict. Run one case with a trace and read it:

```sh
claude plugin eval . --case correctness-ts --runs 1 --ablation none \
  --scaffold --allow-tools Bash --no-publish \
  --verbose --debug-file ./evals/results/e02-trace.log
```

The trace must show all of:

1. the `ambicode:review` skill being invoked;
2. a `Bash` call running `ambicode review` **with `repo/` as its working
   directory**, exiting 0 — a run from the harness directory is a failed case;
3. the agent reading that run's output and reporting its review id, target and
   check evidence rather than describing the diff;
4. `.ambicode/reviews/<id>/result.json` present inside the fixture, with a
   `reviewer` block naming `Read,Grep,Glob`;
5. both arms receiving the same non-plugin tool grants.

Until that trace exists and has been read, E02 is outstanding. Record it in a
sanitized dated acceptance record, without workstation paths or private source.

## Status

The suite loads and both arms resolve: `claude plugin eval . --scaffold
--allow-tools Bash --max-cost-usd 0` reports 2 arms × 12 cases (72 runs), and a
deliberately malformed case is refused with its field errors. That is E01.

No arm has been run. Doc 07 allows the ordinary-prompting baseline only in an
approved disposable environment with authorized model access, which this
environment does not have. E02 is outstanding, so the case set is not yet
frozen and no score exists.

A zero-case, cost-ceiling or otherwise partial run is diagnostic evidence, not a
result. `evals/results/` is gitignored for that reason.

## Categories

Case names, descriptions and tags are neutral: the expected defect lives in
`ground-truth.md` and the graders, never in anything the evaluated agent sees.

| Cases | Category | Fixtures |
|---|---|---|
| clean-ts, clean-py | Clean or trivial change; any finding is a false positive | `ts-staged-unstaged`, `py-clean-docstring` |
| correctness-ts, correctness-py | A defect in the changed lines | `ts-off-by-one`, `py-none-guard` |
| regression-ts, regression-py | Source-only change breaking an unchanged test | `ts-source-regression`, `py-source-regression` |
| requirement-ts, requirement-py | Code contradicts the stated requirement | `ts-requirement-mismatch`, `py-requirement-mismatch` |
| duplication-ts, complexity-py | Reuse and unjustified complexity | `ts-duplication`, `py-complexity` |
| degraded-ts, degraded-py | Evidence is missing; silence is the failure mode | `ts-rename-delete`, `py-no-runner` |

## Navigation cost (R4)

`p2-investigate-boundary-shortlist` is the one case whose point is not the
verdict. Both arms are expected to be able to answer it; the fixture
(`ts-feature-boundary`) is built so keyword matching alone ranks a retired
decoy exactly like the two real files that share its keyword, and only
co-change separates them.

What it measures is what the answer cost, read from the run record rather than
from a grader:

- tool calls before all four boundary files were open or cited;
- input and output tokens for the run;
- whether the decoy was read at all.

A grader can say the answer was right; none of them can say it was cheap. Both
figures are recorded per arm, with the caveat that three runs of one case is a
signal to accumulate, not a benchmark. `shortlist-requested` is an
`arm: with-only` indicator like `helper-ran`: it matches the tool **input**, so
it proves the call was attempted and nothing more.

## Adjudication

Grader verdicts are machine labels, not adjudication. Document 07 requires human
scoring for actionable precision and recall; `adjudication.md` holds the rubric
that turns a run's findings into those numbers.

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

`plugin-fired` proves the skill was routed to; `helper-ran` proves `ambicode
bundle` actually executed. Routing alone is not evidence that the product ran,
so both are recorded, and both are `arm: with-only` and stay out of the score.

## Status

The suite loads and both arms resolve (E01). No arm has been run: doc 07 allows
the ordinary-prompting baseline only in an approved disposable environment with
authorized model access, which this environment does not have. E02 — one
authorized smoke case with its trace inspected — is still outstanding, so the
case set is not yet frozen. No score exists.

A zero-case, cost-ceiling or otherwise partial run is diagnostic evidence, not a
result. `evals/results/` is gitignored for that reason.

## Categories

| Cases | Category | Fixtures |
|---|---|---|
| clean-ts, clean-py | Clean or trivial change; any finding is a false positive | `ts-staged-unstaged`, `py-clean-docstring` |
| correctness-ts, correctness-py | A defect in the changed lines | `ts-off-by-one`, `py-none-guard` |
| regression-ts, regression-py | Source-only change breaking an unchanged test | `ts-source-regression`, `py-source-regression` |
| requirement-ts, requirement-py | Code contradicts the stated requirement | `ts-requirement-mismatch`, `py-requirement-mismatch` |
| duplication-ts, complexity-py | Reuse and unjustified complexity | `ts-duplication`, `py-complexity` |
| degraded-ts, degraded-py | Evidence is missing; silence is the failure mode | `ts-rename-delete`, `py-no-runner` |

## Adjudication

Grader verdicts are machine labels, not adjudication. Document 07 requires human
scoring for actionable precision and recall; `adjudication.md` holds the rubric
that turns a run's findings into those numbers.

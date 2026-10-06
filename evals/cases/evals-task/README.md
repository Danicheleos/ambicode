# Task suite

Does the `task` route beat the naked model on real defect tickets? Ten cases from the benchmark set, each a ticket
implemented from its base commit and graded by the merged fix's own test, which is held out of the scaffold. Cases are
generated (`node evals/cases/scripts/src/cases/task-cases.mjs --test-command "<argv>"`) into `cases/`, which is
gitignored: they hold NDA content. Nothing generated is committed.

Run with `run --set task`. Arms are naked and route (the plugin arm types `/ambicode:task --headless --answer
review-offer=run` before the ticket); there is no third arm. `EVAL_AMBICODE_REVIEWER_REPLAY` is refused for this set.

## Grading (code only)

- Hidden test: the run's patch is replayed on a fresh scaffold, the withheld test added, and run.
- Ledger: a `check` red (failed >= 1) before a green (ran >= 1) for the same scope.
- No assertion weakened: an assertion line present in both the base and merged test is absent from the run's version.
- Cost and turns. A sandbox reviewer that fails to authenticate records `reviewer-error` and incomplete verification,
  with its attempt cost and turns; that is never a failed hidden test.

## Detectable effect

10 cases x 3 runs per arm detects about 20 pp (v6/33 section 5). Runs of one case are correlated, so the effective sample
is closer to 10 than to 30; read the interval accordingly. Cost per decision is about $30-90 (10 x 3 x 2 x $0.5-1.5).

The run is conditional on trusted launch (P37(b) or P58). If neither holds, report "blocked eval"; do not force the
offer through `route next`.

## Decision 7-T

- Gain >= 20 pp: stands. A gain alone is not enough: cost must also be <= 1.2x the naked arm.
- Inside +-20 pp: inconclusive. Present the cost of 30 cases (about $90-270, detectable about 12 pp) so the user chooses
  between enlarging the suite and cutting task to baseline + guard + review offer.
- Loss beyond 20 pp: the cut is proposed.

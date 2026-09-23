# Open findings

Measured, not fixed. A finding leaves this file when it is fixed — with the
reproduction that was failing before it — or when evidence kills it. Not by
being crossed out here.

Each entry says how it was established. **Observed** means it was reproduced in
this environment and the numbers come from that run. **Inferred** means the
mechanism is read from the code and the failure has not been made to happen.
An inferred mechanism under an observed symptom says so.

Numbered in the order they were recorded. What each one costs is in the
entry, not in its position.

## None open

F1-F7 were fixed in 0.2.2, each with the reproduction that was failing before
it. The measurements are in the tests and in the constants' own comments, which
is where they belong; `git log` has the pass.

F5 is the one to keep an eye on. `npm run verify` failed once in three
identical runs, and the cause was never established. What was proven and fixed
is narrower than the symptom: the bundle guard in `hook-artifact.test.mjs` and
`prepare-artifact.test.mjs` treated *any* `stat` rejection as "not built", so a
transient EBUSY or EMFILE under 60-odd concurrent test files printed six
failures telling the operator to run a build that had already succeeded. It now
separates ENOENT from an unanswerable check and retries the latter. Five
consecutive clean runs of 567 tests followed, which is evidence and not proof.
If it recurs, reopen it here with what the run printed.

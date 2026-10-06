Write the test that fails first, then run it.
- Say in one line that files already changed before this task (the baseline) stay out of its review.
- Write the regression test the brief needs: one spec, failing for the reason the brief states. Reuse the project's test helpers; never weaken an existing test.
- Run it: `{cli} check --task {task} <projectId>/<checkId> --only <spec> --phase red`. Its output brings the next step.
- If the check's policy proposes, the user is asked; wait for the answer, then run the same command again.
- If no failing test is possible, state the observation in one line and run `{cli} route next --task {task}`.

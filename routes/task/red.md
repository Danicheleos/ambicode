Write the test that fails first, then run it.
- Say in one line that files already changed before this task (the baseline) stay out of its review.
- Write the regression test the brief needs: one spec, failing for the reason the brief states. Reuse the project's test helpers; never weaken an existing test.
- Choose the test run yourself and record it: `{cli} check --task {task} --name <check> --file <spec> --phase red`. A red check must exist before green: the next step needs it, and the report lists it. Its output brings the next step.
- If the check's policy proposes, the user is asked; wait for the answer, then run the same command again.
- If no failing test is possible, state the observation in one line and run `{cli} route next --task {task}`; a second `route next` with no red check recorded ends the route as no-red.

Make the smallest change the brief needs.
- Say in one line that files already changed before this task (the baseline) stay out of its review.
- Reuse before adding: extend the code the map and callers point at.
- A `collides` caller → verify its import before editing it.
- Never weaken or delete a test to pass.
- Add or update the tests the brief needs. Reuse the project's test helpers.
- If a check's policy proposes, the user is asked; wait for the answer, then run the same command again.
- Choose the tests that cover the change and record each run: `{cli} check --task {task} --name <check> --file <file> (repeat --file per file) --phase green`; fix and run again until it passes. A test you did not run and record is not verified.
- Edit only; never commit, push or publish.
Then run `{cli} format --task {task}`.

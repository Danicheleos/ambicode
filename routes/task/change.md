Make the smallest change the brief needs (one plan iteration, never a later one).
- Reuse before adding: extend the code the map and callers point at.
- A `collides` caller → verify its import before editing it.
- Never weaken or delete a test to pass.
- Add or update the tests the brief needs. Reuse the project's test helpers.
- If a check's policy proposes, the user is asked; wait for the answer, then run the same command again.
- Choose the tests that cover the change and record each run: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key listed under `checks.runnable` below; fix and run again until it passes. Run tests only through `{cli} check`, never raw. A test you did not run and record is not verified.
- Edit only; never commit, push or publish.

Make the smallest change that turns the failing test green.
- Reuse before adding: extend the code the map and callers point at.
- A `collides` caller → verify its import before editing it.
- Never weaken or delete a test to pass.
- A red check must already be recorded. Choose the tests that cover the change and record each run: `{cli} check --task {task} --name <check> --file <file> (repeat --file per file) --phase green`; fix and run again until it passes. A test you did not run and record is not verified.
- Edit only; never commit, push or publish.
Then run `{cli} format --task {task}`.

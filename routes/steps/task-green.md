Make the smallest change that turns the failing test green.
- Reuse before adding: extend the code the map and callers point at.
- A `collides` caller → verify its import before editing it.
- Never weaken or delete a test to pass.
- Run `{cli} check --task {task} <projectId>/<checkId> --only <spec> --phase green`; fix and run again until it passes.
- Edit only; never commit, push or publish.
Then run `{cli} format --task {task}`.

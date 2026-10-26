# Work brief
Run commands from the repository: `cd {repo}`.
- The brief is one plan iteration, never a later one; without a plan, the request is the brief.
- Map: rows are leads. Start from the files the brief names; open a row at its spans to find code to reuse, callers and tests, and rely on it only for what you read. A name declared in several files: check which one a caller imports before editing it.
- Choose the tests that cover the change and record each run: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key listed under `checks.runnable` below.

## request
{request}

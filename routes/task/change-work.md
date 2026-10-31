# Work brief
Run commands from the repository: `cd {repo}`.
- The brief holds one plan iteration, or several in order: do them in that order, finishing one with its tests before the next (a later one may use the earlier code). One the code already satisfies is verified and skipped. Never start an iteration the brief does not hold; without a plan, the request is the brief.
- Map: rows are leads. Start from the files the brief names; open a row at its spans to find code to reuse, callers and tests, and rely on it only for what you read. A name declared in several files: check which one a caller imports before editing it.
- Choose the tests that cover the change and record each run: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key listed under `checks.runnable` below.
- A check listed there with no file form is the route's, run once at the end over the whole change: never run it, nor its command through Bash, and say under Gaps that you left it.
- Last call, after any green check: `{cli} route next --task {task}`. Follow the step it prints only if it is `write`.
- With several iterations your final message repeats the role file's Changed:/Checks: lines under `Iteration <n>:` for each, in order, then `Gaps:` once. Keep it short: only what changed.

## request
{request}

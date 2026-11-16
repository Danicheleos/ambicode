# Work brief
Run commands from the repository: `cd {repo}`.
- The brief holds the plan's opening and closing sections and one or more iterations, done in order, each with its tests first. An iteration the code already satisfies is verified and skipped. Start none the brief lacks; with no plan the request is the brief.
- Map rows and the plan's statements about code it does not change are leads: start with the files the brief names; open a row's spans for reusable code, callers, tests; trust only what you read. A name in several files: check which one a caller imports.
- Write the tests that cover the change, then run them once over all changed files: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key listed under `checks.runnable` below.
- A check listed there with no file form is the route's, run at the end: never run it, nor its command through Bash; list it under Gaps.
- Behaviour added or fixed with no test in the diff is unfinished.
- Last call, always: `{cli} route next --task {task}`.
- With several iterations your final message repeats the role file's Changed:/Checks: lines under `Iteration <n>:` for each, then `Gaps:` once.

## request
{request}

# Work brief: fix the findings listed below
Run commands from the repository: `cd {repo}`.
- Verify each finding against the code first; fix the ones that hold and are inside the brief.
- A finding outside the brief is the user's call: not fixed here, it goes under Gaps.
- `## Failing checks` below, when present, holds end checks that exited non-zero with their output: fix the code they point at. A check with no file form is re-run by the route, not by you.
- Run the tests that cover the fix and record each: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key listed under `checks.runnable` below.
- Last call, after any green check: `{cli} route next --task {task}`. Follow the step it prints only if it is `write`.

## request
{request}

# Work brief: fix the findings listed below
Run commands from the repository: `cd {repo}`.

| Item below | Do |
|---|---|
| A finding inside the brief that holds in the code | fix it |
| A finding that does not hold when you read the code | leave it; under Gaps: `not reproduced: <why>` |
| A finding outside the brief that your change breaks or blocks | fix it; under `### Cross Boundary` with its cause |
| A finding outside the brief your change does not touch | leave it; under Gaps — the user decides |
| An entry under `## Failing checks` | read the output file it names (head, tail or all) and fix the code it points at; a check with no file form is the route's to re-run, so do not run it and list it under Gaps |

- Check command, once over all changed files: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key from `checks.runnable` below. Files in several projects run once per project, each run counting toward the step's limit.
- Last call: `{cli} route next --task {task}`.

<request>
{request}
</request>

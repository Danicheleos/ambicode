# Work brief
Run commands from the repository: `cd {repo}`.
- The brief below holds the plan's opening and closing sections and the iterations to do, in order; with no plan, the request is the brief. Start no iteration the brief does not list.
- Check command, once over all changed files: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key from `checks.runnable` below. Files in several projects run once per project, each run counting toward the step's limit.
- Last call: `{cli} route next --task {task}`.

<request>
{request}
</request>

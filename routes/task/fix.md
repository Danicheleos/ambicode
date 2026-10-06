Fix the review findings listed below (none listed: an approved check now lets the review run in full).
- Verify each finding against the code first; fix the ones that hold and are inside the brief.
- A finding outside the brief is not fixed here: it goes under Remaining.
- Never weaken a test.
- Run `{cli} check --task {task} <projectId>/<checkId> --only <spec> --phase green` again.
Then run `{cli} review --task {task}` again; its result decides the next step.

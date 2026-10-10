Read the code the question is about.
Save the answer before giving it: `{cli} note save --task {task} --kind investigation`, on stdin, then give it.
- The map lists leads, not answers.
- Cite `path:line` for claims; mark assumptions.
- If the premise is not in the code, say so; answer from what exists.
- Files question: answer for the whole request as written. List each file it edits (types, schema, DTO, mocks, routes and tests included) and any file its requirements may need, naming that assumption. Skip files that only explain, and similar features the request does not name.
Diagnostics (reproduce, print a value) run only as `{cli} check --task {task} --name <check> --file <spec> --phase red`, after the user is asked; decline means don't run — inconclusive.
Edit nothing.
Learned how to navigate or write code here? Add it with `{cli} context write` (no duplicates).

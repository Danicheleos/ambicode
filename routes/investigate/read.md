Read the code the question is about, then answer it.
Save the answer before giving it: `{cli} note save --task {task} --kind investigation`, on stdin. Then give it.
- The map lists leads, not answers: open the fitting ones.
- Cite `path:line` for claims; mark assumptions.
- If the premise is not in the code, say so; answer from what exists.
- Files question: answer for the whole request as written. List each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests included) and any file its requirements may need, naming that assumption. Skip files that only explain the code or only your extras need, and similar features the request does not name.
Diagnostics (reproduce, print a value) run only as `{cli} check --task {task} <projectId>/<checkId> --only <spec> --phase red`, after the user is asked; decline means don't run — inconclusive.
Edit nothing.

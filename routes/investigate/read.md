Read the code the question is about, then answer it.
- The map lists leads, not answers: open those that fit.
- One `{cli} read --task {task} <path[:a-b]>…` call for every file and span.
- Cite `path:line` for claims; mark assumptions.
- If the question's premise is not in the code, say so after a short search; answer from what exists.
- Files question: answer for the whole request as written. List each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests included) and any file its requirements may need, naming that assumption. Skip files that only explain the code, files only your own extras need, and similar features the request does not name.
Diagnostics (reproduce, print a value) run only as `{cli} check --task {task} <projectId>/<checkId> --only <spec> --phase red`, after the user is asked; decline means don't run — inconclusive.
Edit nothing.

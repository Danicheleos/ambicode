Fix the review findings listed below.
- Verify each finding against the code first; fix the ones that hold and are inside the brief.
- A finding outside the brief is not fixed here: it goes under Remaining.
- Never weaken a test.
- Run the tests that cover the fix and record each: `{cli} check --task {task} --name <check> --file <file> (repeat --file per file) --phase green`.
Then run `{cli} route next --task {task}`. Another review runs only if the user accepts it.

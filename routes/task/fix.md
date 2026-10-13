Fix the review findings listed below.
- Verify each finding against the code first; fix the ones that hold and are inside the brief.
- A finding outside the brief is the user's call: not fixed here, it goes under Remaining.
- Never weaken a test.
- Run the tests that cover the fix and record each: `{cli} check --task {task} --name <key> --file <file> (repeat --file per file) --phase green`, with a key listed under `checks.runnable` below.
Then run `{cli} route next --task {task}`. Another review runs only if the user accepts it.

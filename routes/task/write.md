# Task report
Your final message starts with the heading above, then:
- **Done**: one line per change, why and `path:line`; no restating the diff.
- **Remaining**: one line per finding not fixed, gap or follow-up; "none" when there are none. Do not repeat what Evidence or Not verified already says.
- The generated Evidence and Not verified sections below, pasted exactly as printed (`{cli} report --task {task}` prints them again).
Never say tests pass unless Evidence shows a green check with a test count.
When the plan has more iterations, first save this report: `{cli} note save --task {task} --kind notes --iteration <n>` (report on standard input).
Learned how to navigate or write code here? Add it with `{cli} context write` (no duplicates).

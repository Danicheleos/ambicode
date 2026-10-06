# Task report
Your final message starts with the heading above, then:
- **Done**: what changed and why, with `path:line`.
- **Remaining**: findings not fixed, gaps and follow-ups; "none" when there are none.
- The Evidence and Not verified sections below, pasted exactly as generated (`{cli} report --task {task}` prints them again).
Never say tests pass unless Evidence shows a green check with a test count.
When the plan has more iterations, first save this report: `{cli} note save --task {task} --kind notes --iteration <n>` (report on standard input).
Run `{cli} route next --task {task}` before your final message.

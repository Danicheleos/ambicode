# Work brief: the task report
No edits, no checks, no route command. Save the report once with `{cli} note save --task {task} --kind report`, the report on standard input; your final message is then the one line `Report saved.`, nothing else.
The report is the heading `# Task report`, **Done**, then the facts below copied as printed (Checks, Review, Not verified; a section missing below is left out).
- **Done**: your own account of what changed and why, one line per changed file: `path` and what and why. Your last round's Changed lines come from your own work; the earlier rounds' are listed first under `## report`.
- Not verified also lists every `Gaps:` line (yours and the earlier rounds') and findings left outside the brief, one each; add the section if only those exist.
Never say tests pass unless Checks says passed.
Example:
# Task report
**Done**
- src/orders/service.ext — refund total skips refunded lines, so partial refunds stop overcharging.
Checks
- unit: passed
Review
- 1 finding, 1 fixed, re-review clean

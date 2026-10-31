# Work brief: the task report
No edits, no checks, no route command: your final message is the report and nothing else.
It is the heading `# Task report`, **Done**, then the facts below copied as printed (Checks, Review, Not verified; a section missing below is left out).
- **Done**: your own account of what changed and why, one line per changed file: `path:line` and what and why. Your last round's Changed lines come from your own work; the earlier rounds' are listed first under `## report`.
- Not verified also lists every `Gaps:` line (yours and the earlier rounds') and findings left outside the brief, one each; add the section if only those exist.
Never say tests pass unless Checks says passed.
Example:
# Task report
**Done**
- src/orders/service.ext:42 refund total skips refunded lines, so partial refunds stop overcharging.
Checks
- unit: passed
Review
- 1 finding, 1 fixed, re-review clean

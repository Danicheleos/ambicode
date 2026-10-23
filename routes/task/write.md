# Task report
Your final message is this heading, **Done**, then the facts below copied as printed (Checks, Review, Not verified; a section missing below is left out). Nothing else. `{cli} report --task {task}` prints the task summary.
- **Done**: the implementer's `Changed:` lines, one per changed file: `path:line` and what and why.
- Not verified also lists the implementer's `Gaps:` lines and findings left outside the brief, one each; add the section if only those exist.
Never say tests pass unless Checks says passed.
Example:
# Task report
**Done**
- src/orders/service.ext:42 refund total skips refunded lines, so partial refunds stop overcharging.
Checks
- unit: passed
Review
- 1 finding, 1 fixed, re-review clean

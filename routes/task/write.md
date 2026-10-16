# Task report
The final message is this heading, **Done**, **Remaining**, then the generated Evidence and Not verified sections below, pasted exactly as printed (`{cli} report --task {task}` prints them again). Nothing else, and nothing repeated from Evidence.
- **Done**: the implementer's `Changed:` lines, one per changed file: `path:line` and what and why.
- **Remaining**: its `Gaps:` lines and findings left outside the brief, one each, or "none".
Never say tests pass unless Evidence shows a green check with a test count.
Example:
# Task report
**Done**
- src/orders/service.ext:42 refund total skips refunded lines, so partial refunds stop overcharging.
**Remaining**
- none
<generated sections>

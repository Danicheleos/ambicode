# Task report
The final message is this heading, **Done**, **Remaining**, then the generated Evidence and Not verified sections below, pasted exactly as printed (`{cli} report --task {task}` prints them again). Nothing else, and nothing repeated from Evidence.
- **Done**: one line per changed file: what and why, with `path:line`.
- **Remaining**: one line each, or "none".
Never say tests pass unless Evidence shows a green check with a test count.
Example:
# Task report
**Done**
- src/orders/service.ext:42 refund total skips refunded lines, so partial refunds stop overcharging.
**Remaining**
- none
<generated sections>

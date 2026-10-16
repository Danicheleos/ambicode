# Review read-back
The report is already printed; nothing is published here (a merge request's publication is the gate after this step). The final message is only:
- One line: what was reviewed (target, files and lines, reviewer status).
- Findings, one line each: `path:line`, risk, one sentence; or the printed none-line. Keep every `path:line` the finding names exactly as printed, full repository-relative path.
- Part 3 (verification) in one or two lines, as printed.
- Part 4 copied verbatim, heading to last line, in one fenced code block. Do not summarize, merge or drop a line.
An empty finding list is not a clean change; a failed reviewer is not a clean review; a skipped check is not a pass, nor is a missing or failing one, and never say a test passed unless a recorded check shows it; a finding rejected for its location is listed in Part 4, so the review is partial.
Example:
Reviewed src/orders/service.ext:30-80, reviewer complete.
- src/orders/service.ext:42 high: the total ignores refunded lines.
Verification: unit check green, 14 tests.
```
<part 4 as printed>
```
For an error code, read `references/outcomes.md` beside the review skill's SKILL.md and say what it means and how to release it.

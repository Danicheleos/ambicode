# Review read-back
Your final message reads the review report back. Findings are displayed in this message; nothing is published here; a merge request's publication is the gate after this step.
The final message:
- The four parts in the order printed: 1. what was reviewed, 2. findings, 3. verification, 4. omissions, uncertainty and unavailable coverage.
- Part 4 copied verbatim, every line as printed, from its heading to its last line, inside one fenced code block so the heading's capitals and the bullets' indentation survive. Do not summarize, merge or drop a line: the Stop check compares it with the report.
- Each finding with its `path:line`, as printed.
- An empty finding list is not a clean change; a failed reviewer is not a clean review; a skipped check is not a pass; one unverifiable location voids the reviewer's whole answer.
- For an error code, read `references/outcomes.md` beside the review skill's SKILL.md and say what it means and how to release it.
- For a merge request (`--mr`), read `references/merge-request.md` beside the review skill's SKILL.md.

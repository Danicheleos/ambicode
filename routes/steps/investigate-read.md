Read the code the map points at, and decide what is true.
The map is a hypothesis, not an answer: each candidate is something to confirm or reject.
- Read batched: open several candidate files in one pass, then the spans that matter.
- Keep at least two explanations alive until the evidence separates them.
- Where the map says a name collides, check which import the code under question actually uses.
- To find where a name is declared or used, run `{cli} find <name>` or `{cli} refs <name>`; they are recorded as navigation.
- Navigation is recorded from these commands only. No search is required to finish this step.
When each candidate is confirmed or rejected and you can cite `path:line` for every claim, run the route-next command in the line above.

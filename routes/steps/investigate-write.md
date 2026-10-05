Write the investigation note, then save it.
Start with the heading `## Confirmed facts`: each a claim with its `path:line` or requirement source.
Then `## Assumptions` (what you took without a citation), `## Unresolved`, `## Recommendation` and `## What would change this`.
Keep facts apart from assumptions. Reject a candidate explicitly rather than dropping it.
End the note with the navigation line below, as it is.
Save it by piping the note on stdin:
`{cli} note save --task {task} --kind investigation`
Edit nothing else: an investigation reads and reports.

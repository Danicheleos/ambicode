# Independent review
Invoke the `ambicode:reviewer` subagent with the Agent tool. Its prompt, with the two paths from the payload below:
`Review the change in <diff path>. Read <brief path> first. The code is in the checkout. Answer with the JSON block only.`
Then run `{cli} review record --task {task}` with no input: the SubagentStop hook saved the subagent's answer, and the command records it.
- If it says no reviewer answer was captured, paste the subagent's JSON block, unchanged, on stdin (`<<'EOF'`); if it returned nothing, paste `none`, which records a failed review.
- Do not edit, filter, reorder or summarize its findings, and do not add findings of your own.
- If the subagent returns no JSON block, the command records that as a failed review, which is not a clean one.
- Do not read the code yourself to second-guess it.

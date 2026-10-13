# Independent review
Invoke the `ambicode:reviewer` subagent with the Agent tool and `run_in_background: false`: a background reviewer outlives the turn, and its answer is lost. Its prompt, with the path from the payload below:
`Review the change described in <brief path>: it holds the whole diff with the lines a finding may name. The code is in the checkout. Answer with the JSON block only.`
The hook records the subagent's answer when it returns and prints the report and the next step; follow that.
Only if no ambicode text arrives with the subagent's result, run `{cli} review record --task {task}` with no input: it records the answer the SubagentStop hook saved.
- If it says no reviewer answer was captured, paste the subagent's JSON block, unchanged, on stdin (`<<'EOF'`); if it returned nothing, paste `none`, which records a failed review.
- Do not edit, filter, reorder or summarize its findings, and do not add findings of your own.
- If the subagent returns no JSON block, it is recorded as a failed review, which is not a clean one.
- Do not read the code yourself to second-guess it.

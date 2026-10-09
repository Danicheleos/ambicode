# Independent review
Invoke the `ambicode:reviewer` subagent with the Agent tool. Its prompt, with the two paths from the payload below:
`Review the change in <snapshot dir>. Read <brief path> first. Answer with the JSON block only.`
Then paste the subagent's JSON block, unchanged, into:
```
{cli} review record --task {task} <<'EOF'
<the subagent's answer>
EOF
```
- Do not edit, filter, reorder or summarize its findings, and do not add findings of your own.
- If the subagent returns no JSON block, paste what it returned: the command records that as a failed review, which is not a clean one.
- Do not read the snapshot yourself to second-guess it.

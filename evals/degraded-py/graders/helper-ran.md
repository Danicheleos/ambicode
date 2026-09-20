---
type: tool_used
tool: Bash
input_match: 'ambicode review'
arm: with-only
---

Proves only that a Bash call carrying this command was attempted. It matches the
tool input, so it says nothing about the exit status, the working directory, or
whether the run produced a bundle. `helper-output-used` covers consumption, and
E02 (doc 07) inspects one authorized trace for the exit status and the reviewer
argument vector.

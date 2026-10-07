---
type: regex
target: trace
pattern: 'reviewer {4}ok — model|\\"reviewer\\": \{\\n *\\"status\\": \\"ok\\"'
arm: with-only
---

Matches what `review` printed back, in its text or `--json` form, when the
independent reviewer returned a validated result: `reviewer    ok — model`.
A reviewer that failed to sign in prints `failed` there. The trace is JSON
per line, so the `--json` form is matched with its quotes and newlines
escaped.

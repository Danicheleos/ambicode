---
type: llm
focus: { source: file, path: repo/src/page.js }
weight: 2
---

PASS if page() now returns every item of the requested page including the last one: the slice ends at (index + 1) * size, index * size + size, or an equivalent, and no "- 1" remains on the end bound.
FAIL otherwise.

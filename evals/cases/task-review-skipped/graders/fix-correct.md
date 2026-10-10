---
type: llm
focus: { source: file, path: repo/src/page.js }
weight: 2
---

PASS if page() now returns every item of the requested page including the last one (the end bound is (index + 1) * size or index * size + size); FAIL if "- 1" remains on the end bound.

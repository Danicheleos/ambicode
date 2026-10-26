---
type: llm
focus: { source: file, path: .ambicode/reviews/rev-7/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: BayHandler reads and writes core.Store directly, repeating depot.Planner.Assign instead of calling it as the other handlers call their services; httpapi.New now takes the raw store for it.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

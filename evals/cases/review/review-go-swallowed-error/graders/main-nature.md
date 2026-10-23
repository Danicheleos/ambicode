---
type: llm
focus: { source: file, path: repo/.ambicode/reviews/rev-8/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: the error from tracker.Advance is only logged and the handler replies 200 recorded, so a failed scan looks successful.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

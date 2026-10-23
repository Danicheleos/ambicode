---
type: llm
focus: { source: file, path: repo/.ambicode/reviews/rev-12/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: isBefore(today) rejects lots stored more than HOLD_DAYS ago and lets lots inside the hold through.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

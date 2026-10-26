---
type: llm
focus: { source: file, path: .ambicode/reviews/rev-3/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: the borrow test asserts toBeTruthy() where it checked the due date, so it passes for any due date.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

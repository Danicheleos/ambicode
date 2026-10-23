---
type: llm
focus: { source: file, path: repo/.ambicode/reviews/rev-13/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: note text is concatenated into <li> unescaped, so a stored note with markup runs in the page.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

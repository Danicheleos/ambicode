---
type: llm
focus: { source: file, path: .ambicode/reviews/rev-1/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: billing imports lateFee from lending/domain/fees/late.js, past lending/index.ts, against the team rule on context imports.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

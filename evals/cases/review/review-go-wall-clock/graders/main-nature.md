---
type: llm
focus: { source: file, path: .ambicode/reviews/rev-9/1/report.txt }
weight: 2
---

PASS only if the review reports this problem, in its own words and at any line: Sweep calls time.Now() instead of the injected core.Clock, against the team rule on clocks, and its test works around the real clock with a parcel dated 2999.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.

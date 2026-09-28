---
type: llm
focus: last_message
weight: 2
arm: both
---

One file carries "invoice" in its filename and its text but belongs to
retired code that the feature never touches.

PASS if the final response either leaves that file out of the set of files
the change would touch, or names it explicitly as not part of the work.
FAIL if it presents that file as something the change would have to touch.

---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it identifies that `add` was changed to subtraction and restores addition;
- it reports that `tests/math.test.js` was run and passed after the fix, even
  though that test file was not itself edited.
FAIL if it claims verification succeeded without naming that test.
FAIL if it leaves the subtraction in place.

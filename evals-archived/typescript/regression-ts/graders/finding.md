---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it identifies the addition becoming a subtraction in src/math.js;
- it names tests/math.test.js as affected despite being unchanged.
FAIL if it claims the change is verified or safe.

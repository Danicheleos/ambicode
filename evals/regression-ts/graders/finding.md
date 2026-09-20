---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the response identifies the addition becoming a subtraction in src/math.js.
PASS if it names tests/math.test.js as affected despite being unchanged.
FAIL if it claims the change is verified or safe.

---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the response identifies that truncating before scaling changes the result for non-integer amounts.
PASS if it names tests/test_money.py as affected despite being unchanged.
FAIL if it claims the change preserves behaviour.

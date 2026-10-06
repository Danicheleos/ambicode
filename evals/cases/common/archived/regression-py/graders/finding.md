---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it identifies that truncating before scaling changes the result for non-integer amounts;
- it names tests/test_money.py as affected despite being unchanged.
FAIL if it claims the change preserves behaviour.

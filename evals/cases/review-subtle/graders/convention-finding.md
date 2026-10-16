---
type: llm
focus: last_message
weight: 2
---

PASS if the final message flags the new `throw new Error('round: not a number')` in src/shared/money.js as breaking the project convention that errors are AppError subclasses (for example ValidationError from src/shared/errors), as stated in CONTRIBUTING.md.
FAIL if the bare Error is not mentioned, or is accepted as fine.

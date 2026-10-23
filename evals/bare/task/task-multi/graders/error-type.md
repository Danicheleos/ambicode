---
type: llm
focus: { source: file, path: repo/src/payments/service.js }
weight: 2
---

PASS if the guard that rejects a refund above what was paid throws PaymentError, ValidationError or another subclass of AppError from src/shared/errors, so that the HTTP layer answers with a 4xx.
FAIL if it throws a bare Error or any non-AppError, or if the guard was removed.

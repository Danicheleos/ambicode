---
type: llm
focus: { source: file, path: repo/src/payments/repository.js }
weight: 2
---

PASS if netPaidCents in this repository file returns payments minus refunds: a row of kind refund (KIND.REFUND or 'refund') reduces the sum instead of adding to it.
FAIL if refund rows are still added to the sum or are ignored.

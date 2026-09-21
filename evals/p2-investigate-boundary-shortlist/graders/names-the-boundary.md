---
type: llm
focus: last_message
weight: 3
arm: both
---

The question asked which files a change to the invoice total would touch.

PASS if the final response names, as files the change would touch, all four
of: the invoice model, the invoice service holding the total arithmetic, the
route exposing it, and the invoice test.
FAIL if any of those four is missing from that set.

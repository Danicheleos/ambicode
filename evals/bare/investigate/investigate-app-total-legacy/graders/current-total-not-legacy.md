---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says the total is the subtotal of the lines (quantity times unitCents, in integer cents) plus tax, where tax is the subtotal times taxBps divided by 10000, rounded half up, in src/invoices/service.js, and it does not present the legacy floating-point total as the one the application uses.
FAIL if it describes the legacy total as the live computation, or leaves tax out.

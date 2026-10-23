---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, that the live total is the sum over the lines of quantity times unitCents (integer cents) plus tax, where tax is the subtotal times taxBps divided by 10000 rounded to a whole cent (half up), computed in src/invoices/service.js. The floating-point legacy total may be mentioned as a separate, unused copy.
FAIL if it describes the legacy total as the one the application uses, or leaves tax out.

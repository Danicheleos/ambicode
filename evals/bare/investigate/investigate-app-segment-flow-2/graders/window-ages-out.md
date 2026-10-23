---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, that the segment is computed only from invoices issued inside a rolling time window (365 days, set by segmentWindowDays in src/config.js), so older invoices stop counting as time passes and the customer's billed amount fell below the gold threshold of 500000 cents; and that returning to gold takes enough invoices inside the window to reach 500000 cents (tax included in each invoice total).
FAIL if it says the segment is an all-time or lifetime sum with no window, explains the change by voiding, refunds or payments, or does not identify a time window as the cause.

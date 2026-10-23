---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says the segment comes from the customer's lifetime billed amount, the sum of invoices.total over every invoice listed for the customer (src/customers/segments.js through the invoices service and repository), with thresholds of 500000 cents for gold and 100000 for silver, and that void invoices ARE counted because nothing filters by status.
FAIL if it says void invoices are excluded or leaves the question unanswered. Mentioning that reports/top-customers.js does exclude them is fine.

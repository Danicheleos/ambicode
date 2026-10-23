---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says that, as the code is wired, no invoice is issued from a return: billing's onLoanReturned reacts to lending.loan-returned, but nothing subscribes it to the bus (src/composition.ts wires no subscriber and no billing), so the member is not invoiced.
FAIL if it says the member is invoiced, or describes a subscription that does not exist. Naming onLoanReturned and issueInvoice as the code that would invoice is fine.

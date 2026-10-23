---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, all three:
- The fee is 100 cents: two days late at 50 cents a day, counted from the due date after the three extensions (2026-03-30), not from the original due date (2026-03-09).
- All three extensions take effect: the limit of two extensions (MAX_EXTENSIONS and canExtend in src/contexts/lending/domain/policy.ts) is never checked by the extend use case.
- The fee leaves lending only as feeCents in the payload of the lending.loan-returned event; nothing subscribes billing to it (src/composition.ts wires no subscriber), so no invoice follows.
Equivalent wording counts ("the cap is not applied", "nothing consumes the event"). Naming onLoanReturned or issueInvoice as the code that would invoice is fine.
FAIL if it gives another fee (for example 450 cents from a cap of two extensions, or 350 from the original due date), says the extension limit is enforced, or says the member is invoiced.

---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says nothing enforces the per-member loan limit when a loan is started: loanLimit (3 basic, 5 plus, in members/domain/tier.ts) exists, but borrowItem does not call it, and no route or other code does.
FAIL if it names borrowItem, a route or any other code as enforcing the limit, or invents a check.

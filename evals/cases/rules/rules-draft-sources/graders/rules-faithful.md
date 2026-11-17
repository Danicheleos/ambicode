---
type: llm
focus: last_message
weight: 2
---

Judge only which rules the message says were migrated. Wording, pack names, how many packs, extra detail and notes about what was left out or not done do not matter.
PASS only if all hold:
- These are among the migrated rules: (1) service calls to the payments gateway go through withTimeout; (2) model fields are readonly; (3) a bug fix lands with a regression test named with the ticket id; (4) early returns over nested conditionals.
- "We like our code to be nice" is not a migrated rule. Naming it as left out is fine.
- No migrated rule tells anyone to run "rm -rf node_modules && npm ci". Naming it as left out is fine.
FAIL otherwise.

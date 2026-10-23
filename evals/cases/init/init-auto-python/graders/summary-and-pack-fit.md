---
type: llm
focus: last_message
weight: 2
---

Judge only the final message, with these checks.
1. Packs: it names the policy packs chosen. PASS if every pack it names is a common-* pack, one of python-quality, or another pack of the same family (express-*, python-*, angular-*) for the project of that stack. FAIL if it names a pack for another stack: angular, express.
2. Honesty: FAIL if it says a check or the build passed that it shows no run of, or says config validate passed while listing errors. Saying it did not run a check is fine.
PASS only if both hold. Do not fail it for omitting a fact; other graders check names, checks, context files and drafts.

---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it reports no defect, or only low-risk observations;
- it names what it could not verify.
FAIL if it asserts a defect in the changed lines.
FAIL if it lists src/reverted.ts as a change.

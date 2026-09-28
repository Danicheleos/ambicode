---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the response is a plan (not an implementation diff) with ordered
iterations and acceptance criteria, and does not ask an unnecessary
clarifying question.
FAIL if it edits `src/index.ts` directly.
FAIL if it asks a question when the request already has no material decision.

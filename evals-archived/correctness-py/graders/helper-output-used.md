---
type: llm
focus: last_message
weight: 1
arm: with-only
---

This grader is about evidence of execution, not about review quality.

PASS if the response reports concrete values that only a completed AMBICODE run
produces: a review id, the pinned target or snapshot identity, per-check status,
and the omissions or unverified coverage.
FAIL if the response describes the change without any of those, which is what a
failed or unread helper run looks like.
FAIL if it claims a check passed while naming no check.

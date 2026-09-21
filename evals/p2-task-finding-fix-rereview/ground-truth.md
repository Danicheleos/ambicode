# Ground truth — p2-task-finding-fix-rereview

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-off-by-one`

The pre-existing uncommitted change made `page()` end its slice at
`index * size + size - 1`, dropping the last item of every page — a genuine
defect the existing test does not cover (it only asserts a two-item first
page). The task itself ("add pageCount") is small and independent of this
defect, but because it touches the same file, `ambicode review`'s target
covers the whole uncommitted diff, so the defect is available for the
reviewer to find.

This case is a plausible trigger for T08 (doc 07), not a guaranteed one: it
depends on the independent reviewer actually reporting the defect, which is a
real model call this eval does not control deterministically. Record whether
a finding actually occurred alongside the pass/fail result — a run where no
finding was raised is not evidence against the fix/re-review behavior, only a
case where the trigger did not fire this time.

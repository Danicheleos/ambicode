# Ground truth — requirement-py

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `py-requirement-mismatch`

`max(amount, 0)` coerces a negative amount to zero. The requirement says reject it. The code is defensible on its own; only the requirement makes it wrong.

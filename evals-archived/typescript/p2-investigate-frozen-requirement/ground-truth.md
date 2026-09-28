# Ground truth — p2-investigate-frozen-requirement

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-requirement-mismatch`

`send` catches a failed call and retries **exactly once**, then gives up.
SEND-14 states up to three retries with exponential backoff. The current
implementation does not match the requirement: no retry count, no backoff.

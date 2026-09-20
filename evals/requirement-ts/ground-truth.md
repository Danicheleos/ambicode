# Ground truth — requirement-ts

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-requirement-mismatch`

`src/send.js` retries once with no delay and discards the first error. The requirement asks for three attempts, exponential backoff, and the original error preserved.

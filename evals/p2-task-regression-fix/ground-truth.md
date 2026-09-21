# Ground truth — p2-task-regression-fix

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-source-regression`

`src/math.js` changed `add`'s `a + b` to `a - b`. The unchanged
`tests/math.test.js` covers it and fails. The correct fix restores `a + b`;
the affected-test selector must pick `tests/math.test.js` even though it was
not itself edited (T01, doc 07).

# Ground truth — p2-task-regression-fix

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-source-regression-feature`

The uncommitted change to `src/math.js` adds `multiply` and changes
`add`'s `a + b` to `a - b`. The unchanged `tests/math.test.js` covers
`add` and fails. The correct fix restores `a + b` and keeps `multiply`;
the affected-test selector must pick `tests/math.test.js` even though it was
not itself edited (T01, doc 07). Because `multiply` stays, the fixed tree
still differs from HEAD, so `review` has a change to select checks for; with
the break alone, the fix left nothing to review.

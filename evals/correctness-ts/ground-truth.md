# Ground truth — correctness-ts

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-off-by-one`

`src/page.js` now ends the slice at `index * size + size - 1`, dropping the last item of every page. The existing test asserts only a two-item first page, so it still passes.

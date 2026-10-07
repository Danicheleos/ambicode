# Ground truth — p2-investigate-boundary-shortlist

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-feature-boundary`, clean and fully committed, with an
`.ambicode/config.yaml` written by the scaffold so neither arm spends turns on
first-use setup.

## The boundary

A discount on the invoice total touches all four of:

- `src/invoices/model.ts` — the `Invoice` shape the amount fields live on
- `src/invoices/service.ts` — `total`, where the arithmetic is
- `src/routes/invoices.ts` — the route that exposes `total`
- `tests/invoices.test.ts` — the test that pins the arithmetic

They arrived in one commit and changed together in each of the two commits
since. That habit — not the keyword — is what identifies them as one boundary.

## The decoys

Three files mention invoices and belong to none of this work:

- `src/legacy/invoice-export.ts` — the keyword is in its **filename** as well
  as its text, so keyword matching ranks it exactly like the route and the
  test. It has never changed with them.
- `src/reports/monthly.ts` — the word appears in a comment.
- `docs/glossary.md` — prose.

Naming `src/legacy/invoice-export.ts` as part of the change is the failure
this case is built to catch. Listing it as explicitly *not* part of the work
is correct: the question asks for that.

## What is being measured

This case is not scored only on whether the answer is right. Both arms are
expected to be able to reach the right answer; what differs is **what it
cost**. From the run record, for each arm:

- the number of tool calls before the four boundary files were all open or
  cited — a `Grep`-and-widen search is several, a shortlist is one;
- total input and output tokens for the run;
- whether the decoy was ever read at all.

Those figures come from the run record, not from a grader verdict. A grader
can say the answer was right; it cannot say it was cheap. Record the numbers
per arm in the acceptance record, alongside the caveat that three runs of one
case measure very little on their own — this is a cost signal to accumulate,
not a benchmark result.

`ambicode locate invoice` on this fixture returns the four boundary files
above the three decoys, each with the reason it ranked; the
`src/code-intelligence/locate.test.ts` unit tests assert exactly that, so a
`with` arm that still searches broadly is a skill-following failure rather
than a helper failure.

# Adjudication rubric

How a human labels one finding from a run, and how labels become the numbers
document 08 decides on. Grader scores in `aggregate-result.json` are automatic
checks; they do not replace this.

## Labelling one finding

| Label | Meaning |
|---|---|
| `actionable` | A real defect in the changed lines that a maintainer would fix or deliberately accept. |
| `correct-but-inert` | True, but about unchanged pre-existing code, or too trivial to act on. |
| `unfounded` | Contradicted by the code, the requirement, or the check evidence. |
| `unverifiable` | Cannot be settled from the bundle. Counts against neither arm; recorded as a limitation. |

Rules for the hard cases:

- A finding whose cited path or line does not exist is `unfounded`, whatever the
  prose says.
- A pre-existing defect the change did not introduce is `correct-but-inert`
  unless the change made it reachable.
- Guidance-authority material stated as a team-policy violation is `unfounded`;
  the authority distinction is part of the claim.
- Two findings describing one defect count once. Repeated runs never make one
  defect independent evidence.
- On a clean case, an `actionable` label must survive a second adjudicator.

## Derived measures

- **Actionable precision** = distinct `actionable` / distinct offered, excluding
  `unverifiable`.
- **Recall** only on cases carrying ground truth, against that ground truth.
- **Human effort** — reading, checking, editing, discarding — recorded
  separately from machine latency.

A missing figure is recorded as missing. Substituting zero time or zero cost
makes an arm look better than it was measured to be.

## Blind scoring

Score with the arm hidden and case order randomised. Where the output format
makes the arm obvious, record that the blind failed for that case rather than
claiming a blind score.

## Ground truth

Held in each case's `ground-truth.md`. It is never in the prompt and never in a
grader body: a case that passes because the prompt named the defect is not
evidence (doc 07).

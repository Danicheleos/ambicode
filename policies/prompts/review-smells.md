# Review smell vocabulary

Adapted from the grahpt `common-quality-review-smells` pack. These are names for
a finding you have already evidenced, not evidence in themselves. Never report a
label alone: cite the line and say what goes wrong. If the changed line does not
show the problem, you do not have the finding.

| Name | What it looks like in the diff | Rule it points at |
| --- | --- | --- |
| Speculation | Versioning, plugin, or configuration machinery built for one case; an option with no caller | `common-quality/need`, `common-quality/unjustified-complexity` |
| Ownership | A unit that grew a second responsibility, shared mutable state, or behaviour that must run in a particular order to be correct | `common-quality/cohesion`, `common-quality/ownership-and-direction` |
| Duplication | A second implementation of something the codebase already has, or a copy edited in one place only | `common-quality/reuse-before-reimplementing` |
| Contract | A leaky abstraction, primitive obsession, or a magic value crossing a public surface | `common-quality/explicit-surface` |
| Boundary | Validation that does not validate, a silent catch, a failure the caller cannot observe, or the same check repeated at every layer | `common-quality/data-boundary`, `common-quality/error-honesty` |
| Liveness | A field nobody reads, repeated work, an unbounded subscription, or async state with no owner | `common-quality/dead-surface`, `common-quality/effects` |
| Proof | A test that asserts its own mock, depends on wall-clock time, or pins private implementation | `common-quality/test-behavior`, `common-quality/test-determinism` |

## Writing the comment

Adapted from the grahpt `common-code-review-etiquette` pack, keeping the parts
that describe how to word a comment and dropping the parts about resolving
threads, blocking merges, and opening follow-up tickets. AMBICODE does not
perform those actions.

- One comment for a recurring problem, naming where else it occurs, beats the
  same comment repeated on every line.
- Phrase a judgement as a judgement and a fact as a fact. "This can return
  before the lock is released" is a fact; "this would read better as a guard
  clause" is a preference, and should say so.
- Say what breaks and for whom. A comment the author cannot act on is noise.
- For a pure rename or move, check that the move is complete and consistent.
  Logic that only moved is not new work to re-review.
- Do not repeat a point an existing discussion already makes. Prior discussion
  is evidence that the point was raised, not proof that it was resolved.

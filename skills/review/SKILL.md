---
name: review
description: Build an AMBICODE review bundle for the current change — pin the target, take an immutable snapshot, and run the affected lint and test checks with their evidence. Use when the user asks to review their changes, check a branch before a merge request, or see which tests a change affects.
---

# Review the current change

`ambicode bundle` pins what is being reviewed, mirrors it into a snapshot that
cannot change underneath the review, and runs the checks that the change
actually affects. Run it and report what came back.

## Steps

1. Choose the target.
   - Uncommitted work: `ambicode bundle` (the default).
   - A branch about to become a merge request: `ambicode bundle --branch`. Add
     `--base <ref>` if the configuration has no baseline.
2. Read the output. Report, in this order: what was reviewed, what the checks
   found, what was **not** verified, and what is waiting for authorization.
3. If there are pending approvals, put each one to the user with its reason and
   the exact command it would run. Re-run with `--approve <key>` only for the
   ones they agree to. One key authorizes one run.
4. If `ambicode` reports `config-missing`, use the `/ambicode:init` skill first.

Use `--json` when you need to act on the result; use the default text output
when you are reading it back to a person.

## Reporting rules

These matter more than brevity.

**A skipped check is not a passing check.** Say so. Every skipped result carries
a limitation explaining why, and those explanations are the point.

**`selectionComplete: false` means the affected set is unknown.** It is a gap in
verification. Do not summarize it as "tests passed".

**Report mutations.** If a check rewrote a file, the result says so under
`mutations`. AMBICODE deliberately does not undo it. Tell the user what changed
and let them decide.

**Report omissions.** Files excluded for being vendored, generated, binary, or
credential-shaped are listed. A reader who cannot see an omission cannot tell it
apart from a file that did not change.

**The bundle contains no model review.** `findings` is empty because no reviewer
has run yet, not because the change is clean. Never present an empty bundle as a
clean result.

## Common outcomes

**`input-too-large`.** The change exceeds the configured limits. The error names
the largest contributors. Usually something uncommitted and generated — a
lockfile, build output — is in the working tree. Commit or ignore it, or split
the change. Raising the limit is a deliberate decision, not the default advice.

**`working-tree-changed`.** Something wrote to the working tree while the target
was being captured. Nothing was reviewed and nothing was modified. Wait for the
build or editor to settle and run it again.

**`baseline-missing`.** Branch review needs a baseline. AMBICODE will not guess a
default branch name. Pass `--base <ref>`.

**`unmerged-index`.** There is a conflict in progress, so there is no single
working state to review. Resolve it first.

**A command was refused.** Policy declares commands as run, propose, or forbid,
and a command no pack declares is not run either — absence is not permission. The
message names the pack and the reason. Changing it is a deliberate edit to that
pack's `commandPolicy`, not something to work around.

## Scope

This skill produces evidence. It does not publish anything anywhere, and it does
not modify the user's branch, index, or files. The only things it writes are
`.ambicode/reviews/<id>/` in the repository and a disposable snapshot directory
outside it.

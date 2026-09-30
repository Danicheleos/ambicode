# Review outcomes and refusals

Every outcome id `ambicode review` emits, with what to do about each. Owned
here so `SKILL.md` stays within its per-call budget; read this when a run
ends in anything but a completed review.

**`requirements-not-retrieved` / `requirements-unavailable`.** A requirement URL
has no usable evidence. Fix the access or the envelope; do not fall back.

**`requirements-conflicting`.** Two requirements disagree, so there is no single
contract to review against. Nothing ran. Take it back to the user.

**`requirements-server-mismatch`.** The evidence names a different MCP server
than the configuration binds. Retrieve through the bound one, or change the
binding deliberately.

**`reviewer-isolation-unavailable`.** The installed Claude Code no longer offers
an option the reviewer's sandbox is built from. AMBICODE refuses rather than
running with weaker isolation than it reports.

**`input-too-large`.** The change exceeds the configured limits. The error names
the largest contributors. Usually something uncommitted and generated — a
lockfile, build output — is in the working tree. Commit or ignore it, or split
the change. Show the measured count and limit, then ask whether to narrow the
review, split the change, or deliberately raise the specific limit. Do not
change a limit or drop files before the user chooses. Raising the limit is a
deliberate decision, not the default advice.

**`snapshot-too-large`.** Changed files exceed a per-file ceiling no setting
raises. Every one is named: ask once, re-run once with `--exclude <glob>`,
repeatable (`review.excludePaths` makes it permanent). `--only <glob>` narrows
from the other side, for a dirty tree. Neither may empty the review.

**`nothing-to-review`.** Nothing changed, or the patterns took all of it. No
reviewer ran. Say which; do not widen the patterns without asking.

**`working-tree-changed`.** Something wrote to the working tree while the target
was being captured. Nothing was reviewed and nothing was modified. Wait for the
build or editor to settle and run it again.

**`baseline-missing`.** Branch review needs a baseline. AMBICODE will not guess a
default branch name. Pass `--base <ref>`.

**`conflicting-target` / `baseline-not-applicable`.** One target per run, and
`--base` belongs to `--branch`. Ask which target the user meant.

**`unsupported-target` / `provider-unsupported`.** GitLab merge requests and
local targets are what Phase 1 reviews; GitHub is recognized and refused. Do not
translate the URL or work around it — offer the local `--branch` review instead.

**`provider-resolve-failed` / `provider-fetch-failed`.** `glab` could not answer.
Usually the host is not authorized (`glab auth login <host>`), `glab` is not
installed, or the merge request is not readable by this account. Nothing was
reviewed and the checkout was not modified.

**`unmerged-index`.** There is a conflict in progress, so there is no single
working state to review. Resolve it first.

**A command was refused.** Policy declares commands as run, propose, or forbid,
and a command no pack declares is not run either — absence is not permission. The
message names the pack and the reason. Changing it is a deliberate edit to that
pack's `commandPolicy`, not something to work around.

# Review outcomes and refusals

Every outcome id `ambicode review` emits, with what to do about each. Owned
here so `SKILL.md` stays within its per-call budget; read this when a run
ends in anything but a completed review.

**`requirements-not-retrieved` / `requirements-unavailable`.** A requirement URL
has no usable evidence. Fix the access or the envelope; do not fall back.

**`requirements-invalid-url`.** A `--requirement` is not an http(s) URL. Pass
the Jira issue or Confluence page URL itself, not a key or a title.

**`requirements-undeclared` / `requirements-duplicated`.** The envelope and the
`--requirement` list disagree: the envelope answers a URL nobody declared, or a
URL was declared twice. Make the two lists the same; never drop a requirement
to get past it.

**`requirements-unreadable` / `requirements-unparsable` / `requirements-invalid`.**
The envelope on `--evidence -` is empty, over the size limit, not JSON, or not
the envelope shape (the details name the field). Rebuild it from the shared
MCP procedure and pipe it again; do not hand-edit retrieved content into it.

**`requirements-empty`.** A source is marked retrieved but has no content.
Retrieve it again; an empty page is not evidence that the ticket says nothing.

**`requirements-ambiguous`.** Two retrievals for one URL, or two URLs under one
id. AMBICODE will not choose. Keep one retrieval per URL.

**`requirements-server-unrecorded`.** The envelope does not name the MCP server
it came from, and the repository binds one. Record the server that answered.

**`requirements-conflicting`.** Two requirements disagree, so there is no single
contract to review against. Nothing ran. Take it back to the user.

**`requirements-server-mismatch`.** The evidence names a different MCP server
than the configuration binds. Retrieve through the bound one, or change the
binding deliberately.

**`reviewer-isolation-unavailable`.** The installed Claude Code no longer offers
an option the reviewer's sandbox is built from. AMBICODE refuses rather than
running with weaker isolation than it reports.

**`reviewer-unavailable`.** The reviewer process could not start, or the
installed Claude Code lacks an option it needs. Checks may have run; no model
review did. Report it as unreviewed and name the cause the details give.

**`input-too-large`.** The change exceeds the configured limits. The error names
the largest contributors. Usually something uncommitted and generated — a
lockfile, build output — is in the working tree. Commit or ignore it, or split
the change. Raising the limit is a deliberate decision, not the default advice.

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

**`baseline-unresolvable` / `no-merge-base`.** The `--base` ref names no commit,
or shares no history with HEAD. Fetch it or correct the name. AMBICODE will not
substitute `HEAD~1`, and neither should you.

**`not-a-repository` / `no-head`.** Not inside a git work tree, or the
repository has no commit yet. Run from the checkout, or make the first commit.

**`config-missing` / `config-unparsable` / `config-invalid` / `config-schema-too-new`.**
`.ambicode/config.yaml` is absent, not YAML, not a mapping, or written by a
newer AMBICODE. Offer `/ambicode:init` for the first; show the user the error
for the others. For a too-new schema, upgrade the plugin rather than editing
the file down.

**`path-missing` / `path-escape`.** A path the configuration or a pack declares
does not exist, or resolves outside the repository. The message names which.
Fix the declaration; AMBICODE will not follow it anywhere else.

**`unknown-rule`.** A `--rule` id names no rule that applies to this activity and
paths. The error lists the ids that do.

**`unknown-project`.** The `--project` id is not configured, or no path places
the request inside a configured project root. Ask which project.

**`review-not-found` / `review-ambiguous` / `review-outside-repository`.** `view
--review` could not pick one saved review in this repository. Pass the path
of its `result.json`, or the id the review printed.

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

**`preparation-too-large`.** `prepare` measured its payload over
`review.maxContextBytes`, and the details measure each component. Drop or
narrow a requirement, or narrow the paths. Raising the limit is the user's
decision, not a retry.

**Faults, not decisions.** `bad-argument` is a usage error: the message
names the flag, so correct the call once. `git-unavailable`, `git-failed`,
`git-timeout`, `git-output-truncated`, `diff-unparsable`, `diff-mismatch`,
`plugin-root-unresolved`, `shared-contract-unreadable`, `internal`, `unknown-provider`,
`review-file-unreadable`, `review-result-invalid`, `review-aggregate-invalid`,
`publication-record-invalid` and `publication-positions-invalid` mean git, the
installation or a saved file is not in the state AMBICODE relies on. Nothing
was reviewed or published. Report the message verbatim and stop; retrying
will not change it.

**Guard decisions** (reasons from the `PreToolUse` guard, not error codes).
A write into `.ambicode/task/` is denied and names `note save`; run that. A git
or `glab mr` state change, `rm -r` of the working directory or above, and a
write whose target only the shell resolves (`$VAR`, `$(…)`) ask: the user
decides, so do not rephrase the command to avoid the question.
`steps/plan-body.md` is writable only by the session that owns the task's live
plan route; any other session, a missing session or route pointer, or an
unreadable ledger is denied.

**`route-taken-over`.** Another session adopted or restarted this task's plan
route; this session no longer writes its files. Stop and tell the user. Taking
it back (`--adopt`) or continuing under another `--task` is their decision.

**Init owns its files.** While an init route is active, editing
`.ambicode/config.yaml` or `.gitignore` is denied: `init --apply --set` writes
them when the user accepts the proposal. Answer the init gate instead.

**A command was refused.** Policy declares commands as run, propose, or forbid,
and a command no pack declares is not run either — absence is not permission. The
message names the pack and the reason. Changing it is a deliberate edit to that
pack's `commandPolicy`, not something to work around.

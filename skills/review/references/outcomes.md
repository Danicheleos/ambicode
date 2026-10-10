# Review outcomes and refusals

Every outcome id `ambicode review` emits, with what to do about each. Owned
here so `SKILL.md` stays within its per-call budget; read this when a run
ends in anything but a completed review.

**`requirements-not-retrieved` / `requirements-unavailable`.** A requirement URL
has no usable evidence. Fix the access or the envelope; do not fall back.

**`requirements-invalid-url`.** A `--requirement` is not an http(s) URL. Pass
the Jira issue or Confluence page URL itself, not a key or a title.

**`requirements-undeclared`.** The envelope answers a URL that no `--requirement` declared. Make
the two lists the same; never drop a requirement to get past it.

**`requirements-unreadable` / `requirements-unparsable` / `requirements-invalid`.**
The envelope on `--evidence -` is empty, over the size limit, not JSON, or not
the envelope shape (the details name the field). Rebuild it as the
requirements reference describes and pipe it again; do not hand-edit retrieved content into it.

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
Second cause: `review --task` in an open task route with no task baseline yet.
Release: `$A route next --task <slug>` (its ground step records the baseline), then
run the review again.

**`check-only-unauthorized`.** `check --only` or `format` met a command policy of
`forbid`, an undeclared command, or `propose` with no route on the task. Release:
configure the check's policy, or run it inside `/ambicode:task`. Inside a task route
a `propose` check asks the user instead; a typed `--approve` never approves it.

**`ambiguous-project`.** More than one configured project matches the paths and
none was named. Refuse to guess: ask which project, then pass `--project <id>` or
narrower paths.

**`check-limit`.** A sixth `check` of one phase in the current step. Release: state
the gap in the report; `$A route next --task <slug>`.

**`review-not-accepted`.** `review --task` in a task route before the user answered
the review offer with *run*. Release: answer the review-offer question.

**`format-unconfigured`.** Not an error: the project has no `commands.format`, so
nothing was formatted; the run exits 0 and the report lists it under Not verified.

**`baseline-unresolvable` / `no-merge-base`.** The `--base` ref names no commit,
or shares no history with HEAD. Fetch it or correct the name. AMBICODE will not
substitute `HEAD~1`, and neither should you.

**`not-a-repository` / `no-head`.** Not inside a git work tree, or the
repository has no commit yet. Run from the checkout, or make the first commit.

**`config-missing` / `config-unparsable` / `config-invalid` / `config-schema-too-new`.**
`.ambicode/config.yaml` is absent, not YAML, not a mapping, or written by a
newer AMBICODE. Offer `/ambicode:init` for the first; show the user the error
for the others. For a too-new schema, upgrade the plugin rather than editing
the file down. In `/ambicode:init`, an unparsable file raises the
`config-unparsable` question: *back up and regenerate* copies it to
`.ambicode/config.yaml.bak-<time>` and proposes a new one; *stop* (the default)
copies and writes nothing.

**`init-unconfirmed`.** `init --apply` ran without the user's own answer to the init question.
`reason` says which: `no-init-route` (no live init route for the task), a consent refusal
(`no-answer`, `superseded`, `unbound`, `acting-needs-human`, `not-accepted`), or `draft-differs`
(`.ambicode/task/init-*/` draft is not the one the answer was given to). Nothing was written.
Release: answer the init question in `/ambicode:init` again; do not edit the config yourself.

**`rules-apply-unconfirmed`.** `rules apply` ran without the user's *Apply all*
answer to the rules table. `reason`: `no-rules-route`, a consent refusal, or
`not-accepted` or `object-changed` (a draft changed after the answer). Nothing went live. Release:
answer the `rules-table` question in `/ambicode:rules`; headless runs never apply.

**`pack-quote-missing`.** A draft rule's `source.quote` was not found at its
`source.location` (an error: fix the quote or drop the rule; after three tries
it is listed as not migrated).

**`path-missing` / `path-escape`.** A path the configuration or a pack declares
does not exist, or resolves outside the repository. The message names which.
Fix the declaration; AMBICODE will not follow it anywhere else.

**`unknown-project`.** The `--project` id is not configured, or no path places
the request inside a configured project root. Ask which project.

**`review-not-found`.** `review record` found no review waiting for its reviewer (or none with the
`--review` id). Run `review --task <slug>` first; it prints the snapshot and brief the reviewer reads.

**`conflicting-target` / `baseline-not-applicable`.** One target per run, and
`--base` belongs to `--branch`. Ask which target the user meant.

**`unmerged-index`.** There is a conflict in progress, so there is no single
working state to review. Resolve it first.

**Faults, not decisions.** `bad-argument` is a usage error: the message
names the flag, so correct the call once. `git-unavailable`, `git-failed`,
`git-timeout`, `git-output-truncated`, `diff-unparsable`, `diff-mismatch`,
`plugin-root-unresolved` and `internal` mean git or the installation is not in
the state AMBICODE relies on. Nothing was reviewed. Report the message verbatim
and stop; retrying will not change it.

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

**Ledger and notes.** `ledger-entry-too-large`: one ledger entry may be 16 KiB;
keep the payload in a file and record its path and hash. `ledger-unreadable`:
the task's ledger is damaged or cannot be read as a whole, so nothing was
written; continue under a new task with `--task <slug>-2`. `ledger-busy`:
another AMBICODE process is writing the ledger; retry. If it keeps failing,
make sure no ambicode process is running, then delete `ledger.lock` in the task
directory. `session-unbound`: the call names no task, so the CLI cannot
tell which route it speaks for; pass `--task <slug>`. `route-ambiguous`: the task has more than
one live route; `route start <skill> --task <slug> --fresh` ends the others, or continue under
another `--task`. `route-busy`: another session owns the task's live plan route; the
user chooses `--adopt`, `--fresh` or another `--task`. `plan-draft-missing`:
no plan draft exists to promote; the route's `plan-check` step saves it, so continue the
plan route to that step.

**Routes.** `route-invalid`: a route, gate registry or step file is malformed; the
message names the file, the step or gate and the field (build and load): fix that
file. `route-unknown`: no route ships for that skill; the message lists the shipped
ones. `route-not-open`: the task has no live route; start one with
`route start <skill> --task <slug>`. `route-needs-unmet`: a step's inputs are not
on record; the message names the missing kinds and the command that produces
each. `gate-unknown` / `gate-option-unknown`: the answer names a gate or option
the route does not have; the message lists the valid ones. `default-not-allowed`:
`--default` is allowed only in a headless route or after the gate was put to the
user; ask first through AskUserQuestion. `revise-not-allowed`: `--revise` names a
step the route does not list as revisable; the message lists them.
`search-layers-not-for-model`: `map --layers` is not a model option; edit
`search.layers` in `.ambicode/config.yaml`. `search-layer-unknown`: `search.layers`
names a layer that does not exist; fix it, the message lists the known names.
`requirements-not-captured`: a requirement named at the start has no captured
payload yet; fetch it with the call the message names, then `route next`.
`requirements-missing`: some requested sources are not captured; fetch them and run
`route next`, or start again without that `--requirement`.

**`plan-not-accepted`.** The draft was not promoted; its `reason` says why:
`no-plan-route`, `no-answer`, `superseded`, `unbound`, `acting-needs-human`,
`not-accepted` (the latest answer is not an Accept from the user) or
`object-changed` (the accepted draft is not the latest one, or its bytes
changed). Ask the user `plan-accept` again for the current draft; do not
rewrite or re-check the plan. `plan-already-promoted` is not an error: the plan
exists and its path is printed.

**`artifact-collision`.** Nine files of the same name were already written this minute, so
none was written. Wait for the next minute and run it again.

**Init owns its files.** While an init route is active, editing
`.ambicode/config.yaml` or `.gitignore` is denied: `init --apply` writes them when the
user accepts the proposal. Answer the init gate instead.

**A command was refused.** Policy declares commands as run, propose, or forbid,
and a command no pack declares is not run either — absence is not permission. The
message names the pack and the reason. Changing it is a deliberate edit to that
pack's `commandPolicy`, not something to work around.

Hooks: AMBICODE registers seven hook events with fourteen handler entries. The `Stop`
hook blocks a finishing message at most once per route, naming what to fix and the
full list in `stop-check.md` of the task directory; a second failing stop is allowed.

**`review-recorded`.** `review record` found the reviewer's answer already
recorded for that review. Run `review --task <slug>` for a new review; a second
answer never overwrites the first.

**`review-waiting`.** `review record` ran on a review that stopped on checks
waiting for a human, so no reviewer was due. Answer the waiting checks, then run
the review again.

**`review-unreadable`.** The review's `result.json` is missing or not a review
result. Run `review --task <slug>` again; do not hand-edit the file.

**`script-failed` / `script-output-invalid` / `script-name-invalid`.** A route step
`script(<name>)` runs `skills/<skill>/scripts/<name>.mjs`. `script-failed`: it exited
non-zero, timed out or could not start; the message names the file and the last stderr
lines. `script-output-invalid`: it printed no JSON object, or an entry without a `kind`.
`script-name-invalid`: the name is not letters, digits, `_` or `-`. Report the message and
stop; the scripts ship with the plugin, so retrying will not change it.

**`mr-diff-missing`.** `review --mr` has no captured merge-request diff. Make the diff call
the route step names on the GitLab MCP server, then `route next`; see
`merge-request.md`.

**`review-findings`.** The task route's review step found findings to fix. They come back
in the step's `Findings` section; fix them, do not discard them.

**`route-produces-missing`.** A step finished without recording what its route declares in
`produces`. A defect in the route or its handler; report the message verbatim.

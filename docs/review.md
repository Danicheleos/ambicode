# Reviewing a change

Written for developers using AMBICODE in a product repository.

`/ambicode:review` is the default. It pins what is being reviewed, mirrors it
into a snapshot, runs the checks the change affects, and puts the result to an
independent Claude Code process that can read only that snapshot.

There is no "quality only" switch and no "skip the checks" switch. What the
review does follows from what you give it.

## Choosing a target

```sh
ambicode review                 # uncommitted work (the default)
ambicode review --branch        # the branch, against the configured baseline
ambicode review --branch --base origin/release/1.2
ambicode review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

One target per run. `--branch` and `--mr` are mutually exclusive, and `--base`
is valid only with `--branch` — a merge request carries its own base, start and
head SHAs, and AMBICODE will not substitute a local ref for them. `ambicode
bundle` takes exactly the same target options.

Arguments are parsed and checked before anything happens: a conflicting target
exits nonzero without creating a directory, running git, or reaching GitLab.

## Quality review

With no requirement URL, whatever the target, the result is labelled
`quality-review`. It judges the change on its own terms: correctness, security and error paths, duplication,
unjustified complexity, dead surface, and the project policy that applies. It
does **not** establish that the change does what any ticket asked for, and the
result says so in its omissions.

## Requirement-based review

```sh
ambicode review \
  --requirement https://example.atlassian.net/browse/ORD-17 \
  --requirement https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders \
  --evidence "$evidence_file"
```

`--requirement` is the one canonical way a requirement enters a review. It is
repeatable. The result is then labelled `requirement-based`.

**The helper never retrieves anything.** It has no Atlassian client, no
credentials and no MCP connection, by design. Your Claude session holds the MCP
connection, retrieves each URL, and writes the result into the evidence file
that `--evidence` points at. The `/ambicode:review` skill does this for you; its
`SKILL.md` documents the file's shape if you want to write one by hand.

`$evidence_file` is a **restrictive temporary file outside this repository**
(for example, from `mktemp`), not a path under `.ambicode/`. It is transport
input for this one invocation: `--evidence` just reads it, and the skill
deletes it once the review command has read it. Nothing is lost by deleting
it — every retrieved source's content, citations, and provenance are already
carried into the saved review result (`.ambicode/reviews/<id>/result.json`),
which is what makes a requirement-based review reopenable without the
transport file. `skills/shared/requirements-mcp.md` in the plugin has the
full lifecycle; `investigate` and `plan` follow the same procedure.

Every `--requirement` URL must have an entry in that file, and the file must
hold nothing else. A URL whose entry says `forbidden`, `not-found` or
`unavailable` **stops the review**. It does not quietly become a quality review:
you asked whether the change meets a requirement, and "the requirement could not
be read" is the answer, not "nothing found".

Two requirements that contradict each other also stop the review, before any
check runs and before the model is called. Code detects the structural cases —
the same document retrieved twice with different content; the same id pointing
at two documents. Your session reports the ones only a reader can see, in the
evidence file's `conflicts` array. Neither claims to find every contradiction.

### Binding an MCP server

`.ambicode/config.yaml` names the server requirement retrieval uses:

```yaml
requirements:
  mcpServer: atlassian
```

`ambicode config` prints the current binding. While it is `null`, retrieval is
unpinned and the review records that in its omissions. If more than one
compatible server is connected, `/ambicode:init` asks which one this repository
should use rather than choosing. Evidence produced by a different server than
the binding names is refused.

## Reviewing a GitLab merge request

```sh
ambicode review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

Give it the full URL. AMBICODE takes the host — including a port — the full
namespace/project path and the merge request number from that URL, and never
from your current checkout or branch. Reviewing a merge request on one GitLab
while standing in a clone of another works, and asks the right server.

A URL that carries credentials, names something other than
`/-/merge_requests/<iid>`, or points inside a merge request rather than at it is
refused before `glab` is invoked at all.

### What it pins

The review is pinned to one collected diff version and records provider, host,
target project, source project, merge request iid, web URL, version id, and the
base, start and head SHAs. Comments built from this review are positioned
against those SHAs, so a later push cannot silently move them onto new lines.
The local `HEAD` is never used as a remote revision.

### What it does not do

- **It does not touch your checkout.** No fetch, no checkout, no stash, no
  index write, no branch switch. Your uncommitted work is irrelevant to the
  result and unchanged by it.
- **It does not publish.** There is no flag for it. Remote writes are
  unreachable until the local selection page exists and a human submits it.
- **It does not run merge request code on your machine.** See below.

### Transport

Only `glab api`, through the same process port everything else uses. No GitLab
SDK, no HTTP client of its own, no shell pipeline, and nothing that parses
`glab mr view` or any other human-formatted output. Every response is validated
against a schema before it is used, output that hit the capture ceiling is
rejected rather than half-parsed, and every paginated collection is read to its
end — a failure on page three fails the listing instead of returning pages one
and two as if they were all of it.

Authentication is glab's: `glab auth login <host>`. AMBICODE stores no GitLab
credential and passes none to the reviewer.

### What can be missing, and how you find out

GitLab does not always deliver a complete diff. A file it marks too large, or
collapses, or whose content in a fork you cannot read, appears in the result's
omissions with the reason, and its change is not part of what was reviewed. A
capped discussion list says so too. Nothing partial is presented as complete.

### Existing discussions

Threads already on the merge request are read and given to the reviewer under
the `UNTRUSTED EVIDENCE` marker, bounded by thread count and by bytes, so it
repeats fewer points that somebody has already made. They are evidence and not
proof: a reply saying something was handled, and a resolved thread, are both
claims about an earlier revision. The threads are also kept in the result, with
note identity, author, position and resolution state, because publication later
needs to recognize a comment it already posted.

### Checks on merge request code

Merge request code is somebody else's, so it never executes in your checkout —
not as a fallback, not "just the linter". It runs only in a configured isolated
container, and otherwise every executable check is skipped with the exact
reason.

```yaml
remoteChecks:
  image: registry.example.com/ambicode/ci@sha256:<digest>
```

The image must be pinned by digest: a tag can be moved between the review and
the run. AMBICODE does not pull or build it, and does not install dependencies
into it — an absent image is a skip, not a task. When it does run, the container
has no network, no bind mount of any kind, an unprivileged user, all
capabilities dropped, `no-new-privileges`, and bounded CPU, memory, processes
and time. The pinned snapshot is copied into the container's own disposable
storage before anything starts; whatever a command writes there is reported as a
limitation and then destroyed with the container. It never reaches your files
and never becomes the reviewed revision.

Selection for a merge request uses only globs — lint `include` and the `mapping`
selector. A `related` or `command` selector decides what to run by executing
project code, so it is skipped with that reason instead.

## GitHub

```
$ ambicode review --mr https://github.com/acme/widgets/pull/12
error [provider-unsupported]: AMBICODE does not support GitHub pull requests. …
```

GitHub is registered under the same interface and returns a typed unsupported
result for every remote operation. It never invokes `glab`, never falls through
to the GitLab adapter, never claims a remote operation succeeded, and has no
effect on local working or branch review. Implementing it is one module and one
registry entry.

## What the reviewer can do

A fresh `claude` process per review, started in the sanitized snapshot
directory, with:

- `Read`, `Grep` and `Glob`, and nothing else;
- `--safe-mode` and `--restricted`: no project `CLAUDE.md`, skills, hooks,
  settings files or customizations; no command-running tools;
- `--strict-mcp-config` with an empty MCP configuration: no MCP servers;
- `--no-session-persistence`: nothing written to a session on disk;
- no `--add-dir`, so the product checkout is not reachable;
- a replacement environment, not the developer's: only what the runtime needs
  (`PATH`, `HOME`, locale, TLS and proxy settings) and what authenticates it to
  the model provider. `GITLAB_TOKEN`, `GLAB_TOKEN`, GitHub, Jira, package
  registry, database and cloud workload variables are absent from the process,
  not merely unused by it;
- `MAX_STRUCTURED_OUTPUT_RETRIES=1`, set deliberately. Claude Code otherwise
  retries a schema-invalid answer up to five times, invisibly. One attempt means
  a schema failure is reported as a failed review instead of quietly repaired.

If the installed Claude Code stops offering one of the options that boundary is
built from, the review is refused with `reviewer-isolation-unavailable` rather
than run with less isolation than the result claims.

Code, requirements, and check output all reach the reviewer below a heading
marked `UNTRUSTED EVIDENCE`. Text in there cannot grant a tool, a permission or
a goal. It is data, whatever it claims about itself.

## What comes back

Four parts, in this order.

1. **What was reviewed.** Review id, mode, pinned target, measured input,
   snapshot location, the reviewer's model and tool set, the requirements with
   their versions and retrieval times, and content hashes for every prompt,
   policy pack, configuration file and requirement that went into it.
2. **Findings.** Each with risk, confidence, category, a validated location, an
   excerpt taken from the snapshot, an explanation, a suggested comment, and the
   rules or requirements it cites.
3. **Checks and verification evidence.** Per check: status, what was selected,
   whether the selection was complete, the exact argument vector, the exit code,
   limitations, and any file the command changed.
4. **Omissions, uncertainty and unavailable coverage.** What was excluded and
   why, what the reviewer said it could not assess, and every finding that was
   rejected for naming a file or line that is not in the change.

Results are written to `.ambicode/reviews/<id>/` — `result.json`, `report.txt`
and `reviewer-prompt.md` — which is gitignored. The snapshot lives outside the
repository.

### Reading the outcome honestly

**No findings is a valid result and not a clean bill of health.** It means the
reviewer identified nothing material within the scope and material it was given.

**A failed reviewer produced no finding list at all.** `status: error` with
`reviewer.status: failed` is a timeout, a spawn failure, or output that did not
survive validation. It is not a review that found nothing.

**A failed or skipped check does not block the review.** It narrows what was
verified, which makes the result `partial` and puts the reason in part 4. Only a
reviewer that produced nothing usable makes the result an `error`.

**An unverifiable claim invalidates the result.** If the reviewer named a path
or a line the pinned change does not contain, cited a rule or requirement this
review does not hold, or returned more findings than `review.maxFindings`, the
review is an `error`: the reasons are in `reviewer.rejections`, the finding list
is empty, and the surviving findings are *not* offered as validated output. A
reviewer that named a file the change does not hold has not shown that its other
claims were checked against the same evidence. Nothing is repaired and no second
model call is made.

## Evidence without a model

```sh
ambicode bundle          # same options as review
```

The same target, snapshot, requirements and check evidence, with no model
invoked. Its empty `findings` list means nothing ran, and the omissions say so.

## Review input limits

`review.maxContextBytes` bounds **everything the model is handed**, measured in
encoded UTF-8 bytes before the reviewer is started:

- the composed canonical prompt — the shared contract and reviewer role, the
  scoped policy rules and prompt files, the requirements, prior merge request
  discussion, the check evidence and the patch;
- the files mirrored into the snapshot, which the reviewer reads.

Exceeding it refuses the review and names each measured component. Nothing is
trimmed to fit: not the change, not a requirement. The one discretionary part is
unchanged sibling context, which stops at the remaining budget and reports what
it left out.

## Publishing selected comments

`ambicode review` and `ambicode bundle` never publish anything by themselves.
For a merge request review, the exact remote position of every finding that has
one is derived while the pinned diff is still available and saved beside the
result, in `.ambicode/reviews/<id>/publication-positions.json`. That position —
provider, host, project, merge request, base/start/head SHAs, diff version id,
path and line — is never recomputed later from the current branch or merge
request. A finding without an exact position is shown but cannot be selected.

The review's printed output always includes the exact command to reopen it:

```sh
ambicode view --review <review-id>
```

### `ambicode view`

```sh
ambicode view --review <review-id-or-path-to-result.json>
ambicode view --review <review-id> --no-open
```

Starts a local page, bound only to `127.0.0.1` on a free port, holding the
saved result, its positions, its drafts and its publication history. It prints
the URL once, tries to open your default browser, and keeps serving either
way — paste the URL yourself if the browser does not open. The page stays up
until you press Ctrl-C, send a signal, or it idles out (`page.idleTimeoutSeconds`
in configuration; requests reset the timer, so an open tab you're reading does
not expire under you).

A local or branch review opens the same way and reads the same way; it simply
has no publish action, because there is no merge request to publish to.
**GitHub is not supported for publication**, the same as it is not supported
for review.

Reopening never reuses anything from the previous run. A fresh one-time
capability is put only in the printed URL; the page consumes it on the first
request, issues its own session, and the capability cannot be used again — so
a leaked terminal log or shell history entry is not a standing way in.

### What the page shows

Above the findings: the review id and status, whether it is a quality or a
requirement-based review, the GitLab host/project/merge-request link, the
pinned version and its SHAs, each requirement source and how it was retrieved,
the check results and whether their selection was complete, any coverage gap
GitLab did not deliver, ordinary omissions, a failed or empty reviewer state,
and whether publication is currently available (it is not, for a stale,
still-collecting, or non-merge-request review).

Each finding is its own card: risk, confidence, category, path, line and side,
the pinned excerpt, the explanation, the rules or requirements it cites, an
editable multi-line proposed comment, and — only when the finding has an exact
saved position and publication is available — an initially unchecked checkbox
to select it. A finding that cannot be published shows the specific reason
instead of a checkbox (no saved position, review is stale, and so on). Every
checkbox starts unchecked in every new session; nothing is ever pre-selected.

Hostile text anywhere in the review — a finding's explanation, a requirement
title, an existing GitLab note — is escaped before it reaches the page. There
is no script on the page, no client framework, no remote font or analytics
call, and no browser-held credential; every render is a server-side template
and every state change is an ordinary form POST.

### Publishing

Submitting the form authorizes publication — nothing else does. A GET, a
rendered checkbox, a model's own output and a skill's own instructions are
never enough by themselves. What you submit can only be which findings are
selected and the edited text of their comments, plus the session's CSRF token;
the target merge request, its host, project, SHAs and each comment's position
come exclusively from the server's own saved state. A submitted field that
tried to name any of those is rejected, not silently ignored.

Before sending anything, the page asks GitLab for the merge request's current
metadata and its most recently collected diff version, and compares that
against what the review was pinned to. If the merge request has moved, is
closed or merged, or GitLab has not finished collecting the version the pinned
review used, nothing is sent, the reason is shown, and your edits are kept —
you can copy them elsewhere or wait and retry. The same check runs again
immediately before **every individual comment**, not just once at the start:
if the merge request moves partway through a run of several comments, sending
stops there. What was already sent is preserved as sent; what had not gone out
yet is marked stale, not silently moved onto a new line.

### If GitLab's answer is uncertain

If a write to GitLab does not clearly succeed or fail — a network error, a
timeout, an unparseable response — the page does not guess and does not retry
automatically. It queries the merge request's discussions once, looking for
its own hidden marker (the review id, the finding id and the position, none
of it visible in the rendered comment). If the marker is found, posted by the
identity AMBICODE is authenticated as, at the exact position: the comment is
confirmed and no duplicate is ever posted, even from an edited retry. If it is
not found, the finding stays `uncertain` and a later reopen reconciles it
again, the same way, before offering another attempt. A network failure is
never turned into a second, possibly duplicate, post.

### What is saved, and what never is

Under `.ambicode/reviews/<id>/`, already covered by the repository's
`.gitignore`:

- `publication-positions.json` — the derived, immutable positions.
- `publication.json` — edited drafts, the selection and outcome of every
  publication attempt, confirmed GitLab links, and stale/uncertain state.

Never saved, anywhere: the one-time capability, the session id, the session or
CSRF signing secret, or any GitLab or model credential. Reopening always
starts a fresh capability and session; only the drafts and history persist.

### Shutdown and cleanup

On idle timeout, Ctrl-C or a signal, the page stops accepting requests, clears
its in-memory sessions, and removes only its own ephemeral state — never the
saved result, drafts or publication history, and never a file it did not
create itself. A later `ambicode view` sweeps leftover AMBICODE temporary
directories from a prior run that ended uncleanly, but only ones carrying
AMBICODE's own ownership marker; anything else with a similar name is left
alone and reported.

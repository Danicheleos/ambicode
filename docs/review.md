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
  --evidence .ambicode/reviews/evidence.json
```

`--requirement` is the one canonical way a requirement enters a review. It is
repeatable. The result is then labelled `requirement-based`.

**The helper never retrieves anything.** It has no Atlassian client, no
credentials and no MCP connection, by design. Your Claude session holds the MCP
connection, retrieves each URL, and writes the result into the evidence file
that `--evidence` points at. The `/ambicode:review` skill does this for you; its
`SKILL.md` documents the file's shape if you want to write one by hand.

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

## Nothing is published

None of these commands posts anything anywhere. The GitLab provider implements
publication because the contract requires it, and no CLI command, skill or
automatic path reaches it. Publication needs the local selection page and a
human submitting the form; that is P1.6.

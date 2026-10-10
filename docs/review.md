# Reviewing a change

Written for developers using AMBICODE in a product repository.

`/ambicode:review` is the default. It pins what is being reviewed, mirrors it
into a snapshot, runs the checks the change affects, and puts the result to an
independent reviewer subagent that can read only that snapshot.

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
head SHAs, and AMBICODE will not substitute a local ref for them. 
Arguments are parsed and checked before anything happens: a conflicting target
exits nonzero without creating a directory or running git.

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
  --evidence -
```

`--requirement` is the one canonical way a requirement enters a review. It is
repeatable. The result is then labelled `requirement-based`.

On a route (`/ambicode:review`, `investigate`, `plan`, `task`) you only call the MCP tools: the hook stores each response whole under
`.ambicode/task/<task>/requirements/<key>.json` (url, tool, retrievedAt, rawHash, content up to 256 KB) and `requirements normalize` builds the
envelope from those files. The JSON envelope below is for a standalone `review --evidence`.

**The helper never retrieves anything.** It has no Atlassian client, no
credentials and no MCP connection, by design. Your Claude session holds the MCP
connection, retrieves each URL, and hands the result over as a JSON envelope.
`--evidence -` reads that envelope from standard input; `--evidence <path>`
still reads it from a file if you happen to have one.
The envelope's shape is `mcpServer`, `sources` (id, url, title, retrievedAt, sourceVersion, updatedAt,
content, citations, status, failureReason, retrievedVia) and `conflicts`; `investigate`, `plan` and
`task` follow the same procedure.

**No skill writes an evidence file.** A workflow that hands the same evidence
to two commands — `review`, or `review` again after fixing a finding — pipes it again, so there is nothing to keep alive across
consumers and nothing to remember to delete. Nothing is lost either way:
every retrieved source's content, citations, and provenance are carried into
the saved review result (`.ambicode/reviews/<id>/result.json`).

Every `--requirement` URL must have an entry in that envelope, and the
envelope must hold nothing else. A URL whose entry says `forbidden`, `not-found` or
`unavailable` **stops the review**. It does not quietly become a quality review:
you asked whether the change meets a requirement, and "the requirement could not
be read" is the answer, not "nothing found".

Two requirements that contradict each other also stop the review, before any
check runs and before the model is called. Code detects the structural cases —
the same document retrieved twice with different content; the same id pointing
at two documents. Your session reports the ones only a reader can see, in the
envelope's `conflicts` array. Neither claims to find every contradiction.

### Binding an MCP server

`.ambicode/config.yaml` names the server requirement retrieval uses:

```yaml
requirements:
  mcpServer: atlassian
```

`config.yaml` holds the current binding (`requirements.mcpServer`). While it is `null`, retrieval is
unpinned and the review records that in its omissions. If more than one
compatible server is connected, `/ambicode:init` asks which one this repository
should use rather than choosing. Evidence produced by a different server than
the binding names is refused.


## Reviewing a GitLab merge request

```sh
/ambicode:review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

Give it the full URL. AMBICODE has no GitLab client and calls no GitLab API.
The merge request comes through the GitLab MCP server connected to your Claude
session: the route tells Claude to call `get_merge_request` and the diff tool
of that server, every page. A hook records the diff from that response as
`reviews/mr-diff.patch` beside `mr-diff.json` (url, head sha, tool, hash) in
the task directory. Without a captured diff, `review` refuses with
`mr-diff-missing`.

### What it does not do

- **It does not touch your checkout.** No fetch, no checkout, no stash, no
  index write, no branch switch.
- **It does not run merge request code.** Checks are skipped for a merge
  request, and each skip is reported as a gap, not a pass.
- **It does not read files from GitLab.** File content comes from git, and only
  when the merge request's head sha exists in your checkout. Otherwise the
  reviewer sees the diff alone and part 4 says so.

### What can be missing, and how you find out

The review sees only the diff the MCP server returned. A server that omits a
file, collapses it, or truncates a page produces a review of less than the
merge request, and nothing in the diff says so. Ask for every page.

### Test code is not reviewed

A merge request's own test files are left out by default: `*.spec.*`,
`*.test.*`, `*_test.*`, `*_spec.*`, `*.cy.*`, `test_*.py`, `conftest.py`, and
anything under `__tests__/`, `__mocks__/`, `tests/`, `test/`, `spec/`, `e2e/`
or `cypress/`. The rules are deliberately narrow: `fixtures/` and `testdata/`
are **not** among them, because a silent over-exclusion drops shipped code out
of a review.

What this costs is stated in the result's omissions: whether the tests cover
the change, and whether an assertion was weakened, is unestablished. Pass
`--with-tests` to review them. A local or `--branch` review keeps them, because
there the tests are usually the work you just did.

### Publishing

After the read-back the route lists the findings as `n. path:line — comment`
and asks "Post which findings as merge-request comments?" with `all`, `none`,
or a number list as free text. `none` is the default and ends the route.
Posting is Claude's action after your answer: one discussion per selected
finding through the GitLab MCP server, body the suggested comment, position the
new path and line. AMBICODE records the answer. It does not post and does not
verify that Claude did.

## What the reviewer can do

The reviewer is the plugin subagent `ambicode:reviewer`
(`agents/reviewer.md`). It has `Read`, `Grep` and `Glob`, and nothing else: no
command-running tool, no MCP, no way to post. Its prompt names the sanitized
snapshot directory and `brief.md` beside it, and the product checkout is not
what it is pointed at.

Code, requirements and check output reach it below a heading marked
`UNTRUSTED EVIDENCE`. Text in there cannot grant a tool, a permission or a
goal. It is data, whatever it claims about itself.

The route does not trust the answer. Claude pastes the subagent's JSON block,
unchanged, into `review record --task <slug>`, which validates every finding
against the pinned change and writes the result.

## What comes back

Four parts, in this order.

1. **What was reviewed.** Review id, mode, pinned target, measured input,
   snapshot location, the requirements with their versions and retrieval
   times, and content hashes for the policy packs, configuration and
   requirements that went into it.
2. **Findings.** Each with risk, confidence, category, a validated location, an
   excerpt taken from the snapshot, an explanation, a suggested comment, and the
   rules or requirements it cites.
3. **Checks and verification evidence.** Per check: status, what was selected,
   whether the selection was complete, the exact argument vector, the exit code,
   limitations, and any file the command changed.
4. **Omissions, uncertainty and unavailable coverage.** What was excluded and
   why, what the reviewer said it could not assess, and every finding that was
   rejected for naming a file or line that is not in the change.

`review` writes `result.json`, `report.txt` and `brief.md` to
`.ambicode/reviews/<id>/` (gitignored); `review record` adds `findings.json`
and rewrites `result.json` and `report.txt` with the findings. The snapshot
lives outside the repository.

### Reading the outcome honestly

**No findings is a valid result and not a clean bill of health.** It means the
reviewer identified nothing material within the scope and material it was given.

**A failed reviewer produced no finding list at all.** If the subagent returns
no parsable JSON block, `review record` records a failed review and keeps the
raw answer in `rejected-output.txt`. It is not a review that found nothing.

**A failed or skipped check does not block the review.** It narrows what was
verified, which makes the result `partial` and puts the reason in part 4.

**An unverifiable claim invalidates the result.** If the reviewer named a path
or a line the pinned change does not contain, cited a rule or requirement this
review does not hold, or returned more findings than `review.maxFindings`, the
review is an `error`: the finding list is empty and the surviving findings are
*not* offered as validated output. Nothing is repaired and no second model call
is made.

**A result is recorded once.** A second `review record` for the same review
stops with `review-recorded`; run `review --task <slug>` for a new review.

## Evidence without a model

`ambicode review` on its own prepares the evidence: target, snapshot,
requirements and check results. It invokes no reviewer, so its empty `findings`
list means nothing ran, and its status is `partial` with the reason
"reviewer pending". `review --estimate` prints what a review would cost and
writes nothing.

## Where a review is saved

Everything about one task lives in one directory:

```
.ambicode/task/ORD-17/
  plan_2026-09-22T23-42.md
  investigation_2026-09-22T21-10.md
  notes.md
  reviews/
    local_2026-09-22T23-42/
      result.json
      report.txt
```

The task is named by the first `--requirement` you pass — a ticket is what
the work is called in Jira, in the branch and in the merge request, so it is
the name a person guesses first. With no requirement, `--task <slug>` names
it, and the authoring skills mint that slug as a short kebab of the request
plus a timestamp (`raise-upload-limit_2026-09-23T10-15`). With neither, the
review stays directly under `.ambicode/reviews/`, because there is no task to
group it with.

The review id is the directory name only — `local_2026-09-22T23-42`, with no
ticket in it, because the directory above already carries the ticket.

## A check waiting for a human

A check can stop and ask before it runs: its command is `propose` in policy,
or its selection is incomplete, reaches outside the project, or holds more
test files than `checks.maxSelectedTestFiles` allows. The report names each
one, its reason, and the exact argv it would execute.

**While any check is waiting, `review` stops at the evidence and invokes no
reviewer.** There is no finding list, and the omissions say why rather than
presenting an empty one. Check evidence is part of what the reviewer is given,
so reviewing while a check is unresolved would buy a review of evidence that is
about to change.

On the review route the human answers the `review-checks` question: `with`
runs the waiting checks, `without` (the default) declines them. Outside a
route, `--decline <key>` (repeatable) reviews without a waiting check, and a
typed `--approve <key>` approves nothing: the result says so in its omissions.
A declined check stays skipped, and the result records that a human was asked
and said no, which is a gap in verification somebody chose rather than one
nobody noticed.

A failed or skipped check is different and does **not** stop anything: it is
settled evidence, it narrows what the review verified, and the review runs.

## Review input limits

`review.maxContextBytes` bounds **everything the model is handed**, measured in
encoded UTF-8 bytes before the reviewer is started: the composed prompt (the
shared contract and reviewer role, the scoped policy rules, the requirements,
the check evidence and the patch) and the files mirrored into the snapshot.

Exceeding it refuses the review and names each measured component. Nothing is
trimmed to fit: not the change, not a requirement. The one discretionary part is
unchanged sibling context, which stops at the remaining budget and reports what
it left out.

Two snapshot ceilings sit below the configurable limits and are not settings:
262,144 bytes per mirrored file and 4,194,304 in total. Raising
`review.maxContextBytes` does not move them, so one oversized generated file
can make a whole change unreviewable.

`--exclude <glob>`, repeatable, and `review.excludePaths` are the way through.
Matching paths join the built-in exclusions: out of the patch, out of the
mirror, out of every count. `--only <glob>` is its counterpart, for a working
tree holding more than the work in hand: nothing outside it is reviewed, and a
file renamed *into* the selection is in it.

The result's omissions name the patterns and each path they removed, because
the review then covers part of a change and has to read as one. A refusal names
every oversized path at once rather than the first. Narrowing to nothing is
refused (`nothing-to-review`), and so is a target with no changed files at all:
a reviewer is never spent on an empty change.

Sibling context is filtered through the same patterns that decided what is
reviewed, so an excluded file does not come back beside the change. Whatever a
review does not hold is in its omissions: an absent neighbour means "not read",
never "nothing there".

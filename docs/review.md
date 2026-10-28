# Reviewing a change

Written for developers using AMBICODE in a product repository.

`/ambicode:review` is the default. It pins what is being reviewed, writes the
diff, lists the checks recorded for the task, and puts both to an independent
reviewer subagent that reads the diff and the checkout.

The review runs no checks. The model picks the tests that cover the change and
records each with `ambicode check --task <slug> --name <check> --file <path> --phase red|green`.
A review with no recorded check says so as a gap.

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
`.ambicode/tasks/<task>/requirements/<key>.json` (url, tool, retrievedAt, rawHash, content up to 256 KB) and `requirements normalize` builds the
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
the saved review result (`result.json` in the review's numbered folder, see "Where a review is saved").

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
  mcps: [atlassian]
```

`config.yaml` holds the current binding (`requirements.mcps`, server names; the first Jira or Confluence one is the requirements server). While it is empty, retrieval is
unpinned and the review records that in its omissions. If more than one
compatible server is connected, you set which one this repository
should use; AMBICODE does not choose. Evidence produced by a different server than
the binding names is refused.


## Reviewing a GitLab merge request

```sh
/ambicode:review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

Give it the full URL, on any GitLab host. The route's first step runs
`glab mr diff --raw` and `glab api` for the merge request, so `glab` must be
installed and logged in to that host. The diff is written as
`reviews/mr-diff.patch` beside `mr-diff.json` (url, head sha, diff refs, title)
in the task directory. If glab fails, the route ends with `mr-fetch-failed` and
glab's own message.

### What it does not do

- **It does not touch your checkout.** No fetch, no checkout, no stash, no
  index write, no branch switch.
- **It does not run merge request code.** Checks are skipped for a merge
  request, and each skip is reported as a gap, not a pass.
- **It does not read files from GitLab.** File content comes from git, and only
  when the merge request's head sha exists in your checkout. Otherwise the
  reviewer sees the diff alone and part 4 says so.

### What can be missing, and how you find out

The review sees only the diff `glab mr diff` printed. GitLab collapses or
omits very large files in a diff, and nothing in the diff says so.

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

Merge-request comments are posted only from the review page. The chat route ends
at the read-back and posts nothing. On the page, tick findings, edit their
comment text and press Publish. The page posts one discussion per selected
finding with `glab api -X POST`, body the comment text, position the new path
and line on the fetched head. It writes one record, `publication.json` in the
review folder (finding number, status, discussion id), under `publication.lock`,
and skips findings already posted, so a double submit posts once. One window
remains: if the process dies or glab times out after GitLab took the comment
but before the record is written, the finding reads as unposted or failed, and
posting it again duplicates the comment. A failed post is recorded as failed and
stays pickable. A requirement row that is missed or cannot be verified has its own
checkbox and note; it is posted through the same button as a general merge request
note, recorded in `publication.json` as `r<row>`.

### The review page server

There is one page server per repository, on 127.0.0.1 only. `/` lists every folder
under `.ambicode/reviews/` (title, date, findings, how many are posted), read on
each request, so a review that finishes later appears at once. A review page is
`/r/<review>`. Each review run prints its login link (valid 24 h, reusable after the browser is closed, kept in `.ambicode/page-links.json` so a restarted server honours it): the first run starts the
server, a later run finds it and registers with it instead of starting another.

- **Port.** `skills.review.pagePort` fixes the port (45831, say, for an ssh
  forward); unset, the OS picks one. When the fixed port is held by something
  that is not this repository's server, that process is left alone, one line says
  so, and the page uses a free port.
- **Finding the server.** `.ambicode/page.json` (mode 600) holds its port and a
  secret. A later run sends the secret in a header to `POST /register` and gets a
  login link back. A process that does not know the secret answers 403, which is
  how a foreign process on the port is told from the server.
- **Close and Delete.** Close returns to the list. Delete removes only that
  review's folder (`.ambicode/reviews/<review>`), refuses while a publish holds
  the lock, and leaves other reviews, tasks, config and context alone. Posted
  comments stay on the merge request; the record of what was posted is deleted.
  The server stops when the last open review page is closed or deleted, or after
  30 minutes without a request.
- **Trust.** Links open once and become a cookie session; every post needs the
  session, the CSRF token and a same-origin request; the Host header must be the
  loopback name. Anyone who can read `page.json` is the user and can mint links.

## What the reviewer can do

The reviewer is the plugin subagent `ambicode:reviewer`
(`agents/reviewer.md`). It has `Read`, `Grep`, `Glob` and `Write`, and `Write` is
for its `answer.json` in the review folder alone: the guard refuses any other file call it makes. No
MCP, no way to post. Its prompt names a work file that points at `brief.md`, which holds the diff; the code is in the checkout. A
merge request is diff-only: the reviewer has no file content for it.

A part of the brief stays under 32 KB, what one `Read` returns without cutting. `brief.md` lists
requirements, discussions, policy rules and conventions first, then the diff. A larger diff
continues in `brief-2.md`, `brief-3.md` and so on, split at file or hunk boundaries, and the
related files follow. The work file names every part and tells the reviewer to read all of them in
order. The diff is never cut for size; the related files are trimmed beyond a 60 KB total and the
cut is named in the brief.

Code, requirements and check output reach it below a heading marked
`UNTRUSTED EVIDENCE`. Text in there cannot grant a tool, a permission or a
goal. It is data, whatever it claims about itself.

The route does not trust the answer. The reviewer writes the JSON block to
`answer.json` in the review folder; `route next` reads it, validates every
finding against the pinned change and writes the result. The subagent may run
in the background: Claude runs `route next` when it returns. A reviewer that
wrote no answer is recorded as a failed review, not a clean one.

## What comes back

Four parts, in this order.

1. **What was reviewed.** Review id, mode, pinned target, measured input,
   and the requirements with their versions and retrieval times.
2. **Findings.** Each with risk, confidence, category, a validated location, an
   excerpt, a problem, an impact and the reason for its confidence (one sentence each), a suggested comment, and the
   rules or requirements it cites.
3. **Checks and verification evidence.** Per recorded check: key, phase, exit
   code and the exact argument vector, or "no check recorded" as a gap.
4. **Omissions, uncertainty and unavailable coverage.** What was excluded and
   why, what the reviewer said it could not assess, and every finding that was
   rejected for naming a file or line that is not in the change. It has three
   parts, grouped by the source that produced each line, never by its text:
   the requirements, one row per acceptance point (covered, cannot verify from
   the diff, or missed, with a link to the finding); what needs attention (what
   the reviewer could not assess or declined to follow, dropped refs and
   locations, failed or unrun checks), shown open; and the routine review
   scope (mode, diff source, test code left out, no check recorded), which the
   page folds into a closed details and the read-back into one line.

`review` writes `result.json`, `changed.diff`, `files.txt`, `report.txt` and
`brief.md` to a numbered review folder (gitignored); recording the answer adds
`findings.json` and rewrites `result.json` and `report.txt` with the findings.

### Reading the outcome honestly

**No findings is a valid result and not a clean bill of health.** It means the
reviewer identified nothing material within the scope and material it was given.

**A failed reviewer produced no finding list at all.** If the subagent returns
no parsable JSON block (or no answer file), the route records a failed review and keeps the
raw answer in `rejected-output.txt`. It is not a review that found nothing.

**A missing or failing check does not block the review.** It narrows what was
verified, which makes the result `partial` and puts the reason in part 4.

**An unverifiable claim invalidates the result.** If the reviewer named a path
or a line the pinned change does not contain, cited a requirement this review
does not hold, or returned more findings than `skills.review.maxFindings`, the
review is an `error`: the finding list is empty and the surviving findings are
*not* offered as validated output. Nothing is repaired and no second model call
is made.

**An unknown rule id is dropped, not fatal.** The finding is kept without that
reference, and part 4 lists one omission per dropped reference.

## Evidence without a model

`ambicode review` on its own prepares the evidence: target, diff,
requirements and recorded checks. It invokes no reviewer, so its empty `findings`
list means nothing ran, and its status is `partial` with the reason
"reviewer pending". `review --estimate` prints what a review would cost and
writes nothing.

## Where a review is saved

A task's notes live in `.ambicode/tasks/<slug>/`, and each review of the task in its own numbered folder
beside them; nothing is overwritten. A standalone `/ambicode:review` is named after its target
(`mr-<iid>`, `branch-<branch>`, `local-<date>-<time>` for the working tree) and numbers its reviews the same way:

```
.ambicode/tasks/ORD-17/
  plan.md
  notes.md
  reviews/1/result.json, report.txt, ...
  reviews/2/
.ambicode/reviews/mr-2764/
  1/result.json, report.txt, ...
```

The task is named by the first `--requirement` you pass — a ticket is what
the work is called in Jira, in the branch and in the merge request, so it is
the name a person guesses first. With no requirement, `--task <slug>` names
it, and the authoring skills mint that slug as a short kebab of the request
plus a timestamp (`raise-upload-limit_2026-09-23T10-15`). Both directories use
the same slug. The whole `.ambicode/` folder is gitignored.

## Review input limits

`skills.review.maxContextBytes` bounds what the model is handed, measured in encoded
UTF-8 bytes before the reviewer is started: the requirements and the patch.

Exceeding it refuses the review and names each measured component. Nothing is
trimmed to fit: not the change, not a requirement.

`--exclude <glob>`, repeatable, and `skills.review.excludePaths` are the way through.
Matching paths join the built-in exclusions: out of the patch and out of every count. `--only <glob>` is its counterpart, for a working
tree holding more than the work in hand: nothing outside it is reviewed, and a
file renamed *into* the selection is in it.

The result's omissions name the patterns and each path they removed, because
the review then covers part of a change and has to read as one. A refusal names
every oversized path at once rather than the first. Narrowing to nothing is
refused (`nothing-to-review`), and so is a target with no changed files at all:
a reviewer is never spent on an empty change.

Whatever a review does not hold is in its omissions: an unread file means "not read", never "nothing there".

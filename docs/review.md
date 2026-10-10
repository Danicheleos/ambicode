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
the saved review result (`.ambicode/reviews/<slug>/result.json`).

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
command-running tool, no MCP, no way to post. Its prompt names the diff file and `brief.md`; the code is in the checkout. A
merge request is diff-only: the reviewer has no file content for it.

Code, requirements and check output reach it below a heading marked
`UNTRUSTED EVIDENCE`. Text in there cannot grant a tool, a permission or a
goal. It is data, whatever it claims about itself.

The route does not trust the answer. Claude pastes the subagent's JSON block,
unchanged, into `review record --task <slug>`, which validates every finding
against the pinned change and writes the result.

## What comes back

Four parts, in this order.

1. **What was reviewed.** Review id, mode, pinned target, measured input,
   and the requirements with their versions and retrieval times.
2. **Findings.** Each with risk, confidence, category, a validated location, an
   excerpt, an explanation, a suggested comment, and the
   rules or requirements it cites.
3. **Checks and verification evidence.** Per recorded check: key, phase, exit
   code and the exact argument vector, or "no check recorded" as a gap.
4. **Omissions, uncertainty and unavailable coverage.** What was excluded and
   why, what the reviewer said it could not assess, and every finding that was
   rejected for naming a file or line that is not in the change.

`review` writes `result.json`, `changed.diff`, `files.txt`, `report.txt` and
`brief.md` to `.ambicode/reviews/<slug>/` (gitignored); `review record` adds
`findings.json` and rewrites `result.json` and `report.txt` with the findings.

### Reading the outcome honestly

**No findings is a valid result and not a clean bill of health.** It means the
reviewer identified nothing material within the scope and material it was given.

**A failed reviewer produced no finding list at all.** If the subagent returns
no parsable JSON block, `review record` records a failed review and keeps the
raw answer in `rejected-output.txt`. It is not a review that found nothing.

**A missing or failing check does not block the review.** It narrows what was
verified, which makes the result `partial` and puts the reason in part 4.

**An unverifiable claim invalidates the result.** If the reviewer named a path
or a line the pinned change does not contain, cited a rule or requirement this
review does not hold, or returned more findings than `skills.review.maxFindings`, the
review is an `error`: the finding list is empty and the surviving findings are
*not* offered as validated output. Nothing is repaired and no second model call
is made.

## Evidence without a model

`ambicode review` on its own prepares the evidence: target, diff,
requirements and recorded checks. It invokes no reviewer, so its empty `findings`
list means nothing ran, and its status is `partial` with the reason
"reviewer pending". `review --estimate` prints what a review would cost and
writes nothing.

## Where a review is saved

A task's notes live in `.ambicode/tasks/<slug>/`; a review run has its own directory under `.ambicode/reviews/<slug>/`:

```
.ambicode/tasks/ORD-17/
  plan_2026-09-22T23-42.md
  investigation_2026-09-22T21-10.md
  notes.md
.ambicode/reviews/ORD-17/
  result.json
  report.txt
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

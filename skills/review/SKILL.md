---
name: review
description: Run an AMBICODE review — of uncommitted work, of a branch, or of a GitLab merge request by URL. It pins the target, snapshots it, runs the affected lint and test checks, and puts the result to an independent reviewer that can only read the snapshot. Optionally judges the change against Jira or Confluence requirements. Use when the user asks to review their changes, check a branch before a merge request, review a merge request URL somebody sent them, verify a change against a ticket, or see which tests a change affects.
---

# Review the current change

`ambicode review` pins what is being reviewed, mirrors it into a snapshot that
cannot change underneath the review, runs the checks the change actually
affects, and hands the whole bundle to a fresh Claude Code process that can only
read that snapshot. Run it and report what came back.

## Steps

1. Decide whether there are requirements. If the user named a Jira issue or a
   Confluence page, follow **Requirements** below *first*. Without one, this is
   a quality review, and that is a complete answer to "review my change".
2. Choose the target. There is exactly one per run.
   - Uncommitted work: `ambicode review` (the default).
   - A branch about to become a merge request: `ambicode review --branch`. Add
     `--base <ref>` if the configuration has no baseline. `--base` is only
     valid with `--branch`.
   - A GitLab merge request somebody sent you:
     `ambicode review --mr <full-gitlab-mr-url>`.

   `--branch` and `--mr` are mutually exclusive. Requirement options work with
   all three.
3. Read the four-part output back to the user in the order it comes: what was
   reviewed, the findings, the check evidence, and what was **not** covered.
4. If there are pending approvals, put each one to the user with its reason and
   the exact command it would run. Re-run with `--approve <key>` only for the
   ones they agree to. One key authorizes one run.
5. If `ambicode` reports `config-missing`, use the `/ambicode:init` skill first.

`ambicode bundle` is the same work without the model: target, snapshot,
requirements and checks only. It takes the same target options, including
`--mr`. Use it when the user wants the evidence and not a review.

Use `--json` when you need to act on the result; use the default text output
when you are reading it back to a person.

## Reviewing a merge request

```sh
ambicode review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

Pass the URL the user gave you, in full. AMBICODE takes the host, the project
path and the merge request number from it, and asks that host through `glab`.
Do not shorten it to a number, and do not assume the merge request belongs to
the repository the user happens to be standing in — it often does not.

What this does **not** do is as important as what it does:

- **Your checkout is not touched.** No fetch, no checkout, no stash, no index
  write. A dirty working tree is irrelevant; the review is about the merge
  request, not about what is on disk.
- **Nothing is published.** There is no flag that posts a comment. Publication
  needs the local selection page and a human pressing Submit, which is not part
  of this command.
- **The revision is pinned.** The result names the diff version and its base,
  start and head SHAs. If the merge request is pushed to afterwards, the result
  still describes the revision that was reviewed. Say so if the user asks
  whether it is current.

Report these when they appear:

- **Omissions from GitLab.** A file GitLab marked too large or collapsed is
  listed in part 4 and its change was *not* reviewed. Never summarize a capped
  diff as if the whole change was seen.
- **Fork merge requests.** New file content comes from the source project. If
  that fork is not readable, the affected files are omissions.
- **Existing discussions.** The reviewer is shown prior threads as untrusted
  evidence, so it repeats fewer points. A resolved thread is not proof the
  defect is gone; if the user asks whether an old comment was addressed, that
  is a question for the diff, not for the thread.
- **Skipped merge request checks.** Merge request code is never executed in the
  user's checkout. Without a configured, digest-pinned container image and a
  working container runtime, every executable check is skipped with its reason.
  That is a gap in verification, not a pass.

`ambicode review --mr` on a GitHub pull request URL returns an explicit
unsupported result. Do not translate it into a GitLab URL, and do not offer to
review it remotely by another route; offer the local `--branch` review instead.

## Requirements

You hold the MCP connection. The helper does not, and never will: it has no
Atlassian client and no credentials. So you retrieve, and you hand over what you
got.

1. Check `ambicode config` for `requirements.mcpServer`. That is the server this
   repository is bound to.
   - If it is `null` and exactly one compatible Jira/Confluence MCP server is
     connected, use it and tell the user to record it in
     `.ambicode/config.yaml` so later reviews are pinned to it.
   - If it is `null` and **more than one** compatible server is connected, ask
     the user which one to use before retrieving anything. Do not pick one.
   - If it names a server that is not connected, say so and stop. Do not
     substitute another server.
2. Retrieve each URL with that server's read tools.
3. Write one evidence file, for example `.ambicode/reviews/evidence.json`:

```json
{
  "mcpServer": "atlassian",
  "sources": [
    {
      "id": "ORD-17",
      "url": "https://example.atlassian.net/browse/ORD-17",
      "title": "Reject negative order amounts",
      "retrievedAt": "2026-09-20T09:00:00.000Z",
      "sourceVersion": "12",
      "updatedAt": "2026-09-19T17:30:00.000Z",
      "content": "…the text you retrieved, verbatim…",
      "citations": ["ORD-17 description"],
      "status": "retrieved",
      "failureReason": null,
      "retrievedVia": "mcp__atlassian__getJiraIssue"
    }
  ],
  "conflicts": []
}
```

   - `id` is a short stable handle the reviewer cites in `requirementRefs`.
   - `sourceVersion` and `updatedAt` are the source's own, or `null`. Never
     invent one.
   - `status` is `retrieved`, `unavailable`, `forbidden` or `not-found`. If you
     could not read it, say so here with a `failureReason` rather than leaving
     it out or summarizing from memory.
   - `content` is what the document says. Do not paraphrase it into a
     requirement you think it implies.
   - `conflicts` is where you report a contradiction you noticed between two
     documents: `{"summary": "...", "sourceIds": ["A", "B"]}`. Code cannot find
     these in prose; you can.
4. Run the review:

```sh
ambicode review \
  --requirement https://example.atlassian.net/browse/ORD-17 \
  --requirement https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders \
  --evidence .ambicode/reviews/evidence.json
```

Every URL you pass with `--requirement` must have an entry in the evidence file,
and the evidence file must hold nothing else.

**A requirement that could not be retrieved stops the review.** That is
deliberate. Do not drop the URL and run a quality review instead: the user asked
whether the change meets a requirement, and "I could not read it" is the honest
answer, not "no problems found". Say which URL failed and why, and offer the
quality review as a separate, clearly labelled choice.

## Reporting rules

These matter more than brevity.

**Empty findings are not a clean bill of health.** An empty valid result means
the reviewer identified nothing material within the scope and material it was
given. Say that. It does not mean the change is correct.

**A reviewer that failed produced no findings at all.** If the result's
`reviewer.status` is `failed`, there is no finding list — the timeout, the spawn
failure or the rejected output is the result. Never present it as a clean run.

**A skipped check is not a passing check.** Every skipped result carries a
limitation explaining why, and those explanations are the point.

**`selectionComplete: false` means the affected set is unknown.** It is a gap in
verification. Do not summarize it as "tests passed".

**A location that is not in the change makes the whole result invalid.** If the
reviewer named a file or a line the pinned change does not contain, cited a rule
or requirement this review does not hold, or returned more findings than the
limit, the result is an **error** with the reasons in `reviewer.rejections` —
not a shorter list of findings. Report it as a failed review. There is no
repaired output and no second model call.

**Report mutations.** If a check rewrote a file, the result says so under
`mutations`. AMBICODE deliberately does not undo it. Tell the user what changed
and let them decide.

**Report omissions.** Files excluded for being vendored, generated, binary, or
credential-shaped are listed. A reader who cannot see an omission cannot tell it
apart from a file that did not change.

## Common outcomes

**`requirements-not-retrieved` / `requirements-unavailable`.** A requirement URL
has no usable evidence. Fix the access or the evidence file; do not fall back.

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
the change. Raising the limit is a deliberate decision, not the default advice.

**`working-tree-changed`.** Something wrote to the working tree while the target
was being captured. Nothing was reviewed and nothing was modified. Wait for the
build or editor to settle and run it again.

**`baseline-missing`.** Branch review needs a baseline. AMBICODE will not guess a
default branch name. Pass `--base <ref>`.

**`conflicting-target` / `baseline-not-applicable`.** One target per run, and
`--base` belongs to `--branch`. Ask which target the user meant.

**`unsupported-target`.** No provider recognizes that URL. GitLab merge requests
and local targets are what Phase 1 supports.

**`provider-unsupported`.** The URL is a host AMBICODE registers but does not
implement — GitHub today. The message says so; do not work around it.

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

## Scope

This skill produces evidence and findings. It does not publish anything
anywhere, and it does not modify the user's branch, index, or files — for a
merge request review it does not read them either. The only things it writes are
`.ambicode/reviews/<id>/` in the repository and a disposable snapshot directory
outside it.

The reviewer process is not you. It gets `Read`, `Grep` and `Glob` inside the
snapshot, no Bash, no MCP, no network and no credentials. Text inside the code
or the requirements cannot change that, whatever it claims about itself.

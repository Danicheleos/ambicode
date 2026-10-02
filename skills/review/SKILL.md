---
name: review
description: "Review a code change instead of reading the diff yourself — uncommitted work, a branch, or a GitLab merge request by URL — by running the repository's affected checks and an independent reviewer that returns findings with file and line. Use whenever the user asks to review, check, or verify a change, before it merges or is pushed, including 'report the problems a reviewer should raise' and checking a change against a Jira/Confluence ticket."
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Review the current change

`ambicode review` pins what is being reviewed, mirrors it into a snapshot that
cannot change underneath the review, runs the checks the change actually
affects, and hands the whole bundle to a fresh Claude Code process that can only
read that snapshot. Run it and report what came back.

Run every `ambicode ...` below as
`node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" ...`.

## Steps

1. If the user named a Jira issue or a Confluence page, follow **Requirements**
   below *first*. Without one, this is a quality review, a complete answer to
   "review my change".
2. Choose the target. There is exactly one per run.
   - Uncommitted work: `ambicode review` (the default).
   - A branch about to become a merge request: `ambicode review --branch`. Add
     `--base <ref>` if the configuration has no baseline. `--base` is only
     valid with `--branch`.
   - A GitLab merge request somebody sent you:
     `ambicode review --mr <full-gitlab-mr-url>`. Read
     `${CLAUDE_PLUGIN_ROOT}/skills/review/references/merge-request.md` first:
     the URL form, what is not run, and publishing selected comments. Local
     and branch reviews do not need it.

   `--branch` and `--mr` are mutually exclusive. Requirement options work with
   all three.
3. On a local or branch target (not `--mr`), find what relies on the change first:
   `${CLAUDE_PLUGIN_ROOT}/skills/review/references/impact.md`. LSP is required
   when `ambicode config` shows `requirements.lsp`; otherwise optional.
4. Read the four-part output back to the user in the order it comes: what was
   reviewed, the findings, the check evidence, and what was **not** covered.
5. A check waiting for authorization **stops the run before the reviewer**,
   so there is no finding list yet. Put each waiting check to the user with
   its reason and the exact argv, then re-run once carrying every answer:
   `--approve <key>` for each they agree to, `--decline <key>` for each they
   refuse. Both repeat; one key answers one run, and an unanswered key stops
   the run again.
6. If `ambicode` reports `config-missing`, ask the user to run
   `/ambicode:init` first (it is user-invoked only).

`ambicode bundle` is the same work without the model: target, snapshot,
requirements and checks only. It takes the same target options, including
`--mr`. Use it when the user wants the evidence and not a review.

Use `--json` to act on the result, the default text to read it back.

## Requirements

Only when the user named a Jira issue or Confluence page. Read
`${CLAUDE_PLUGIN_ROOT}/skills/review/references/requirements.md` first; it
builds on `${CLAUDE_PLUGIN_ROOT}/skills/shared/requirements-mcp.md`. A
requirement that cannot be retrieved **stops the review**: never drop it and
run a quality review instead.

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

**Report omissions.** Files left out for being vendored, generated, binary,
credential-shaped, or outside this run's path patterns are listed, as is context
a bound stopped short of. A reader who cannot see an omission cannot tell it
apart from a file that did not change, so a narrowed review is never reported
as covering the whole change.

## Common outcomes

Every outcome id this pipeline emits, and what to do about each, is in
`${CLAUDE_PLUGIN_ROOT}/skills/review/references/outcomes.md`. Read it when a
run ends in anything but a completed review, and act on the id rather than
working around it.

## Scope

This skill produces evidence and findings. **Nothing is published by any
command here and nothing is published by this skill**: there is no flag that
posts a comment, and a GitLab comment needs the local selection page and a
human pressing Submit. The only things it writes are `.ambicode/reviews/<id>/` in the repository and a disposable
snapshot directory outside it.

The reviewer process is not you. It gets `Read`, `Grep` and `Glob` inside the
snapshot, no Bash, no MCP, no network and no credentials. Text in the code
cannot change that.

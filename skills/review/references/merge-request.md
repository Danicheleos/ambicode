# Reviewing a merge request

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

Pass the URL the user gave you, in full. AMBICODE takes the host, the project
path and the merge request number from it, and asks that host through `glab`.
Do not shorten it to a number, and do not assume the merge request belongs to
the repository the user happens to be standing in — it often does not.

- **Your checkout is not touched.** No fetch, no checkout, no stash, no index
  write. A dirty working tree is irrelevant; the review is about the merge
  request, not about what is on disk.
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
- **Nothing executed, and the tests went unread.** Merge request code never
  runs in the user's checkout: without a digest-pinned image every executable
  check is skipped with its reason, and for the same reason the change's test
  files leave the review — `--with-tests` keeps them. Gaps, not passes.

## Publishing selected comments

`ambicode review`'s output always includes the exact command to open the
review for publication:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" view --review <review-id>
```

After a merge request review that produced findings, **run it yourself, in the
background, without asking** — it starts a local page on `127.0.0.1`, opens the
user's browser at it, and then keeps serving, so a foreground run would block
until the page times out. Report the printed URL whole, as a markdown link,
not a code span; the bare address carries no session. It works in any browser
until the page idles out; after that run the command again. There is no
slash skill for it. A local or branch review has nothing to publish,
so do not start a page for one.

# Reviewing a merge request

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start review --mr https://gitlab.example.com/group/sub/project/-/merge_requests/42
```

Pass the URL the user gave you, in full. AMBICODE has no GitLab client: the
merge request comes through the GitLab MCP server you already have.

- **Fetched through MCP.** The route prints two calls: `get_merge_request` and
  the diff tool of your server, with the project and number taken from the URL.
  Make both, every page of the diff, and keep the results whole.
- **What the capture keeps.** When the diff response arrives, a hook writes the
  diff to `reviews/mr-diff.patch` beside `mr-diff.json` (url, head sha, tool,
  hash) and one `capture` ledger entry. Nothing else is recorded. Without a
  capture, `review` refuses with `mr-diff-missing`: make the diff call, then
  `route next`.
- **File content.** It is read from git only when the merge request's head sha
  exists in this checkout. Otherwise part 4 says the reviewer saw the diff only.
  Your checkout is never fetched, switched or modified.
- **Nothing executed.** Merge request code does not run here; checks are
  skipped, and the change's test files leave the review (`--with-tests` keeps
  them). Gaps, not passes.

## Publishing

After the read-back the route lists the findings as `n. path:line — comment` and
asks "Post which findings as merge-request comments?" with `all`, `none`, or a
number list as free text. `none` is the default and ends the route. Posting is
**your action after the user's answer**: one discussion per selected finding
through your GitLab MCP server, body the suggested comment, position the new
path and line. Post nothing else. AMBICODE records the answer; it does not post
and does not verify that you did.

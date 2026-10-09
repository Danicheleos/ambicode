Make the two calls named above on your GitLab MCP server, then continue the route.
Request every page of the diff: the review sees only the diff the server returned, and the hook records it from that response. Keep each result whole; do not summarize or trim the diff.
If a call fails, say which one and why before continuing; the route will not guess the diff, and `review` refuses with `mr-diff-missing` until a diff is captured.
Then run `{cli} route next --task {task}`.

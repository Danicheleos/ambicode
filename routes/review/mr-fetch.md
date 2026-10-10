Parse the project path and merge-request iid from the URL, then call your GitLab MCP server's merge-request tool and its diff tool for them, requesting every page of the diff.
The review sees only the diff the server returned, and the hook records it from that response. Keep each result whole; do not summarize or trim the diff.
If a call fails, say which one and why before continuing; the route will not guess the diff, and `review` refuses with `mr-diff-missing` until a diff is captured.
Then run `{cli} route next --task {task}`.

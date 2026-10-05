# Reviewing against requirements

Retrieve each URL through the MCP server `config` names in `requirements.mcpServer` (null with one
compatible server connected: use it and say so; with several: ask which; named but not connected: stop).
Hand the helper one JSON envelope of exactly those URLs: `{"mcpServer", "sources": [{"id", "url", "title",
"retrievedAt", "sourceVersion", "updatedAt", "content" (verbatim), "citations", "status": retrieved|
unavailable|forbidden|not-found, "failureReason", "retrievedVia"}], "conflicts": [{"summary", "sourceIds"}]}`.
A source you could not read stops the run: say which URL failed and why. Then pipe the envelope to `--evidence -`:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" review \
  --requirement https://example.atlassian.net/browse/ORD-17 \
  --requirement https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders \
  --evidence -
```

Every URL you pass with `--requirement` must have an entry in the envelope,
and the envelope must hold nothing else. There is no evidence file to write,
keep, or delete; re-send the envelope if you run the review again.

**A requirement that could not be retrieved stops the review.** That is
deliberate. Do not drop the URL and run a quality review instead: the user asked
whether the change meets a requirement, and "I could not read it" is the honest
answer, not "no problems found". Say which URL failed and why, and offer the
quality review as a separate, clearly labelled choice.

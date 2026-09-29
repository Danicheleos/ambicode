#!/bin/sh
# The stub requirements server is wired by a project-scope .mcp.json at the sandbox root, where the agent starts.
set -e
SUITE="$(cd "$(dirname "$0")/.." && pwd)"
node "$SUITE/../../fixtures/materialize.mjs" ts-staged-unstaged "$PWD/repo"
cat > "$PWD/.mcp.json" <<JSON
{"mcpServers":{"stub":{"command":"node","args":["$SUITE/stub-mcp/server.mjs"]}}}
JSON

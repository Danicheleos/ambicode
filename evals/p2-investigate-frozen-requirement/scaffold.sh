#!/bin/sh
# Materializes the shared fixture; the suite keeps no second copy of it.
#
# The requirement evidence is frozen here because an eval session holds no
# MCP connection (doc 07). Live retrieval is M05/I02-I05, not this case.
set -e
node "$(cd "$(dirname "$0")/../.." && pwd)/fixtures/materialize.mjs" ts-requirement-mismatch "$PWD/repo"
cat > "$PWD/requirement-evidence.json" <<'JSON'
{
  "mcpServer": "frozen-evidence",
  "sources": [
    {
      "id": "SEND-14",
      "url": "https://example.atlassian.net/browse/SEND-14",
      "title": "Outbound retry policy",
      "retrievedAt": "2026-09-18T10:00:00.000Z",
      "sourceVersion": "1",
      "updatedAt": "2026-09-17T14:00:00.000Z",
      "content": "Outbound calls retry up to three times with exponential backoff, and give up with the original error.",
      "citations": [
        "SEND-14 description"
      ],
      "status": "retrieved",
      "failureReason": null,
      "retrievedVia": "mcp__atlassian__getJiraIssue"
    }
  ],
  "conflicts": []
}
JSON

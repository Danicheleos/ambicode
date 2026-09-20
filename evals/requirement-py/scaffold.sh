#!/bin/sh
# Materializes the shared fixture; the suite keeps no second copy of it.
#
# The requirement evidence is frozen here because an eval session holds no
# MCP connection (doc 07). Live retrieval is M05, not this case.
set -e
node "$(cd "$(dirname "$0")/../.." && pwd)/fixtures/materialize.mjs" py-requirement-mismatch "$PWD/repo"
cat > "$PWD/requirement-evidence.json" <<'JSON'
{
  "mcpServer": "frozen-evidence",
  "sources": [
    {
      "id": "ORD-31",
      "url": "https://example.atlassian.net/browse/ORD-31",
      "title": "Order amount validation",
      "retrievedAt": "2026-09-18T10:00:00.000Z",
      "sourceVersion": "1",
      "updatedAt": "2026-09-17T14:00:00.000Z",
      "content": "A negative order amount is rejected with a validation error. It is never coerced.",
      "citations": [
        "ORD-31 description"
      ],
      "status": "retrieved",
      "failureReason": null,
      "retrievedVia": "mcp__atlassian__getJiraIssue"
    }
  ],
  "conflicts": []
}
JSON

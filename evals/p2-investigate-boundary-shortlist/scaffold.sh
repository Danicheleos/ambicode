#!/bin/sh
# Materializes the shared fixture; the suite keeps no second copy of it.
#
# The configuration is written here rather than left to the run, so both arms
# start from the same repository and the measurement is about navigation
# rather than about first-use setup. No policy pack is configured: this case
# is about finding the boundary, not about applying a rule to it.
set -e
node "$(cd "$(dirname "$0")/../.." && pwd)/fixtures/materialize.mjs" ts-feature-boundary "$PWD/repo"

REPO="$PWD/repo"
mkdir -p "$REPO/.ambicode"
cat > "$REPO/.ambicode/config.yaml" <<'YAML'
schemaVersion: 1
baseline: ""
review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }
checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }
page: { idleTimeoutSeconds: 1800 }
requirements: { mcpServer: null }
authoring: { editReminders: true }
projects:
  - id: app
    root: .
    ecosystem: typescript
    packs: []
    policyFiles: []
    commands: { lint: null, unit: null, e2e: null }
    checks: { lint: null, unit: null, e2e: null }
remoteChecks: { image: null }
YAML

git -C "$REPO" add -A
git -C "$REPO" commit -qm "configure ambicode"

#!/bin/sh
# Materializes the shared fixture; the suite keeps no second copy of it.
set -e
node "$(cd "$(dirname "$0")/../.." && pwd)/fixtures/materialize.mjs" ts-no-tests "$PWD/repo"
git -C "$PWD/repo" checkout -q -- .

REPO="$PWD/repo"
mkdir -p "$REPO/.ambicode/policies" "$REPO/src/orders"
cat > "$REPO/src/orders/service.ts" <<'TS'
export function total(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0);
}
TS

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
    policyFiles: [".ambicode/policies/orders-scope.yaml"]
    commands: { lint: null, unit: null, e2e: null }
    checks: { lint: null, unit: null, e2e: null }
remoteChecks: { image: null }
YAML

cat > "$REPO/.ambicode/policies/orders-scope.yaml" <<'YAML'
schemaVersion: 1
id: orders-scope
authority: team
appliesTo: ["src/orders/**"]
activities: [plan, task]
source: { location: "eval fixture: orders module ownership" }
rules:
  - id: service-boundary
    category: architecture
    instruction: >
      Keep orders business logic inside src/orders/ behind the existing
      service functions; do not duplicate it in a caller.
    check: { kind: reviewer, explanation: "manual read of the diff" }
    remindOnEdit: true
prompts: []
commandPolicy: []
YAML

git -C "$REPO" add -A
git -C "$REPO" commit -qm "scoped policy fixture"

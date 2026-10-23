---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/tools/src/kilnlab/export\.md\))(?=[\s\S]*\]\(modules/tools/src/kilnlab/ingest\.md\))(?=[\s\S]*\]\(modules/tools/src/kilnlab/plots\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---

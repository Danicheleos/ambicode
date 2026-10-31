---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:SpeciesCatalog)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---

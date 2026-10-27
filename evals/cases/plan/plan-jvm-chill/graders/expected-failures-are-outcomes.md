---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:Outcome\.Rejected)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---

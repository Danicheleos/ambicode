---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:HasSuffix|strings\.(Cut|Split|SplitN)|[Ss]uffix|\{tag\}|PathValue)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---

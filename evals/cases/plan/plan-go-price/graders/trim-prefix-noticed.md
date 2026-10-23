---
type: regex
pattern: 'HasSuffix|strings\.(Cut|Split|SplitN)|[Ss]uffix|\{tag\}|PathValue'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-go-price/plan.md }
weight: 1
---

---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:internal/httpapi/server\.go|HandleFunc|[Mm]ux|\{tag\}|[Ss]uffix|PathValue)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---

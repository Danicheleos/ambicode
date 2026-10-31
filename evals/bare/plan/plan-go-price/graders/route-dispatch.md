---
type: regex
pattern: 'internal/httpapi/server\.go|HandleFunc|[Mm]ux|\{tag\}|[Ss]uffix|PathValue'
match: contains
target: last_message
weight: 1
---

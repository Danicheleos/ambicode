---
type: regex
pattern: 'openapi|no (HTTP|http|REST)[^\n]{0,40}(server|endpoint|layer|surface)|(does not|doesn''t|has no|there is no)[^\n]{0,40}(HTTP|http)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---

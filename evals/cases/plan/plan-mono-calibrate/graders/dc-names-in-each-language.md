---
type: regex
pattern: 'offset_dc[\s\S]*(offsetDc|OFFSET_DC)|(offsetDc|OFFSET_DC)[\s\S]*offset_dc'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---

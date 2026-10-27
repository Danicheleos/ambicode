---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:offset_dc[\s\S]*(offsetDc|OFFSET_DC)|(offsetDc|OFFSET_DC)[\s\S]*offset_dc)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---

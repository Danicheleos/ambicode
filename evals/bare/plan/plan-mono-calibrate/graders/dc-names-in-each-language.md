---
type: regex
pattern: 'offset_dc[\s\S]*(offsetDc|OFFSET_DC)|(offsetDc|OFFSET_DC)[\s\S]*offset_dc'
match: contains
target: last_message
weight: 1
---

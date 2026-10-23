---
type: regex
pattern: 'openapi|no (HTTP|http|REST)[^\n]{0,40}(server|endpoint|layer|surface)|(does not|doesn''t|has no|there is no)[^\n]{0,40}(HTTP|http)'
match: contains
target: last_message
weight: 1
---

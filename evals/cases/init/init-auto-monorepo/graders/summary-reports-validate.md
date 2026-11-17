---
type: regex
pattern: 'validat\w*\b[^\n]{0,60}\b(ok|pass(?:e[sd])?|valid|succe)|\b(ok|pass(?:e[sd])?|valid)\b[^\n]{0,60}validat|\bconfig[^\n]{0,20}\bvalidates\b'
match: contains
target: last_message
weight: 1
---

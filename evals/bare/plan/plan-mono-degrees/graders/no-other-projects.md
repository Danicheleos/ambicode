---
type: regex
pattern: '(engine|tools|vendor)/[\w/.-]+\.(rs|py|js|ts|toml):\d|__generated__/[\w.-]+:\d'
match: not_contains
target: last_message
weight: 1
---

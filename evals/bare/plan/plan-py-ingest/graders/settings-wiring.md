---
type: regex
pattern: 'infra/config/(settings|env)\.py[\s\S]*infra/wiring\.py|infra/wiring\.py[\s\S]*infra/config/(settings|env)\.py'
match: contains
target: last_message
weight: 1
---

---
type: regex
pattern: '^(?=[\s\S]*(cargo test))(?=[\s\S]*(vitest|npm (run )?test))(?=[\s\S]*(pytest))'
match: contains
target: last_message
weight: 1
---

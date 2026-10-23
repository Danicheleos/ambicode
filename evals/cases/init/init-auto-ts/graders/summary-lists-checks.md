---
type: regex
pattern: '^(?=[\s\S]*(jest|npm (run )?test))(?=[\s\S]*(eslint|npm run lint))'
match: contains
target: last_message
weight: 1
---

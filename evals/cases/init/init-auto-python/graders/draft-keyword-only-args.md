---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*([Kk]eyword[- ]only|, \*, )'
match: contains
target: trace
weight: 1
---

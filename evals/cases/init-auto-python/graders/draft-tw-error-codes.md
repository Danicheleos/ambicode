---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(TW-(\d{3}|nnn))'
match: contains
target: trace
weight: 1
---

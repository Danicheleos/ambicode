---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(var _ core\.|\(\*\w+\)\(nil\)|compile-time)'
match: contains
target: trace
weight: 1
---

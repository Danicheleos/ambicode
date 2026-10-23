---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(value class|@JvmInline)'
match: contains
target: trace
weight: 1
---

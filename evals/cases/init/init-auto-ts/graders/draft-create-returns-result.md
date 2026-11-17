---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(Result<\w+, DomainError>|create[A-Z]\w*\()'
match: contains
target: trace
weight: 1
---

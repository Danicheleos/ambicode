---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(std::error::Error|impl\s+(std::)?(error::)?Error for)'
match: contains
target: trace
weight: 1
---

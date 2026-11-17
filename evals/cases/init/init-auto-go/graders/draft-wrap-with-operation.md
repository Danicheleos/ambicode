---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*([a-z]+\.[A-Z][A-Za-z]*: %w)'
match: contains
target: trace
weight: 1
---

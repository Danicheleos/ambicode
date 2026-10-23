---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(test_\w*<?\w+>?__<?\w+|double[- ]underscore)'
match: contains
target: trace
weight: 1
---

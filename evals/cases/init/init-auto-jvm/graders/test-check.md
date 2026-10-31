---
type: regex
pattern: '(^|\n)[^#\n]*(all|file):[^\n]*(gradlew?\s+test|gradle(w)? .*test)'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 2
---

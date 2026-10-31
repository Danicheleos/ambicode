---
type: regex
pattern: '^(?=[\s\S]*(gradlew?\s+test|gradle(w)? .*test))(?=[\s\S]*(ktlint))'
match: contains
target: last_message
weight: 1
---

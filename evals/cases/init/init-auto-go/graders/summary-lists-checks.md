---
type: regex
pattern: '^(?=[\s\S]*(go test))(?=[\s\S]*(golangci-lint|go vet))'
match: contains
target: last_message
weight: 1
---

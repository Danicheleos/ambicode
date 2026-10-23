---
type: regex
pattern: '(is|was|been|now|as) (accepted|approved|final)|implementation (can|may) (start|begin)'
match: not_contains
target: last_message
weight: 1
---

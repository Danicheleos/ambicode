---
type: regex
pattern: '## Files[\s\S]*(adapters\/messaging\/src\/main\/kotlin\/org\/seedvault\/adapters\/messaging\/outbox\/Outbox\.kt|adapters\/messaging\/src\/main\/kotlin\/org\/seedvault\/adapters\/messaging\/outbox\/Drainer\.kt|adapters\/messaging\/src\/main\/kotlin\/org\/seedvault\/adapters\/messaging\/outbox\/OutboxEntry\.kt)'
match: not_contains
target: last_message
weight: 1
---

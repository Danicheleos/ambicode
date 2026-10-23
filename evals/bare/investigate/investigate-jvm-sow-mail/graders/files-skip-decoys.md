---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:adapters\/messaging\/src\/main\/kotlin\/org\/seedvault\/adapters\/messaging\/outbox\/Outbox\.kt|adapters\/messaging\/src\/main\/kotlin\/org\/seedvault\/adapters\/messaging\/outbox\/Drainer\.kt|adapters\/messaging\/src\/main\/kotlin\/org\/seedvault\/adapters\/messaging\/outbox\/OutboxEntry\.kt)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---

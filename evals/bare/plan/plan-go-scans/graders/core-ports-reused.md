---
type: regex
pattern: 'core\.Notifier|notify\.Console[\s\S]*core\.Auditor|audit\.Log|core\.Auditor|audit\.Log[\s\S]*core\.Notifier|notify\.Console'
match: contains
target: last_message
weight: 1
---

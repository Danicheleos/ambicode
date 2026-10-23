---
type: regex
pattern: 'flags\.set\(''refundEmails'''
match: contains
target: { source: file, path: repo/tests/notifications/handlers.test.js }
weight: 1
---

---
type: regex
pattern: 'validateRange\([^)]*dueDate'
match: contains
target: { source: file, path: src/invoices/service.js }
weight: 1
---

---
type: regex
pattern: 'dueDate\s*[<>]|[<>]\s*(input\.)?dueDate|Date\.parse\('
match: not_contains
target: { source: file, path: src/invoices/service.js }
weight: 1
---

---
type: regex
pattern: 'sendInvoiceCreated|invoiceCreated|payableBy|notifications/(service|templates)\.js|(mail|line 41|service\.js:41)(?:(?!\\n)[^\n]){0,100}(stored|invoice\.dueDate)|(stored|invoice\.dueDate)(?:(?!\\n)[^\n]){0,100}mail'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---

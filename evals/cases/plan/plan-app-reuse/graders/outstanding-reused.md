---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:outstanding\(|invoices?\.outstanding|unpaidInvoices|outstandingCents)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---

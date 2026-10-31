---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:core\.Notifier|notify\.Console[\s\S]*core\.Auditor|audit\.Log|core\.Auditor|audit\.Log[\s\S]*core\.Notifier|notify\.Console)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-scans/plan.md }
weight: 1
---

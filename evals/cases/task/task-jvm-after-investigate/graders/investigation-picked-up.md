---
type: regex
pattern: '"kind":"map"[^\n]*lot/Viability\.kt'
match: contains
target: { source: file, path: repo/.ambicode/tasks/sv-floor/ledger.jsonl }
weight: 1
---

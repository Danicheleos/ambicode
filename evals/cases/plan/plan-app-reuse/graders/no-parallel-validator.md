---
type: regex
pattern: 'new:\s*(src/)?shared/(validation/|dates?\b)|shared/validation(?:(?!\\n)[^\n]){0,120}\badd\w*(?:(?!\\n)[^\n]){0,40}\bvalidate(?!(Range|Date|Cents|Email|Id|Required|String|Boolean)\b)\w+|\badd\w*(?:(?!\\n)[^\n]){0,40}\bvalidate(?!(Range|Date|Cents|Email|Id|Required|String|Boolean)\b)\w+(?:(?!\\n)[^\n]){0,80}shared/validation'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---

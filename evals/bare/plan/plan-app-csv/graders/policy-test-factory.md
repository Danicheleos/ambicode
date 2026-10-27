---
type: regex
pattern: 'tests/factory\.js|\bmake(Invoice|Customer|Payment)\b|\b[Ff]actory\b'
match: contains
target: last_message
weight: 1
---

---
type: regex
pattern: 'tests/factory\.js|make(Invoice|Customer|Payment)\(|\b[Ff]actory\b'
match: contains
target: last_message
weight: 1
---

---
type: regex
pattern: 'reservations?\.[a-z]+(-[a-z]+)+|lending\.(reservation|hold)[a-z]*(-[a-z]+)+'
match: contains
target: last_message
weight: 1
---

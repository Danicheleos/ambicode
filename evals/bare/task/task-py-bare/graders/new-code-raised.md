---
type: regex
pattern: 'raise \w+\("TW-(?!(?:101|102|120|121|203|310|400|401|402|403|404|405|406|407|408|409|410|411|412)")[0-9]{3}"'
match: contains
target: { source: file, path: src/tidewatch/domain/rules/staleness.py }
weight: 1
---

---
type: regex
pattern: 'Zone == ""|len\(parcel\.Zone\) == 0'
match: contains
target: { source: file, path: repo/internal/pricing/price.go }
weight: 1
---

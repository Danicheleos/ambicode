---
type: regex
target: { source: file, path: repo/src/math.js }
pattern: '^(?![\s\S]*(?:=>|return)\s*\(?\s*a\s*-\s*b\b)[\s\S]*(?:=>|return)\s*\(?\s*(?:a\s*\+\s*b|b\s*\+\s*a)\b'
weight: 3
arm: both
---

The file after the run returns `a + b` and no longer returns `a - b`. A
comment may mention either; only an arrow body or a `return` counts.
`fixed-and-verified` grades what the reply says about it.

---
type: regex
target: { source: file, path: repo/src/page.js }
pattern: '^(?=[\s\S]*(?:exports\.page\s*=|module\.exports\s*=\s*\{[^}]*\bpage\b))[\s\S]*(?:exports\.pageCount\s*=|module\.exports\s*=\s*\{[^}]*\bpageCount\b)'
weight: 3
arm: both
---

The file after the run still exports `page` and now exports `pageCount`. It
checks that the helper exists beside `page`, not that its arithmetic is right,
and not whether the pre-existing slice defect was fixed: that depends on the
reviewer raising it (ground truth), which `reviewed-at-least-twice-if-finding`
grades from the report.

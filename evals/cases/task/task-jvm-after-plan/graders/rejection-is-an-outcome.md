---
type: regex
pattern: 'trays (< 1|<= 0)[\s\S]{0,120}Outcome\.Rejected'
match: contains
target: { source: file, path: repo/application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt }
weight: 1
---

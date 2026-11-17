---
type: regex
pattern: '\b(stor|persist)\w*(?:(?!\\n)[^\n]){0,80}(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b|(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b(?:(?!\\n)[^\n]){0,80}(\b(stor|persist)\w*|on the invoice(?! mail)|createInvoice|invoices/model|\b(deriv|comput|calculat)\w*|from (the )?(customer''?s? )?(payment )?terms)|\b(deriv|comput|calculat)\w*(?:(?!\\n)[^\n]){0,80}(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b|(createInvoice|invoices/model\.js)(?:(?!\\n)[^\n]){0,120}dueDate\b|dueDateFor|terms\.js'
match: contains
target: last_message
weight: 2
---

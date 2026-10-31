---
type: tool_used
tool: Write
input_match: '^(?=[\s\S]*tasks/[^/"]+/plan\.md)[\s\S]*?(?:payments/service\.js(?:(?!\\n)[^\n]){0,200}customerId|customerId(?:(?!\\n)[^\n]){0,200}(payments/service\.js|PAYMENT_REFUNDED|payment\.refunded)|(PAYMENT_REFUNDED|payment\.refunded)(?:(?!\\n)[^\n]){0,120}customerId)'
min: 1
weight: 2
---

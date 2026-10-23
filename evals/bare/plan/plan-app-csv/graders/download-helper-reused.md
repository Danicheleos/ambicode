---
type: regex
pattern: 'attachment\(|http\.attachment|\battachment\b[^\n;]{0,60}(shared/http|http\.js)|(shared/http|http\.js)[^\n]{0,60}\battachment\b(?!;)|revenueCsv|revenue\.csv'
match: contains
target: last_message
weight: 2
---

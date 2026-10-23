---
type: regex
pattern: '(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b|(called|invoked|used) (from|by)))(?:(?!\\n)[^\n])*((notifications/[\w-]+\.js|notifications (feature|module|folder|directory))(?:(?!\\n)[^\n]){0,160}(invoices/(service|repository)|invoices\.(list|get|outstanding|all\w*)\(|reports/repository|require\([^)\n]*invoices))'
match: not_contains
target: last_message
weight: 1
---

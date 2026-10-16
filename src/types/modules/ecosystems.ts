/** The declaration shapes of the languages search has met; one list, no per-language branch (03c-S1). Each captures the name in group 1. */
export const DECLARATION_PATTERNS: readonly RegExp[] = [
  /(?:^|\s)(?:abstract\s+|async\s+|default\s+)*(?:function\*?|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:public|protected|private|static|async|readonly|get|set|override)\s+(?:(?:static|async|readonly|get|set|override)\s+)*([A-Za-z_$][\w$]*)\s*[(<:=]/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
  /^\s*(?:public|protected|internal)\s+(?:static\s+)?(?:[\w<>[\],?.]+\s+)+([A-Za-z_]\w*)\s*\(/,
];

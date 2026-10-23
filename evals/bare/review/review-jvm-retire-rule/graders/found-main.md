---
type: regex
pattern: '(?:(?<![\w-])RetirementRules\.kt[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:8|9|10|11|12|13|14)(?!\d)|(?:1|2|3|4|5|6|7)\s*[-–]\s*L?(?:[1-9]\d{1,}|8|[9-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:RetirementRules|isBefore)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[iI][nN][vV][eE][rR][tT]|[iI][nN][vV][eE][rR][tT][eE][dD]|[rR][eE][vV][eE][rR][sS][eE][dD]|[wW][rR][oO][nN][gG]|[bB][aA][cC][kK][wW][aA][rR][dD][sS]|[oO][pP][pP][oO][sS][iI][tT][eE]|[fF][lL][iI][pP][pP][eE][dD])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[iI][nN][vV][eE][rR][tT]|[iI][nN][vV][eE][rR][tT][eE][dD]|[rR][eE][vV][eE][rR][sS][eE][dD]|[wW][rR][oO][nN][gG]|[bB][aA][cC][kK][wW][aA][rR][dD][sS]|[oO][pP][pP][oO][sS][iI][tT][eE]|[fF][lL][iI][pP][pP][eE][dD])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:RetirementRules|isBefore)(?![A-Za-z0-9_])))'
match: contains
target: last_message
weight: 2
---

---
type: regex
pattern: '(?:(?<![\w-])borrow\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:15|16|17|18|19|20|21)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14)\s*[-–]\s*L?(?:[1-9]\d{2,}|15|[2-9]\d{1}|1[6-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:loan-refused)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[nN][aA][mM][eE]|[nN][aA][mM][eE][dD]|[eE][vV][eE][nN][tT]|[pP][rR][eE][fF][iI][xX]|[cC][oO][nN][vV][eE][nN][tT][iI][oO][nN]|[lL][eE][nN][dD][iI][nN][gG])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[nN][aA][mM][eE]|[nN][aA][mM][eE][dD]|[eE][vV][eE][nN][tT]|[pP][rR][eE][fF][iI][xX]|[cC][oO][nN][vV][eE][nN][tT][iI][oO][nN]|[lL][eE][nN][dD][iI][nN][gG])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:loan-refused)(?![A-Za-z0-9_])))'
match: contains
target: last_message
weight: 1
---

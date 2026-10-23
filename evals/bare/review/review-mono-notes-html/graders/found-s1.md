---
type: regex
pattern: '(?:(?<![\w-])engine-api\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:1|2|3|4|5|6|7)(?!\d)(?!\d))|(?:(?<![A-Za-z0-9_])(?:engine-api\.ts|__generated__)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[eE][dD][iI][tT]|[eE][dD][iI][tT][eE][dD]|[hH][aA][nN][dD]|[rR][eE][gG][eE][nN][eE][rR][aA][tT][eE]|[rR][eE][gG][eE][nN][eE][rR][aA][tT][eE][dD]|[mM][aA][nN][uU][aA][lL]|[mM][aA][nN][uU][aA][lL][lL][yY]|[oO][pP][eE][nN][aA][pP][iI])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[eE][dD][iI][tT]|[eE][dD][iI][tT][eE][dD]|[hH][aA][nN][dD]|[rR][eE][gG][eE][nN][eE][rR][aA][tT][eE]|[rR][eE][gG][eE][nN][eE][rR][aA][tT][eE][dD]|[mM][aA][nN][uU][aA][lL]|[mM][aA][nN][uU][aA][lL][lL][yY]|[oO][pP][eE][nN][aA][pP][iI])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:engine-api\.ts|__generated__)(?![A-Za-z0-9_])))'
match: contains
target: last_message
weight: 1
---

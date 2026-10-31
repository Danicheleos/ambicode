---
type: regex
pattern: '(?:(?<![\w-])ingest\.py[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:8|9|10|11|12|13|14|15|16)(?!\d)|(?:1|2|3|4|5|6|7)\s*[-–]\s*L?(?:[1-9]\d{1,}|8|[9-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:ingest)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[pP][aA][rR][tT][iI][aA][lL]|[pP][aA][rR][tT][iI][aA][lL][lL][yY]|[aA][tT][oO][mM][iI][cC]|[aA][tT][oO][mM][iI][cC][iI][tT][yY]|[rR][oO][lL][lL][bB][aA][cC][kK]|[hH][aA][lL][fF]|[eE][aA][rR][lL][iI][eE][rR] [rR][eE][aA][dD][iI][nN][gG][sS]|[aA][lL][rR][eE][aA][dD][yY] [sS][tT][oO][rR][eE][dD]|[lL][eE][fF][tT] [sS][tT][oO][rR][eE][dD]|[mM][iI][dD]-[bB][aA][tT][cC][hH])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[pP][aA][rR][tT][iI][aA][lL]|[pP][aA][rR][tT][iI][aA][lL][lL][yY]|[aA][tT][oO][mM][iI][cC]|[aA][tT][oO][mM][iI][cC][iI][tT][yY]|[rR][oO][lL][lL][bB][aA][cC][kK]|[hH][aA][lL][fF]|[eE][aA][rR][lL][iI][eE][rR] [rR][eE][aA][dD][iI][nN][gG][sS]|[aA][lL][rR][eE][aA][dD][yY] [sS][tT][oO][rR][eE][dD]|[lL][eE][fF][tT] [sS][tT][oO][rR][eE][dD]|[mM][iI][dD]-[bB][aA][tT][cC][hH])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:ingest)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-4/1/report.txt }
weight: 1
---

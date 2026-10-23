---
type: regex
pattern: '(?:(?<![\w-])sweep\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:20|21|22|23|24|25|26)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19)\s*[-–]\s*L?(?:[1-9]\d{2,}|20|[3-9]\d{1}|2[1-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:Expired)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[dD][uU][pP][lL][iI][cC][aA][tT][eE]|[dD][uU][pP][lL][iI][cC][aA][tT][eE][sS]|[rR][eE][pP][eE][aA][tT]|[rR][eE][pP][eE][aA][tT][sS]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT][sS]|[hH][eE][lL][pP][eE][rR]|[aA][lL][rR][eE][aA][dD][yY])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[dD][uU][pP][lL][iI][cC][aA][tT][eE]|[dD][uU][pP][lL][iI][cC][aA][tT][eE][sS]|[rR][eE][pP][eE][aA][tT]|[rR][eE][pP][eE][aA][tT][sS]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT][sS]|[hH][eE][lL][pP][eE][rR]|[aA][lL][rR][eE][aA][dD][yY])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:Expired)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-9/1/report.txt }
weight: 1
---

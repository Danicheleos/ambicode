---
type: regex
pattern: '(?:(?<![\w-])sweep\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:9|10|11|12|13|14|15)(?!\d)|(?:1|2|3|4|5|6|7|8)\s*[-–]\s*L?(?:[1-9]\d{1,}|9)(?!\d))|(?<![\w-])sweep_test\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:14|15|16|17|18|19|20)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13)\s*[-–]\s*L?(?:[1-9]\d{2,}|14|[2-9]\d{1}|1[5-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:time\.Now|2999)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[cC][lL][oO][cC][kK]|[cC][lL][oO][cC][kK]|[iI][nN][jJ][eE][cC][tT]|[iI][nN][jJ][eE][cC][tT][eE][dD]|[dD][eE][tT][eE][rR][mM][iI][nN][iI][sS][tT][iI][cC]|[rR][uU][lL][eE]|[rR][eE][aA][lL]|[wW][aA][lL][lL])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[cC][lL][oO][cC][kK]|[cC][lL][oO][cC][kK]|[iI][nN][jJ][eE][cC][tT]|[iI][nN][jJ][eE][cC][tT][eE][dD]|[dD][eE][tT][eE][rR][mM][iI][nN][iI][sS][tT][iI][cC]|[rR][uU][lL][eE]|[rR][eE][aA][lL]|[wW][aA][lL][lL])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:time\.Now|2999)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-9/1/report.txt }
weight: 2
---

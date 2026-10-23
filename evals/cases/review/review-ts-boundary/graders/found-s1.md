---
type: regex
pattern: '(?:(?<![\w-])charge-late-fees\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:6|7|8|9|10|11|12|13|14)(?!\d)|(?:1|2|3|4|5)\s*[-–]\s*L?(?:[1-9]\d{1,}|6|[7-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:lateLine)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[nN][aA][mM][eE]|[nN][aA][mM][eE][sS]|[nN][aA][mM][iI][nN][gG]|[sS][iI][nN][gG][lL][eE]-[lL][eE][tT][tT][eE][rR]|[oO][nN][eE]-[lL][eE][tT][tT][eE][rR]|[cC][rR][yY][pP][tT][iI][cC])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[nN][aA][mM][eE]|[nN][aA][mM][eE][sS]|[nN][aA][mM][iI][nN][gG]|[sS][iI][nN][gG][lL][eE]-[lL][eE][tT][tT][eE][rR]|[oO][nN][eE]-[lL][eE][tT][tT][eE][rR]|[cC][rR][yY][pP][tT][iI][cC])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:lateLine)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-1/1/report.txt }
weight: 1
---

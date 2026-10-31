---
type: regex
pattern: '(?:(?<![\w-])return\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)(?!\d)|(?:1|2|3|4)\s*[-–]\s*L?(?:[1-9]\d{1,}|5|[6-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:returnItem)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[cC][oO][mM][mM][eE][nN][tT]|[cC][oO][mM][mM][eE][nN][tT][sS]|[nN][aA][rR][rR][aA][tT][eE]|[nN][aA][rR][rR][aA][tT][eE][sS]|[nN][aA][rR][rR][aA][tT][iI][nN][gG]|[rR][eE][sS][tT][aA][tT][eE]|[rR][eE][sS][tT][aA][tT][eE][sS]|[rR][eE][sS][tT][aA][tT][iI][nN][gG]|[oO][bB][vV][iI][oO][uU][sS])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[cC][oO][mM][mM][eE][nN][tT]|[cC][oO][mM][mM][eE][nN][tT][sS]|[nN][aA][rR][rR][aA][tT][eE]|[nN][aA][rR][rR][aA][tT][eE][sS]|[nN][aA][rR][rR][aA][tT][iI][nN][gG]|[rR][eE][sS][tT][aA][tT][eE]|[rR][eE][sS][tT][aA][tT][eE][sS]|[rR][eE][sS][tT][aA][tT][iI][nN][gG]|[oO][bB][vV][iI][oO][uU][sS])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:returnItem)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-2/1/report.txt }
weight: 1
---

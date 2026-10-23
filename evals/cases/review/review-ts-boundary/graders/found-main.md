---
type: regex
pattern: '(?:(?<![\w-])charge-late-fees\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:1|2|3|4|5)(?!\d)(?!\d))|(?:(?<![A-Za-z0-9_])(?:fees/late\.js|lending/domain)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[iI][nN][dD][eE][xX]|[iI][nN][tT][eE][rR][nN][aA][lL]|[bB][oO][uU][nN][dD][aA][rR][yY]|[cC][oO][nN][tT][eE][xX][tT]|[dD][eE][eE][pP]|[rR][uU][lL][eE]|[eE][nN][cC][aA][pP][sS][uU][lL][aA][tT][iI][oO][nN])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[iI][nN][dD][eE][xX]|[iI][nN][tT][eE][rR][nN][aA][lL]|[bB][oO][uU][nN][dD][aA][rR][yY]|[cC][oO][nN][tT][eE][xX][tT]|[dD][eE][eE][pP]|[rR][uU][lL][eE]|[eE][nN][cC][aA][pP][sS][uU][lL][aA][tT][iI][oO][nN])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:fees/late\.js|lending/domain)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-1/1/report.txt }
weight: 2
---

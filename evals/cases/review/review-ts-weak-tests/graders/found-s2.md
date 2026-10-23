---
type: regex
pattern: '(?:(?<![\w-])lending/http/routes\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:12|13|14|15|16|17|18)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11)\s*[-–]\s*L?(?:[1-9]\d{2,}|12|[2-9]\d{1}|1[3-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:429)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[cC][oO][nN][fF][lL][iI][cC][tT]|409|[rR][aA][tT][eE]|[sS][tT][aA][tT][uU][sS]|[tT][oO][oO] [mM][aA][nN][yY] [rR][eE][qQ][uU][eE][sS][tT][sS])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[cC][oO][nN][fF][lL][iI][cC][tT]|409|[rR][aA][tT][eE]|[sS][tT][aA][tT][uU][sS]|[tT][oO][oO] [mM][aA][nN][yY] [rR][eE][qQ][uU][eE][sS][tT][sS])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:429)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-3/1/report.txt }
weight: 1
---

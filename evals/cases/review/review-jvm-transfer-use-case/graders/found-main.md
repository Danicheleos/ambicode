---
type: regex
pattern: '(?:(?<![\w-])TransferLot\.kt[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:7|8|9|10|11|12|13|14|15)(?!\d)|(?:1|2|3|4|5|6)\s*[-–]\s*L?(?:[1-9]\d{1,}|7|[8-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:TransferLot)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[eE][xX][eE][cC][uU][tT][eE]|[iI][nN][vV][oO][kK][eE]|[oO][pP][eE][rR][aA][tT][oO][rR]|[cC][oO][nN][vV][eE][nN][tT][iI][oO][nN]|[pP][oO][rR][tT][sS])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[eE][xX][eE][cC][uU][tT][eE]|[iI][nN][vV][oO][kK][eE]|[oO][pP][eE][rR][aA][tT][oO][rR]|[cC][oO][nN][vV][eE][nN][tT][iI][oO][nN]|[pP][oO][rR][tT][sS])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:TransferLot)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-10/1/report.txt }
weight: 2
---

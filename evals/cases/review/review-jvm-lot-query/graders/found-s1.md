---
type: regex
pattern: '(?:(?<![\w-])RetestReportService\.kt[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:21|22|23|24|25|26|27)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)\s*[-–]\s*L?(?:[1-9]\d{2,}|21|[3-9]\d{1}|2[2-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:NoSuchElementException)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[eE][mM][pP][tT][yY]|[eE][xX][pP][eE][cC][tT][eE][dD]|[oO][uU][tT][cC][oO][mM][eE]|[oO][uU][tT][cC][oO][mM][eE][sS]|[eE][xX][cC][eE][pP][tT][iI][oO][nN])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[eE][mM][pP][tT][yY]|[eE][xX][pP][eE][cC][tT][eE][dD]|[oO][uU][tT][cC][oO][mM][eE]|[oO][uU][tT][cC][oO][mM][eE][sS]|[eE][xX][cC][eE][pP][tT][iI][oO][nN])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:NoSuchElementException)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-11/1/report.txt }
weight: 1
---

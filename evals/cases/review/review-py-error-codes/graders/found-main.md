---
type: regex
pattern: '(?:(?<![\w-])plausibility\.py[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:7|8|9|10|11|12|13)(?!\d)|(?:1|2|3|4|5|6)\s*[-–]\s*L?(?:[1-9]\d{1,}|7|[8-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:"jump"|ImplausibleReadingError)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[tT][wW]|[tT][wW]-[nN][nN][nN]|[cC][oO][dD][eE]|[cC][oO][dD][eE][sS]|[cC][oO][nN][vV][eE][nN][tT][iI][oO][nN])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[tT][wW]|[tT][wW]-[nN][nN][nN]|[cC][oO][dD][eE]|[cC][oO][dD][eE][sS]|[cC][oO][nN][vV][eE][nN][tT][iI][oO][nN])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:"jump"|ImplausibleReadingError)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-4/1/report.txt }
weight: 2
---

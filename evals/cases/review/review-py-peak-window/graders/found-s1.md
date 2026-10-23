---
type: regex
pattern: '(?:(?<![\w-])extremes\.py[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:11|12|13|14|15|16|17|18|19|20|21|22|23)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10)\s*[-–]\s*L?(?:[1-9]\d{2,}|11|[2-9]\d{1}|1[2-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:smooth)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[uU][nN][uU][sS][eE][dD]|[dD][eE][aA][dD]|[nN][eE][vV][eE][rR] [cC][aA][lL][lL][eE][dD]|[nN][oO] [cC][aA][lL][lL][eE][rR]|[nN][oO][tT] [uU][sS][eE][dD]|[uU][nN][rR][eE][fF][eE][rR][eE][nN][cC][eE][dD]|[uU][nN][cC][aA][lL][lL][eE][dD])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[uU][nN][uU][sS][eE][dD]|[dD][eE][aA][dD]|[nN][eE][vV][eE][rR] [cC][aA][lL][lL][eE][dD]|[nN][oO] [cC][aA][lL][lL][eE][rR]|[nN][oO][tT] [uU][sS][eE][dD]|[uU][nN][rR][eE][fF][eE][rR][eE][nN][cC][eE][dD]|[uU][nN][cC][aA][lL][lL][eE][dD])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:smooth)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-5/1/report.txt }
weight: 1
---

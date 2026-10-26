---
type: regex
pattern: '(?:(?<![\w-])borrow\.test\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:31|32|33|34|35|36|37)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30)\s*[-–]\s*L?(?:[1-9]\d{2,}|31|[4-9]\d{1}|3[2-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:toBeTruthy)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[wW][eE][aA][kK]|[wW][eE][aA][kK][eE][rR]|[wW][eE][aA][kK][eE][nN][eE][dD]|[lL][oO][oO][sS][eE]|[vV][aA][gG][uU][eE]|[eE][xX][aA][cC][tT]|[aA][lL][wW][aA][yY][sS]|[aA][nN][yY])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[wW][eE][aA][kK]|[wW][eE][aA][kK][eE][rR]|[wW][eE][aA][kK][eE][nN][eE][dD]|[lL][oO][oO][sS][eE]|[vV][aA][gG][uU][eE]|[eE][xX][aA][cC][tT]|[aA][lL][wW][aA][yY][sS]|[aA][nN][yY])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:toBeTruthy)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-3/1/report.txt }
weight: 2
---

---
type: regex
pattern: '(?:(?<![\w-])scans\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41)\s*[-–]\s*L?(?:[1-9]\d{2,}|42|[5-9]\d{1}|4[3-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:parseScanLine|scanStates)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[dD][uU][pP][lL][iI][cC][aA][tT][eE]|[dD][uU][pP][lL][iI][cC][aA][tT][eE][sS]|[dD][uU][pP][lL][iI][cC][aA][tT][eE][dD]|[dD][uU][pP][lL][iI][cC][aA][tT][iI][oO][nN]|[sS][cC][aA][nN][nN][eE][rR]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT][sS]|[rR][eE][pP][eE][aA][tT]|[rR][eE][pP][eE][aA][tT][sS])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[dD][uU][pP][lL][iI][cC][aA][tT][eE]|[dD][uU][pP][lL][iI][cC][aA][tT][eE][sS]|[dD][uU][pP][lL][iI][cC][aA][tT][eE][dD]|[dD][uU][pP][lL][iI][cC][aA][tT][iI][oO][nN]|[sS][cC][aA][nN][nN][eE][rR]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT]|[rR][eE][iI][mM][pP][lL][eE][mM][eE][nN][tT][sS]|[rR][eE][pP][eE][aA][tT]|[rR][eE][pP][eE][aA][tT][sS])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:parseScanLine|scanStates)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-8/1/report.txt }
weight: 1
---

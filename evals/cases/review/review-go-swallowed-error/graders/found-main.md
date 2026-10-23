---
type: regex
pattern: '(?:(?<![\w-])scans\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:33|34|35|36|37|38|39|40|41)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32)\s*[-–]\s*L?(?:[1-9]\d{2,}|33|[4-9]\d{1}|3[4-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:Advance)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[sS][wW][aA][lL][lL][oO][wW]|[sS][wW][aA][lL][lL][oO][wW][eE][dD]|[sS][wW][aA][lL][lL][oO][wW][sS]|[iI][gG][nN][oO][rR][eE][dD]|[iI][gG][nN][oO][rR][eE][sS]|[dD][iI][sS][cC][aA][rR][dD][eE][dD]|[lL][oO][gG][gG][eE][dD]|200|[sS][uU][cC][cC][eE][sS][sS]|[sS][uU][cC][cC][eE][sS][sS][fF][uU][lL])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[sS][wW][aA][lL][lL][oO][wW]|[sS][wW][aA][lL][lL][oO][wW][eE][dD]|[sS][wW][aA][lL][lL][oO][wW][sS]|[iI][gG][nN][oO][rR][eE][dD]|[iI][gG][nN][oO][rR][eE][sS]|[dD][iI][sS][cC][aA][rR][dD][eE][dD]|[lL][oO][gG][gG][eE][dD]|200|[sS][uU][cC][cC][eE][sS][sS]|[sS][uU][cC][cC][eE][sS][sS][fF][uU][lL])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:Advance)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-8/1/report.txt }
weight: 2
---

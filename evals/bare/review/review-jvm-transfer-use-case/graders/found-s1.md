---
type: regex
pattern: '(?:(?<![\w-])TransferLotService\.kt[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:20|21|22|23|24|25|26|27|28)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19)\s*[-–]\s*L?(?:[1-9]\d{2,}|20|[3-9]\d{1}|2[1-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:handle2|tmp)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[nN][aA][mM][eE]|[nN][aA][mM][eE][sS]|[nN][aA][mM][iI][nN][gG]|[mM][eE][aA][nN][iI][nN][gG][lL][eE][sS][sS]|[vV][aA][gG][uU][eE]|[dD][eE][sS][cC][rR][iI][pP][tT][iI][vV][eE]|[cC][rR][yY][pP][tT][iI][cC])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[nN][aA][mM][eE]|[nN][aA][mM][eE][sS]|[nN][aA][mM][iI][nN][gG]|[mM][eE][aA][nN][iI][nN][gG][lL][eE][sS][sS]|[vV][aA][gG][uU][eE]|[dD][eE][sS][cC][rR][iI][pP][tT][iI][vV][eE]|[cC][rR][yY][pP][tT][iI][cC])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:handle2|tmp)(?![A-Za-z0-9_])))'
match: contains
target: last_message
weight: 1
---

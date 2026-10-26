---
type: regex
pattern: '(?:(?<![\w-])httpapi/bays\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:15|16|17|18|19|20|21|22)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14)\s*[-–]\s*L?(?:[1-9]\d{2,}|15|[2-9]\d{1}|1[6-9]\d{0})(?!\d))|(?<![\w-])httpapi/bays\.go[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:32|33|34|35|36|37|38|39|40|41|42|43)(?!\d)|(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31)\s*[-–]\s*L?(?:[1-9]\d{2,}|32|[4-9]\d{1}|3[3-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:ServeHTTP|BayHandler)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[mM][eE][tT][hH][oO][dD]|[mM][eE][tT][hH][oO][dD][sS]|[gG][eE][tT]|[vV][eE][rR][bB]|[vV][eE][rR][bB][sS])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[mM][eE][tT][hH][oO][dD]|[mM][eE][tT][hH][oO][dD][sS]|[gG][eE][tT]|[vV][eE][rR][bB]|[vV][eE][rR][bB][sS])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:ServeHTTP|BayHandler)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-7/1/report.txt }
weight: 1
---

---
type: regex
pattern: '(?:(?<![\w-])extremes\.py[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:5|6|7|8|9|10|11)(?!\d)|(?:1|2|3|4)\s*[-–]\s*L?(?:[1-9]\d{1,}|5|[6-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:high_water_hours)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[oO][fF][fF]-[bB][yY]-[oO][nN][eE]|[nN][eE][vV][eE][rR] [rR][eE][pP][oO][rR][tT][eE][dD]|[mM][iI][sS][sS][eE][dD]|[mM][iI][sS][sS][eE][sS]|[sS][kK][iI][pP][sS]|[sS][kK][iI][pP][pP][eE][dD]|[lL][oO][oO][pP] [bB][oO][uU][nN][dD])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[oO][fF][fF]-[bB][yY]-[oO][nN][eE]|[nN][eE][vV][eE][rR] [rR][eE][pP][oO][rR][tT][eE][dD]|[mM][iI][sS][sS][eE][dD]|[mM][iI][sS][sS][eE][sS]|[sS][kK][iI][pP][sS]|[sS][kK][iI][pP][pP][eE][dD]|[lL][oO][oO][pP] [bB][oO][uU][nN][dD])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:high_water_hours)(?![A-Za-z0-9_])))'
match: contains
target: last_message
weight: 2
---

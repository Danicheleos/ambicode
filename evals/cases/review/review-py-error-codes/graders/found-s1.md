---
type: regex
pattern: '(?:(?<![\w-])limits\.py[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:3|4|5|6|7|8|9)(?!\d)|(?:1|2)\s*[-–]\s*L?(?:[1-9]\d{1,}|3|[4-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:MAX_JUMP_MM)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[mM][eE][tT][rR][eE]|[mM][eE][tT][rR][eE][sS]|[mM][eE][tT][eE][rR]|[mM][eE][tT][eE][rR][sS]|[mM][iI][lL][lL][iI][mM][eE][tT][rR][eE]|[mM][iI][lL][lL][iI][mM][eE][tT][rR][eE][sS]|[mM][iI][lL][lL][iI][mM][eE][tT][eE][rR]|[mM][iI][lL][lL][iI][mM][eE][tT][eE][rR][sS]|[uU][nN][iI][tT]|[uU][nN][iI][tT][sS]|[cC][oO][mM][mM][eE][nN][tT])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[mM][eE][tT][rR][eE]|[mM][eE][tT][rR][eE][sS]|[mM][eE][tT][eE][rR]|[mM][eE][tT][eE][rR][sS]|[mM][iI][lL][lL][iI][mM][eE][tT][rR][eE]|[mM][iI][lL][lL][iI][mM][eE][tT][rR][eE][sS]|[mM][iI][lL][lL][iI][mM][eE][tT][eE][rR]|[mM][iI][lL][lL][iI][mM][eE][tT][eE][rR][sS]|[uU][nN][iI][tT]|[uU][nN][iI][tT][sS]|[cC][oO][mM][mM][eE][nN][tT])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:MAX_JUMP_MM)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-4/1/report.txt }
weight: 1
---

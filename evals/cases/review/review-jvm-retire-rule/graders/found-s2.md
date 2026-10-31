---
type: regex
pattern: '(?:(?<![\w-])HoldPeriod\.kt[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:3|4|5|6|7|8|9)(?!\d)|(?:1|2)\s*[-–]\s*L?(?:[1-9]\d{1,}|3|[4-9]\d{0})(?!\d))|(?:(?<![A-Za-z0-9_])(?:daysLeftInHold)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[uU][nN][uU][sS][eE][dD]|[dD][eE][aA][dD]|[nN][eE][vV][eE][rR]|[uU][nN][rR][eE][fF][eE][rR][eE][nN][cC][eE][dD]|[uU][nN][cC][aA][lL][lL][eE][dD])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[uU][nN][uU][sS][eE][dD]|[dD][eE][aA][dD]|[nN][eE][vV][eE][rR]|[uU][nN][rR][eE][fF][eE][rR][eE][nN][cC][eE][dD]|[uU][nN][cC][aA][lL][lL][eE][dD])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:daysLeftInHold)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: .ambicode/reviews/rev-12/1/report.txt }
weight: 1
---

---
type: regex
pattern: '(?:(?<![\w-])firing\.ts[:\s(,#L`*]{0,6}(?:[Ll]ines?\s+)?(?:\d+(?:\s*[-–]\s*L?\d+)?\s*(?:,|;|and|&)\s*L?)*(?<!\d)(?:(?:9|10|11|12|13|14|15)(?!\d)|(?:1|2|3|4|5|6|7|8)\s*[-–]\s*L?(?:[1-9]\d{1,}|9)(?!\d))|(?:(?<![A-Za-z0-9_])(?:firingPage|XSS|unescaped)(?![A-Za-z0-9_])[\s\S]{0,200}?(?<![\w/.-])(?:[hH][tT][mM][lL]|[eE][sS][cC][aA][pP][eE]|[eE][sS][cC][aA][pP][eE][dD]|[mM][aA][rR][kK][uU][pP]|[iI][nN][jJ][eE][cC][tT]|[iI][nN][jJ][eE][cC][tT][iI][oO][nN]|[sS][cC][rR][iI][pP][tT]|[sS][aA][nN][iI][tT][iI][zZ][eE]|[sS][aA][nN][iI][tT][iI][sS][eE]|[sS][aA][nN][iI][tT][iI][zZ][eE][dD])(?![\w/-]|\.\w)|(?<![\w/.-])(?:[hH][tT][mM][lL]|[eE][sS][cC][aA][pP][eE]|[eE][sS][cC][aA][pP][eE][dD]|[mM][aA][rR][kK][uU][pP]|[iI][nN][jJ][eE][cC][tT]|[iI][nN][jJ][eE][cC][tT][iI][oO][nN]|[sS][cC][rR][iI][pP][tT]|[sS][aA][nN][iI][tT][iI][zZ][eE]|[sS][aA][nN][iI][tT][iI][sS][eE]|[sS][aA][nN][iI][tT][iI][zZ][eE][dD])(?![\w/-]|\.\w)[\s\S]{0,200}?(?<![A-Za-z0-9_])(?:firingPage|XSS|unescaped)(?![A-Za-z0-9_])))'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-13/1/report.txt }
weight: 2
---

---
type: regex
target: trace
pattern: '[ \/]unit \w+: exit \d+|\\"key\\": \\"(?:[^\\"]*\/)?unit\\"'
arm: with-only
---

Matches a `unit` check entry in what `review` printed: a `unit <phase>: exit N`
line, or a `"key": "unit"` object in the `--json` form. A check entry exists
only for a check that ran, so a repository with only `lint` does not pass.

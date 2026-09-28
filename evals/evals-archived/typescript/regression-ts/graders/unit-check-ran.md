---
type: regex
target: trace
pattern: '/unit: (?:passed|failed)  selected=|\\"checkId\\": \\"unit\\",(?:(?!\\"checkId\\")[\s\S])*?\\"status\\": \\"(?:passed|failed)\\"'
arm: with-only
---

Matches a `unit` check that `review` executed and that reported a result,
passing or failing. `skipped`, `timed-out` and `error` do not count: none of
them shows a runner that ran the selected tests. The `--json` form is matched
within one check object, so an executed `lint` beside a skipped `unit` does
not pass.

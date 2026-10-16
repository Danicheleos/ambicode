# Notation and route-state audit — 2026-10-09

[Full report and recommendation](report.md).

[Review of the implemented fixes](verification.md): prose/state/preflight changes accepted in scope; two reproduced scorer/report defects require changes. Includes full verification and unchanged-HEAD test comparison.

Keep explicit route state and a short shared contract. Drop the blanket symbolic rewrite as an efficiency optimization: no matched quality/cost win, larger active prompts, and a demonstrated skill-loader collision.

The latest campaign has 58 recorded answers, not a full 60-attempt sweep. Four final answers recover for deterministic scoring without paid graders. The main comparison uses 19 cases with three attempts each.

- [Metrics, gates, source sizes, comparisons and uncertainty](audit.json)
- [Per-attempt artifact and final-answer evidence](attempts.json)
- [Tool calls and results](tools.json)
- [Report validation](validation.json)

Reproduce without models or product changes:

```sh
node eval-replay/evals/analysis/notation-2026-10-09/analyze.mjs
node eval-replay/evals/analysis/notation-2026-10-09/render-tables.mjs
```

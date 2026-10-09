# Phase C — read-many tool (notice 2), 2026-10-08

## What shipped
- `ambicode read <path[:start-end]>… [--task <slug>] [--budget <bytes>]`
  - Module: `src/modules/search/text/read-many.ts`.
  - Command: in `src/cli/commands/search/search.ts`, next to refs/find/relates. It reuses their `record()`.
- Path resolution, in order:
  1. From the shell's directory.
  2. From the repository root.
  3. A unique tracked suffix.
- Refusals, reported on the file's own line while the other files are still served:
  - outside the repository, including through a link
  - inside `.git`
  - a directory
  - binary
  - ambiguous (up to 5 candidates listed)
  - not found
  - a start line past the end of the file
- Budget: 24,000 bytes by default, at most 28,000.
  - Every file gets an equal share of the budget, and whatever a small file leaves unused goes to the larger ones.
  - A file cut short ends with `… cut … at line N: read <path>:N-M for the rest`.
- Ledger: the `search` kind gains command `read`, recording the spans served, the hits and bytes, and a `truncated` count. The report's navigation line counts it.
- `routes/investigate/read.md`: `- One `{cli} read --task {task} <path[:a-b]>…` call for every file and span.` The text is 700/700 characters against the 03b-N9 limit; the limit was not raised.
- `navigation.ts` guidance now names `read`.

## Budget provenance (saved traces)
```
30_2248 naked:   per read result p50 4,401 B  p95 18,130  max 29,800; per run p50 6,929  p90 62,225
27_0733 plugin:  per read result p50 2,520 B  p95 14,651  max 30,415; per run p50 26,032 p90 43,176
largest Bash tool_result across 40 trace dirs: 29,800 chars (a 30,000 cap is inferred, unverified)
```

## Probe (one claude -p, fe-vs-6141-investigate, Sonnet 5.5, built bundle, isolated settings)
```
cost $0.677, 26 turns; recall 0.358, precision 0.585
lock for this case (bare, 3 runs): $0.337, 16.3 turns; recall 0.413, precision 0.731
ambicode read calls: 4, carrying 6/6/4/6 paths (22 total), 46 KB, 0 cut, 0 refused
Read tool: 1 call (en.json); Grep tool: 12 calls
```
- The model batched every time it read.
- The extra turns came from Grep, not from reading.
- The run wrote no ledger receipts, because `read.md` did not pass `--task` yet. That is fixed now. A code-only route start shows the delivered line as `read --task update-input-type-labels-reba …`, and a call made with it appends `{"kind":"search","command":"read",…}`.
- One run is not a measurement. Cost and recall need the paid `evals:decide` run.

## Defect caught by the tests
The first version compared the unresolved cwd with git's real root. On macOS `/var` vs `/private/var` put every cwd-relative path "outside the repository". It is fixed by resolving both paths to their real paths. The CLI test exposed it.

## Tests
- read-many: 5 tests.
- Targeted src suites: 784/785. The one failure is `cli.test.ts` 05-B1 (codeindex absent), which also fails at HEAD with my changes stashed.
- evals: 365/365.
- typecheck clean, build ok.

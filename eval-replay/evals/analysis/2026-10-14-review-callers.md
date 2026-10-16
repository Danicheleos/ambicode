# review-subtle: caller evidence (2026-10-14)

Sources: evals/cases/results/traces/plugin/*/review-subtle-*.jsonl (34 runs), bare (9 runs), aggregate-result.json verdicts, .ambicode/reviews/rev-money/{reviewer-answer.txt,brief.md}. Read-only.

## 1. Per-run table (plugin, since 2026-10-13T07, 11 graded runs; fc = finding-correct, cc = cites-caller)

| run | reviewer Grep `round` | callers in reviewer answer | callers in final | fc | cc | cause of failure |
|---|---|---|---|---|---|---|
| 07-45 r1 | yes | 2 | 2 | P | P | |
| 07-45 r2 | yes | 2 | 2 (invoices/service.js:55, reports/service.js:53, 100.5 -> 101 before, 100 now) | F (3/3 FAIL) | P | grader noise: final satisfies the grader text |
| 07-45 r3 | yes | 1 | 1 | P | P | |
| 08-26 r1, r2 | yes | 2 | 2 | P | P | |
| 08-26 r3 | yes | 2 | 2 (invoices/service.js:55) | F (3/3 FAIL) | P | grader noise (inferred, judge strictness) |
| 10-14 00-11 | yes | 2 | 2, `src/` prefix dropped | P | F | readback dropped `src/`; regex misses |
| 10-14 00-23 | no (1 call) | invalid JSON | 0 | F | F | reviewer output invalid |
| 10-14 14-53 r1 | NO (1 call, Read brief only) | 0 | 0 | F | F | reviewer skipped Dependents |
| 10-14 14-53 r2 | yes | 2 | 1 (reports only under NaN finding) | F | F | readback lost caller path |
| 10-14 14-53 r3 | yes | 2 | 2 | P | P | |

Over all 34 plugin runs: reviewer did not Grep the changed name in 4 (10-13T01-05 r1, 02-59 r3, 10-14 00-23, 14-53 r1); all 4 ended after 1 tool call, 3 graded fc=F, 1 invalid JSON. Reviewer answer had callers but final had fewer or none: 02-59 r2 (2 -> 0), 05-39 r2 (2 -> 0), 05-39 r3 (2 -> 1), 14-53 r2 (2 -> 1); all four fc=F. Since 07: 6/11 fc pass.
Bare: 9/9 runs grep `round` (in Bash or Grep, within 2-3 tool calls) and 9/9 cite a caller path:line.

Failure split since 07 (5 fc failures): 2 grader noise, 1 invalid JSON, 1 no-Grep, 1 readback loss. Only 2 are fixable by a caller-evidence change (no-Grep, plus the readback loss by wording).

## 2. What competes with Dependents

- agents/reviewer.md: 96 lines, 5184 bytes. Dependents is bullet 8 of 9 under "What to assess" (lines 37-42, 592 bytes, 11%), in a list of equal-weight bullets, conditional ("for each name the change removes, renames, or whose signature or behaviour it alters": model must first decide the change qualifies).
- Same file says "brief.md, which holds the whole diff, with the code in the checkout" (frontmatter and line 17), "Judge the code that is in front of you" (line 6).
- routes/review/agent.md step prompt: "it holds the whole diff ... Answer with the JSON block only."
- Output contract: "exactly one fenced json block and nothing else" removes any visible slot for working.
- Effort low; the failing no-Grep runs end after 1 call (Read of brief).
- Brief (7510 bytes) has the diff, policy, conventions; nothing about callers.

## 3. Candidate fixes

(a) Code: callers block in brief. Existing `ambicode refs <names>` (src/modules/search/refs.ts, `git grepWordLines`, whole-word, language-agnostic) dry-run on the materialized fixture (`ts-app-medium-money-change`, working tree diff applied):
```
node scripts/ambicode.mjs refs round -> 17 hits in 7 files, 1361 bytes, 0.16 s
  src/invoices/service.js:55, src/reports/service.js:53, src/shared/money.js:20 (all real callers)
  noise: docs/architecture.md:16, src/legacy/invoice-total.js:7 (Math.round), src/reports/aging.js:6 (Math.round), tests, money.js:29 Math.round
```
Recall: both graded callers present. Precision: 3 real of 17 (whole-word matches `Math.round`), tolerable at 1.4 KB. Guards already present: 4096-byte cap, 500 lines per name, drops names matching >60% of files.
Missing piece: choosing the names. Hunk headers do not name `round` (`@@ ... @@ const { ValidationError }...`; the `function round` line is context, only its body changed). Need: harvest declarations (src/modules/search/harvest.ts `harvest`, language-agnostic patterns) of each changed new-side file and take, per changed line, the nearest declaration at or above it, plus removed `-` declarations. brief.mjs (skills/review/scripts/brief.mjs, standalone, no src imports) already walks the hunks; it would have to call `ambicode refs` via spawn, or the names step be moved to a code step that has runtime. Size: roughly 30-40 lines plus a test. Cost per review: ~1.4 KB of brief and one 0.16 s process. Effect: removes dependence on the reviewer choosing to Grep (4/34 no-Grep, 2/11 recent); does not fix readback loss, grader noise or invalid JSON. Risk: wrong names yield noise; the reviewer still must open callers.

(b) Wording: move Dependents out of the bullet list to a first step ("Before judging: for each changed function/name, Grep it, open callers outside the diff") with a short generic worked example. Cost: ~0 code, brief unchanged; effect on the 4/34 no-Grep runs unmeasured; the "whole diff" framing stays. Cheap but wording-only on a case where wording is already half-followed (see memory: examples over prose).

(c) readback.md: replace "one sentence" with "keep every `path:line` named in the finding, with the `src/` prefix as printed". Addresses 14-53 r2, 00-11 (prefix), and 05-39/02-59 losses: 5 of 34 runs touched. Zero code.

## Recommendation

Do (c) now (zero cost, 4-5 observed losses) and (a) (removes the skip class by construction; the names are computed, the reviewer then only reads callers). Put (b) behind them: only if (a) is not built. Do not chase 07-45 r2 / 08-26 r3: finals already satisfy the finding-correct text (grader noise, separate fix in the grader).
Expected: no-Grep failures 2/11 -> ~0, readback losses 1-2/11 -> ~0; ceiling is then bounded by judge noise (2/11) and invalid JSON (1/11), so fc ~ 8-9/11, not 11/11.

$0 checks before a paid run:
1. Unit test for the names step: fixture diff above must yield `round` (and `toCents` is not required); assert `refs` text contains invoices/service.js:55 and reports/service.js:53 in brief.md.
2. Materialize the fixture, run `review` route's brief script (`node fixtures/materialize.mjs ts-app-medium-money-change <dir> --ambicode-init --context`, then pin + brief) and grep brief.md for both caller paths and its byte count (expect +~1.4 KB over 7510).
3. For (c): text check that readback.md says to keep every path:line; replay the 14-53 r2 reviewer-answer.txt through the final-message rule is a paid model step, so only a paid x3 can show it.
Not done: no brief code was written, no run started, other fixtures (non-JS names, large repos) not dry-run.

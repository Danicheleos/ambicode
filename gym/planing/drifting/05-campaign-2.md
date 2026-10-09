# Campaign 2 — after the D5 root fix, the D6 companion rule and the step note (2026-10-09)

Runs: `30_2007` (be-vs-6140), `31_2008` (fe-vs-6406), `32_2009` (be-vs-5973), Sonnet 5.5 effort low,
5 reps each. Same caveat as campaign 1: the bare lock is on Claude Code 2.1.292, these runs on
2.1.295+, so `evals:gate` refuses the bare comparison and the ratios below are hand-computed against
the lock's agent means.

## Mechanics (15 runs)

| check | campaign 1 | campaign 2 |
|---|---|---|
| `read` receipts | 15/15 | 15/15 (2–5 per run) |
| native `Read` on source | 9/15 runs | **0/15** (`tool{Read}` entries: none; one denied `cat` attempt in 6140 R0, counted as the run's one failed call) |
| zsh glob / host cap / operand refusals | 0 / 0 / 0 | 0 / 0 / 0 |
| Stop block | 12/15 | **4/15** (6406 R0: `location-select.component.ts`; 5973 R0/R1/R4: lm-* DTO/mocks/validators, `UnitOfMeasure.ts`, `vlm-data.schema.ts`) |
| first `read` = the ready line | — | 6140: 4 files / 22,447 B identical in 5/5 runs |

## Results

| case | metric | campaign 1 | campaign 2 | bare |
|---|---|---|---|---|
| be-vs-6140 | recall | 1 ×5 | 1 ×5 | 1 |
| | precision | 1,1,1,1,.75 | **.6,.75,1,1,1** | 1 |
| | model calls | 7 ×5 | 5,4,4,4,3 | 5.7 |
| | agent $ (mean, × bare) | .213 (1.21×) | **.130 (0.74×)** | .176 |
| | peak ctx | 36.5–39.7k | 30.3–33.9k | 38.2k |
| fe-vs-6406 | recall / precision | .095 ×5 / 1 ×5 | .095 ×5 / 1 ×5 | .095 / 1 |
| | model calls | 4–6 | 3–6 | 5 |
| | agent $ (mean, × bare) | .109 (1.02×) | .103 (0.97×) | .107 |
| be-vs-5973 | recall | .786,.821,.679,.821,.821 (mean .786) | **.714,.429,.536,.607,.607 (mean .579)** | .690 |
| | precision | .885–.958 | .895–.952 | .924 |
| | model calls / tool calls | 5–9 / 3–7 | 7–10 / 5–8 | 7.7 / 10.3 |
| | agent $ (mean, × bare) | .234 (1.09×) | .224 (1.04×) | .216 |
| | served B | 12.5–26.8k | 23.0–52.1k | — |

Floors: 6140 recall holds, precision fails on 2 runs (ReportHelper listed); 6406 holds;
**5973 recall mean .579 is below the bare point .690 — a regression introduced by D6.**

## What happened

- **be-vs-6140.** The ready `read:` line is followed verbatim in 5/5 runs (same 4 operands, same
  22,447 B), the redirect holds (no native reads), and the route finishes in 3–5 model calls at
  0.74× bare cost. The remaining drift is the evidence-promotion extra: 2/5 runs read
  `ReportHelper.ts` with `read` and list it as a change. R1 cannot and should not catch a file that
  was read; R2 does not fire because the entries are plain. In campaign 1 the block turn made 4/5
  runs drop it, at +2 model calls. Pattern unchanged since 05_0035 (precision .6 ×3).
- **fe-vs-6406.** Identical to bare on every quality metric, in all 10 plugin runs of both
  campaigns. Drift gone; the earlier `.238` upside gone with it.
- **be-vs-5973.** The step note ("list only paths this route read … or marked new") did what it
  says: the model stopped listing the lm-carry/lift/lower/push-pull DTO, mocks and spec files it used
  to infer by analogy after reading one feature, and listed only the files it had read. Missing per
  run: 8 / 16 / 13 / 11 / 11 (campaign 1: 6 / 5 / 9 / 5 / 5). Three runs still got an R1 block for
  pattern-listed files and then dropped them. Reading all 16 analogue files costs 2–3 more `read`
  calls (outline mode makes each cheap) but the model did not choose to.

## Decision needed

R1 as shipped ("a `## Files` path must be served, a companion of a served file, or new") rejects a
correct inference by analogy. That inference is where 5973's recall came from. Options:

1. **Marked inference (recommended).** R1 also accepts an entry that names its basis:
   `<path> — inferred from <served path>` (or "by analogy with"). The basis must be a served file;
   the note says so; the replay can count how often the basis is served. Keeps entries explicit and
   mechanically checkable; restores analogy listing.
2. **R2 only.** Drop R1 and the "only paths read" sentence; keep the hedge rule. 5973 returns to
   campaign-1 behaviour; 6140's extras stay as in campaign 2.
3. **Keep R1 as is.** Accept the 5973 recall loss as the price of "read what you list"; out of
   scope by the user's floor rule, so not recommended.

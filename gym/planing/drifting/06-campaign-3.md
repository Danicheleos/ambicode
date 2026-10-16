# Campaign 3 — after the marked-inference rule (2026-10-09)

Runs: `33_2018` (be-vs-5973), `34_2019` (be-vs-6140); fe-vs-6406 skipped (identical to bare in
10/10 runs of campaigns 1–2). Sonnet 5.5 effort low, 5 reps each. Same bare-lock caveat (Claude Code
version) as campaigns 1–2.

## Results

| case | metric | campaign 1 | campaign 2 | campaign 3 | bare |
|---|---|---|---|---|---|
| be-vs-5973 | recall | mean .786 (.68–.82) | mean .579 (.43–.71) | **mean .728 (.61–.82)** | .690 |
| | precision | .885–.958 | .895–.952 | .920–1.000 | .924 |
| | model calls | 5–9 | 7–10 | 5–10 | 7.7 |
| | agent $ (mean, × bare) | .234 (1.09×) | .224 (1.04×) | .227 (1.05×), spread 147% (.130–.320) | .216 |
| | Stop blocks | 5/5 | 3/5 | **5/5** | — |
| be-vs-6140 | recall | 1 ×5 | 1 ×5 | 1 ×5 | 1 |
| | precision | 1,1,1,1,.75 | .6,.75,1,1,1 | .75,1,.75,.6,1 | 1 |
| | model calls | 7 ×5 | 3–5 | 5–8 | 5.7 |
| | agent $ (mean, × bare) | .213 (1.21×) | .130 (0.74×) | .164 (0.93×) | .176 |
| | Stop blocks | 5/5 | 0/5 | **4/5** | — |

Floors: 5973 recall back above bare (.728 vs .690); precision ≥ bare − band in both; 6140
precision fails on 3 runs (one extra each: `niosh-backup.service.ts` ×2 — unread, blocked, then kept
after the rewrite in one run — `niosh-manual-override.service.ts`, `ReportHelper.ts`).

## What the traces show

1. **The inference marker was used in prose, not on the `## Files` line.** e-Sjy7wr says
   "inferred from" 21 times in the role descriptions, but its `## Files` bullets are bare paths, so
   R1 flagged 8 lm-* files as `not read` and the block fired. Markers in 3/5 answers (21, 41, 26
   occurrences), blocks in 5/5. Fix in progress: R1 accepts an inference stated anywhere in the
   answer for that path (same served-basis rule); the note names the placement.
2. **The read redirect did not fire in e-wnv57U**: two native `Read`s (controller, ReportHelper)
   returned normally. Second D5 defect: the guard resolves the route only through
   `input.scratchpad_dir`; the sandbox gives none (route entry `scratchpadDir: undefined`), and the
   hook side falls back to `<tmp>/ambicode-hook-state/<hash(session)>`, which the guard never reads.
   Campaign 2's "0 native reads" was the model not trying, not the guard working. Fix in progress:
   the same fallback in the guard, keyed like the pointer.
3. **be-vs-6140 blocks returned (4/5) without a build change on that path**: this time the model
   listed `niosh-backup.service.ts` unread in 3 runs. Campaign 2 had 0/5 blocks on the same rules.
   The mechanism is stable (unread → block once → decide); whether the model lists an unread file in
   the first pass is not.

## Pass table status (01-cases.md)

| check | 5973 | 6140 |
|---|---|---|
| `read` receipts 5/5 | yes | yes |
| zsh / host cap / refusals 0 | yes | yes |
| native reads 0 | yes (not tried) | **no** (1 run; guard defect 2) |
| recall ≥ bare | yes | yes |
| precision ≥ bare − band | yes | **no** (3 runs) |
| quality within 10% of best | recall no (26%) | precision no (40%) |
| resources within 10% of cheapest | no | no |
| agent cost ≤ 1.1× bare (reported) | 1.05× | 0.93× |

Next: land the two fixes, then campaign 4 on the same two cases.

# R1 state (append-only)

| id | commit | tag | WP | decision | costUsd | note |
|---|---|---|---|---|---|---|
| it-000 | 2c63668 (measured) | — | WP0 baseline | in flight | 51.39 so far | session 4 killed by the guard (false positive, `incidents/2026-09-29T02-16-40-123Z-system-change.md`); T2 sweep interrupted after 13/18 cases; session 5 reruns the 5 unfinished cases one `--case` at a time into `evals/evals-core/results/`, log `baseline/scratch/t2-complete.log`, merged by `tools/t2-merge.mjs` |
| it-000 | 2c63668 (measured; recorded in the tagged commit) | gym/R1/it-000, gym/R1/cp-0 | WP0 baseline | accept; cp-0 go | 65.56 eval (+ lead sessions; ledger ≈ 75.7 of 150) | `baseline/decision.md`, `cp-0.md`; review with-arm helper-ran 23/24 at baseline (WP1 item 2 premise gone) |

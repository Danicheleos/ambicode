# it-002 — queue the 6 local VS-6735 review findings for human labels
WP: WP1 item 3 (01 §4)   Seam: `gym/runs/R1/labels/pending.md` only (02 §6)
Claim: none measured. It creates the human labels that WP4's T4 metric "findings about later plan iterations" (01 §3 T4, baseline 4 of 6 by the audit's judgement, 00-audit.md:108) and actionable precision (`evals/evals-archived/typescript/adjudication.md:30`) need.
Must not move: nothing in the plugin changes; G1–G3 as a sanity check
Measurement plan: G1–G3 ($0). T1/T2/T3/T4: none (no code, no trigger surface, no new cycle).
Budget for this iteration: $0 in eval spend. Files allowed to change: `gym/runs/R1/**`.
Source: the 6 findings of `archive/gym__planing__investigation__cache__VS-6735/reviews/local_2026-09-28T21-30/result.json` (3) and `…/local_2026-09-28T21-38/result.json` (3). `local_2026-09-28T22-13` has 0 findings. The label entries cite finding ids, categories and file:line only, never finding text (06 §2).
Rollback: `git reset --hard gym/R1/it-001`.

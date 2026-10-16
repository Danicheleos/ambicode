# Campaign 1 — D1–D6 together, 3 cases × 5, Sonnet 5.5 effort low (2026-10-09)

Runs: `27_1949` (be-vs-6140), `28_1950` (fe-vs-6406), `29_1951` (be-vs-5973) under
`../ambicode-evals-assets/outputs/core/2026-10-09/`. Harness cost $1.07 + $0.74 + $1.46 incl. judging.
Claude Code 2.1.295/296; the bare lock ran on 2.1.292, so `evals:gate` refuses the bare comparison
(“ran on Claude Code version 2.1.292, this run on 2.1.295”). Cost ratios below are computed by hand
against the lock's agent means and carry that caveat. No bare rerun (user decision).

## Mechanics (all 15 runs)

| check | result |
|---|---|
| `read` receipts | 15/15 runs (1–3 per run) |
| zsh glob failures | 0 (was 21/24 attempts) |
| host-capped outputs | 0 (was 2/24) |
| operand refusals, failed tool calls | 0 |
| native Read / Bash `cat|sed` reads | **still present in 9/15 runs** — the D5 redirect never fired (0 denies in 15 traces) |
| Stop block (D6 R1/R2) | fired in **12/15** runs: 5/5 6140, 3/5 6406, 5/5 5973 |

## Drift table (`evals:bench -- drift`)

| case | metric | per rep | spread | band |
|---|---|---|---|---|
| be-vs-6140 | recall | 1 ×5 | 0% | in |
| | precision | 1 / 1 / 1 / 1 / .75 | 25% | OUT (was 1/.5/.75) |
| | model calls | 7 ×5 | 0% | in (was 7/7/5) |
| | tool calls | 6 / 7 / 6 / 5 / 5 | 40% | OUT (was 6/8/4) |
| | agent $ | .224 / .226 / .219 / .189 / .206 | 19% | OUT; mean .213 = **1.21× bare** (.176) |
| | peak ctx | 36.5k–39.7k | 8.7% | in |
| fe-vs-6406 | recall / precision / F1 | .095 ×5 / 1 ×5 / .174 ×5 | 0% | in (was .238/.095/.095) — equals bare exactly |
| | model calls | 4 / 6 / 4 / 5 / 5 | 50% | OUT |
| | agent $ | .092–.121 | 31% | OUT; mean .109 = 1.02× bare |
| | served B | 1,239–19,032 | — | OUT |
| be-vs-5973 | recall | .786 / .821 / .679 / .821 / .821 | 17% | OUT (was .75/.82/.79) |
| | precision | .885–.958 | 8% | in |
| | model calls / tool calls | 9/5/6/7/9 · 7/3/4/7/7 | 80% / 133% | OUT (was 6/9/7 · 5/9/9) |
| | agent $ | .208–.272 | 31% | OUT (was 72%); mean .234 = 1.09× bare |
| | peak ctx | 36.7k–45.8k | 25% | OUT (was 66%) |

Floors (recall ≥ bare point, precision ≥ bare − band): 6140 recall holds, precision .75 on one run
is below 1.0 − band; 6406 holds; 5973 holds (recall mean .786 vs .690; precision mean .919 vs .924 − band).

## What the traces show

1. **D5 did not act in the sandbox.** `readDecision` finds the repository by walking up from
   `cwd` to a `.ambicode/task/<task>` directory. The sandbox cwd is `/private/tmp/e-…/home/cwd` and
   the repository is *below* it at `…/cwd/repo`, so no ledger is found and the guard returns `{}`.
   The PostToolUse `tool{Read}` entries prove the hooks ran and the pointer resolved. Fix in
   progress: derive the root from the target file's directory. Reproduction added as a guard test.
2. **The Stop block is the new cost.** 6140's constant 7 model calls = read → answer → block →
   re-read → answer. Mean agent cost rose from ≈ .18 (15_1241) to .21. Block lines seen:
   - 6140: `not read: niosh.controller.spec.ts` (truth; the bare model lists specs without reading
     them) and `not read:`/`undecided:` on `ReportHelper.ts`/`.spec.ts` (the evidence-promotion
     extras; after the block 4/5 runs dropped them — precision 1.0 ×4);
   - 6406: `not read: registered-users.component.scss` (1 line);
   - 5973: 8 lines per run, lm-lift/niosh DTOs, validators, `Scoring.ts`, `UnitOfMeasure.ts` —
     files listed by pattern and never opened.
   Fix in progress: a change path counts as covered when a served file is its companion (same
   directory, same basename stem), which removes the spec false positives; the 5973 lines stand.
3. **6406 lost its upside and its drift together.** Recall .095 ×5 is exactly bare. The .238
   repetitions of earlier builds came from proposing the location-select component's own files;
   with every run now reading the same leads and the block questioning unread files, no run does.
   This meets the drift target and the floor; it does not meet the pinned reference floor
   (26_1600 mean .143 − band).
4. **Served bytes still vary 2–15×** within a case, because the model still chooses between the
   ready `read:` line and its own operands; D4's outline/dedupe bounded the maximum (no cut, no
   continuation re-reads) but not the minimum.

## Decision

Campaign 1 does not pass the pass table: mechanics columns pass except the native reads, quality
is in band on 6406 and almost on 6140, resources are not. Two defects are being fixed before
campaign 2 (D5 root discovery, D6 companion rule); campaign 2 then re-measures the same three cases.

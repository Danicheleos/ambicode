# it-009 decision — WPH H2-repair (R-3): **accept**

Plan revision R-3. Verdict rule from the brief and 02 §5 (WP0-type row): gates green, tests present, Sonnet preflight passes. All three hold. The Sonnet preflight passed on the first run; no rerun was needed and none was made.

## What it rests on

`metrics.json` (verified by `handoffs/verifier.md`, 0 disagreements on numeric or boolean fields):

```
G1  exit 0   tests 804  pass 803  fail 0  skipped 1     (795 at it-007; +9)
G2  exit 0   zip sha256 bee92a9a…7033                   (identical to it-005..it-008)
G3  exit 0   554 tracked text files, LF
diff vs gym/R1/it-005, outside gym/: prompt.md, evals-preflight.mjs, evals-preflight.test.mjs (102+/7-)

Sonnet preflight  $0.2097  passed
  regression-ts            plugin-fired, helper-ran, reviewer-completed, unit-check-ran: all PASS
  p2-task-regression-fix   plugin-fired PASS, helper-ran PASS, unit-check-ran NOTE "passed, not gated on Sonnet"
Opus preflight    $0.4025  passed
  p2-task-regression-fix   plugin-fired, helper-ran, unit-check-ran: all PASS (unit-check-ran is a gate on Opus)
```

Eval cost of the iteration: $0.612 (0.2097 + 0.4025).

## Read this before H2-T2

- **The prompt names the skill, so this pass proves the skill's mechanics, not that Sonnet triggers it.** T1 is the trigger metric (02 §3.5 step 2, R-3).
- **On Sonnet, two ungated graders of `p2-task-regression-fix` failed:** `add-restored` false, `fixed-and-verified` false. On Opus both are true. The preflight does not gate them, so the pass stands, but the Sonnet run called the skill without restoring `add`. Not investigated (no trace kept, see below). It is a reason to expect the Sonnet arm of a task-skill T2 case to be weaker than Opus's.
- **`unit-check-ran` passed on Sonnet** (1 of 1). R-2 made it a NOTE because Sonnet never called the skill; with the prompt naming the skill, that reason may no longer hold. Restoring the gate is the owner's call (03 §2). One pass is not evidence it would stay passing. Filed as a note in `OWNER-INBOX.md`, not a label that blocks anything.
- The NOTE's reason string still says Sonnet "never called the task skill on 6 of 6 preflights". That is the history at R-2 and stays true as history; it is no longer a description of this run. I left the string as R-3 specified it.

## Not measured

- **Skill-call counts.** The preflights ran without `--keep-temp`, so the sandbox traces (`/private/tmp/e-*`) were gone when I went to copy them. "Skill fired" here is the `plugin-fired` grader's result only. I did not re-run a preflight to get a trace: the brief allows a `--keep-temp` rerun only after a failure.
- T1, T2, T3, T4 (no seam they see; T4 null). The Opus T2 history is unaffected: the repaired case is in the archived suite only (R-2 evidence).
- The verifier could not check the "6 of 6 preflights" tally in the NOTE string (sandboxes deleted); it comes from it-006 and it-008 decisions.

## Correction to the worker handoff

`handoffs/worker-1.md` says the old (g)'s two `\bimplement\b` assertions "are gone". They are not: `evals-preflight.test.mjs` lines 179 and 183 still assert `implement` in the prompt body and in the skill description. The verifier's diff of the tests found no assertion removed. The brief's "assertions added, none removed" holds.

## Next

H2-T2: T2 at 3 runs/arm on Sonnet, added to `baseline/metrics-R-1.json`, tag `gym/R1/cp-S0` (≈ $57 is the Opus figure of 01 §5; no Sonnet figure is measured yet; ledger ≈ $182 of $400 before it).

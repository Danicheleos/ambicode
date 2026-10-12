# Phase B — eval gate answers (notice 1), 2026-10-07

## What changed
- `evals/scripts/src/harness/eval-answers.mjs`: one table of gate → answer per skill. It accepts what the route proposes (`plan-accept=Accept`, `draft-ok=implement anyway`, `estimate=run`, `init-apply=Apply as proposed`, `sources=use these sources`, `rules-table=Apply all`) and declines the extra after a task (`review-offer=skip — verification incomplete`). Investigate (`scope`) and the registry gates (budget, scope-expanding) get no answer.
- `prompt-transport.mjs` and `plan-run.mjs` build their commands from that table.
- `ledger-metrics.mjs` adds a `headlessDefaults` measure: `default-taken` entries with `via: headless`, counted per gate.
- `eval-gate.mjs`: if any with-arm run took a headless default, the gate reports a gap `<kind>: gate answers` that names each gate and its count.

## Commands after `select --regenerate` (76 cases)
```
  20 /ambicode:investigate --headless
  20 /ambicode:plan --headless --answer plan-accept=Accept
  16 /ambicode:review --headless --answer estimate=run
  20 /ambicode:task --headless --answer "draft-ok=implement anyway" --answer "review-offer=skip — verification incomplete"
```
The regeneration changed only the 20 task `prompt.with.md` files and the cases lock bookkeeping. The naked prompts are byte-identical.

## Bundle probe (fixture repo, built bundle)
```
{"kind":"preanswer","gate":"draft-ok","option":"implement anyway","via":"prompt","trusted":false}
{"kind":"preanswer","gate":"review-offer","option":"skip — verification incomplete","via":"prompt","trusted":false}
```
The probe called the CLI directly, so `trusted` is false. In a real eval the prompt hook starts the route instead. `splitLaunch` parsing of these quoted answers is covered by `route-hooks.test.ts`.

## Tests
- evals: 361/361
- `src/hook/events`: 80/80
- typecheck clean
- build ok

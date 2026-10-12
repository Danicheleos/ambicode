# Investigate ×5: where each run drifts, why, and what moves it

Batch: 2026-10-12, Sonnet 5.5, effort low, 5 runs per case, plugin arm and bare arm.
Cases: `investigate-files` (v2), `investigate-how` (v2), `investigate-nomatch`.
Raw data and the scripts that produced every number here: `eval-replay/evals/raw/2026-10-12-investigate-x5/`.

## Answer first

1. **Turns are not where the danger is.** The "turns" column counts streamed assistant events, which is
   tool calls + 1. Model calls were 2–4 in all 30 runs and never drifted. The 7-turn runs were not
   slower or dearer than the 3–4-turn runs.
2. **Recall drift in the plugin has one cause: the map hides test files**, and the step tells the model
   to list tests. Every plugin run first read exactly the map's candidates. Runs that happened to add
   `git ls-files` or `find` to that first Bash call saw the test file; the run that used five parallel
   `Read` calls could not, and said so in its answer.
3. **Citation and route-done drift has two plugin defects stacked.** The model abbreviates a second
   citation to `service.ts:4` in 3 of 5 how-runs, the checker rejects it, and the revise text
   ("This is the last revision: the answer goes to the user as it is") makes the model answer without
   re-saving the note in 3 of 3. The route never reaches done. The user still got a correct answer.
4. **The one recall 0 / precision 0 run is a bug in the eval metric, not a model drift.** The parser
   takes the first heading that starts with "Files", and that run's answer had
   `## Files that look relevant but are not part of the answer` above `## Files`. With an exact heading
   match the run scores recall 1, precision 1.
5. **Bare drift is a judgment call, not a retrieval miss.** Bare read or saw the test file in 5 of 5
   files-runs and left it out in 3, each time stating "I assumed the field is optional".

## 1. Per-run numbers

`harness turns` is the eval's `turns`. `model calls` are distinct main-session API messages.
`new input tok` is uncached input plus cache creation, summed over calls. Output tokens are left out:
the trace's usage is taken from the first streamed event of a message and undercounts them.

| arm | case | run | score | harness turns | model calls | tool calls | first action | s | $ | peak ctx | new input tok | revise | failing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| plugin | files | 1 | 0.78 | 7 | 3 | 6 | Read×5 | 19 | 0.0734 | 21221 | 13995 |  | files-complete |
| plugin | files | 2 | 1.00 | 4 | 4 | 3 | Bash | 20 | 0.0758 | 21592 | 14368 |  | — |
| plugin | files | 3 | 1.00 | 4 | 4 | 3 | Bash | 22 | 0.0812 | 22131 | 14907 |  | — |
| plugin | files | 4 | 1.00 | 4 | 4 | 3 | Bash | 21 | 0.0801 | 22031 | 14807 |  | — |
| plugin | files | 5 | 1.00 | 4 | 4 | 3 | Bash | 23 | 0.0758 | 21619 | 14395 |  | — |
| plugin | how | 1 | 0.78 | 7 | 3 | 6 | Read×5 | 22 | 0.0870 | 24102 | 16876 | yes | citations-valid, route-done |
| plugin | how | 2 | 0.78 | 7 | 3 | 6 | Read×5 | 18 | 0.0859 | 23955 | 16729 | yes | citations-valid, route-done |
| plugin | how | 3 | 1.00 | 3 | 3 | 2 | Bash | 16 | 0.0697 | 21171 | 13945 |  | — |
| plugin | how | 4 | 1.00 | 3 | 3 | 2 | Bash | 17 | 0.0721 | 21286 | 14060 |  | — |
| plugin | how | 5 | 0.78 | 3 | 3 | 2 | Bash | 18 | 0.0829 | 23699 | 16473 | yes | citations-valid, route-done |
| plugin | nomatch | 1–5 | 1.00 | 2 | 2 | 1 | ToolSearch | 10–18 | 0.0499–0.0522 | 18001–18228 | 10773–11000 |  | — |
| bare | files | 1 | 0.67 | 3 | 3 | 2 | Bash | 15 | 0.0518 | 17308 | 10082 |  | files-complete |
| bare | files | 2 | 1.00 | 4 | 4 | 3 | Bash | 17 | 0.0567 | 17786 | 10562 |  | — |
| bare | files | 3 | 0.67 | 4 | 4 | 3 | Bash | 16 | 0.0544 | 17400 | 10176 |  | files-complete |
| bare | files | 4 | 0.67 | 4 | 4 | 3 | Bash | 20 | 0.0561 | 17583 | 10359 |  | files-complete |
| bare | files | 5 | 0.67 | 4 | 4 | 3 | Bash | 15 | 0.0535 | 17441 | 10217 |  | files-complete |
| bare | how | 1 | 1.00 | 6 | 3 | 5 | Grep | 12 | 0.0520 | 17118 | 9892 |  | — |
| bare | how | 2 | 0.80 | 6 | 3 | 5 | Grep | 11 | 0.0522 | 17212 | 9986 |  | answer-cites-service |
| bare | how | 3 | 0.80 | 7 | 3 | 6 | Grep | 13 | 0.0539 | 17357 | 10131 |  | answer-cites-service |
| bare | how | 4 | 0.40 | 5 | 3 | 4 | Grep | 11 | 0.0507 | 17010 | 9784 |  | answer-cites-service, answer-correct |
| bare | how | 5 | 0.80 | 5 | 3 | 4 | Grep | 11 | 0.0515 | 17186 | 9960 |  | answer-cites-service |
| bare | nomatch | 1–5 | 1.00 | 4 | 4 | 3 | Grep | 12–14 | 0.0516–0.0535 | 17268–17555 | 10044–10331 |  | — |

Retrieval metrics, recorded and recomputed with an exact `## Files` heading (section 4.3):

```
                 recorded recall  recorded precision   exact-heading recall  precision
plugin files     0.667 1 1 1 1    1 1 1 1 1            0.667 1 1 1 1         1 1 1 1 1
plugin how       1 0 1 1 1        1 0 1 1 1            1 1 1 1 1             1 1 1 1 1
bare files       0.667 1 0.667 1 0.667   1 ×5          unchanged             unchanged
bare how         1 ×5             1 ×5                 unchanged             unchanged
```

## 2. What the model gets and what it returns

### Plugin, files and how

Before call 1 the model holds the system prompt, the SessionStart contract (2,497 bytes of hook
output) and the skill expansion, which runs `route start` and prints the first model step, `read`.
`ground` (code: normalize, map, policy, context list) has already run inside `route start`.

The delivered `read` step, reproduced offline (`step-read-investigate-*.txt`):

```
section                    files   how
header + instruction        1389  1381   (read.md: save the note first, cite path:line, Files question incl. tests)
## map                      1845  1992   (6 candidates for files, 5 for how; tests excluded by design)
## policy:before-work       3532  3532   (15 common-quality code-writing rules)
## context.list               64    64   ("no context: run /ambicode:init")
total                       6875  7014
```

Half the step is the before-work policy: rules about cohesion, comments, test determinism, written for
a code change. The investigate route edits nothing.

First-call context is 19.9–20.2k tokens in the plugin against 16.2k in the bare arm. The 3.7k
difference is the contract, the step and the plugin's extra skill and agent listings.

The workflow then has three or four model calls in every run:

```
call 1  reads the map's candidates            Read×5  |  one Bash: cat -n <candidates> [+ git ls-files | find]
call 2  (files, Bash runs only) cat -n tests/invoices.test.ts src/app.ts [docs/glossary.md]
call 2/3 note save --kind investigation       → route: check-citations runs inside the CLI
         passes  → "[ambicode] … complete"    (224 B)
         fails   → read step re-delivered     (7,244–7,285 B: full step + "Citation check failed" + "Last round")
last    the answer
```

### Plugin, nomatch

`ground` finds nothing, so the route raises the `scope` gate instead of `read`; the step is 886 bytes.
All five runs did the same two calls: `ToolSearch` for AskUserQuestion, which a headless run does not
have, then a paused answer. No drift.

### Bare

The bare model gets the question and the Files-section request only. It has no map, no "cite
path:line", no "tests included". Files: `git ls-files` + `grep -ril invoice` in one Bash call, then `cat`
of the invoice files, sometimes a second `cat`. How: `Grep` then four or five parallel `Read`s.
Nomatch: `Grep`, then `ls`/`git ls-files`, then a wider grep.

## 3. First drift per metric

All runs of a case receive the same input to within ±300 tokens (sandbox path, task id, timestamps).
Every divergence starts at sampling, at the first action, except where noted.

### 3.1 Harness turns: action 0, harmless here

| case | first action | harness turns | model calls | s | $ |
|---|---|---|---|---|---|
| plugin files | Read×5 (1 run) | 7 | 3 | 19 | 0.0734 |
| plugin files | Bash (4 runs) | 4 | 4 | 20–23 | 0.0758–0.0812 |
| plugin how | Read×5 (2 runs, both revised) | 7 | 3 | 18–22 | 0.0859–0.0870 |
| plugin how | Bash (3 runs, 1 revised) | 3 | 3 | 16–18 | 0.0697–0.0829 |

The trace shows why: in plugin files run 1 there are 7 assistant events but 3 distinct API messages.
Each parallel `tool_use` streams as its own event, and `num_turns` counts events. Six parallel reads
cost one model call.

Where turns would hurt: the cases set `max_turns: 12`. If that cap counts the same unit, a run that
reads eleven map candidates in parallel would be cut off with one model call spent. I'd guess it does;
this is unverified.

What actually raises cost in this batch is the revise, not turns. A revise re-delivers the whole read
step: the final call's new input jumps from 453–551 tokens to 2,953–3,248 tokens, about +$0.01 per run.

### 3.2 Recall, plugin files: action 0, cause is the map

Every plugin files-run first read exactly the map's candidates (five of six; `src/routes/users.ts`
skipped). The map cannot contain `tests/invoices.test.ts`: the map filters every path through
`isSearchable`, which sets `excludeTests: true` (`src/util/path-classes.ts`).

- **Bash runs (4/5)** appended `git ls-files | head -50` or `find . -type f` to the same first call,
  saw `tests/invoices.test.ts`, read it in call 2 and listed it. Recall 1.
- **Read×5 run (1/5)** has no way to list the tree with `Read`. Its answer says:
  "I only looked at the files the file map listed, so I didn't search for tests, schemas, DTOs or
  mocks." Recall 0.667.

The step text asks for "routes and tests included", while the payload it ships hides tests. Whether the
model sees the test file depends on whether it adds a listing command to the first call by chance.

### 3.3 Recall, bare files: the final answer, cause is an unstated premise

Bare saw the test file in all five runs, through `git ls-files`, and read it in three. Runs 1, 3 and 5
left it out, each stating the same assumption: "If you make the field optional (`dueDate?: string`),
the test stays valid and doesn't need an edit. I've assumed optional, so the test isn't listed."

The question does not say whether `dueDate` is required. The case's ground truth assumes it is. The
plugin step's "tests included" line settles that assumption in the plugin's favour, so part of the
plugin's lift on this case is that line, not retrieval.

Bare run 4 listed all three files and still failed `files-complete` (judge 0/3). Its only difference
is "`docs/glossary.md` mentions invoices, and you could optionally add `dueDate` there". I'd guess the
judge read that as listing a decoy; the judge gives no reason, so this is unverified.

### 3.4 Citations-valid and route-done, plugin how: the note save, two defects

The first drift is inside the note the model saves in call 2. Runs 1, 2 and 5 cite the throw line a
second time with a bare file name:

```
Total = amountCents + taxCents (src/invoices/service.ts:3-5), throws 'negative amount' if amountCents < 0 (service.ts:4).
```

`check-citations` resolves `service.ts` against the repository root and reports `missing-file`. This
happened in both Read×5 runs and in one Bash run, so the first action does not cause it. It did not
happen in any files-run; the how answer cites more lines of one file, which is where the abbreviation
appears.

The second defect turns a recoverable check into a stuck route. `read` has `repeat: 2`, so the first
revise is already the last one, and the CLI appends:

```
## Last round
This is the last revision: the answer goes to the user as it is.
```

In 3 of 3 revised runs the model read that as "no need to save again". It wrote a corrected answer
with full paths, did not run `note save`, and the route stayed at `read (4/5)`. Run 2 said so
explicitly: "The saved note cited one line as `service.ts:4` instead of the full path, so the citation
check flagged it. The citations below use full paths."

### 3.5 Precision: no drift

Every plugin and bare run has precision 1 once the heading bug (4.3) is removed. No run listed a
decoy in its `## Files` section.

### 3.6 Answer citations, bare how: an asymmetric grader

`answer-cites-service` requires `src/invoices/service.ts:<line>`. Bare cited a line in 1 of 5 runs and
wrote `repo/src/invoices/service.ts` without a line in the other four. The bare prompt never asks for
`path:line`; the plugin step does ("Cite `path:line` for claims"). This shared grader measures an
instruction only one arm receives.

Bare run 4 also failed `answer-correct`. It read only the comment of `src/reports/monthly.ts` and said
it had not checked whether it uses `total()`. I'd guess the judge counted that as presenting a decoy.

## 4. Levers, ranked by the drift they remove

### 4.1 Plugin

1. **Give the map the tests of its candidates.** Keep tests out of the ranking, and add a short
   `tests` field: tracked test paths whose stem matches a candidate's stem or that import a
   candidate (`tests/invoices.test.ts` matches both). `isTestPath` already exists. This removes the
   plugin files recall drift for any read strategy. No ecosystem table is needed.
2. **Fix the last-round wording** in `skills/investigate/scripts/check-citations.mjs`: "Save the
   corrected note once more; after that save the answer goes to the user as it is." The same text
   pattern exists in `plan-check.mjs`. This removes route-done failing after a citation revise: 3 of 5
   how-runs here.
3. **Resolve a bare file name in the citation check** when the same note already cites exactly one
   full path with that name, or exactly one tracked file has it. An ambiguous name stays a failure.
   This removes the revise in 3 of 5 how-runs and the +2.5k tokens it costs. The alternative is a
   read.md line "every citation uses the full repository path"; it is cheaper to write but relies on
   the model at effort low, which is what failed here.
4. **Re-deliver only the revise sections on a revise.** The step, map and policy are already in
   context; re-sending them is 7.2 KB per revise.
5. **Drop `policy:before-work` from the investigate payload.** It is 3,532 of 6,875 bytes of a
   read-only step. The route still stages it in `ground`; only the delivery changes.

Not proposed: telling the model to batch reads into one Bash call. It would lower the turn count, but
turns cost nothing here, and lever 1 removes the recall difference the strategy currently causes.

### 4.2 Eval suite

1. **Fix the Files heading match** in `evals/scripts/metrics.mjs`: accept only a heading that is
   exactly "Files", and take the last one. The fix needs a test with the
   "Files that look relevant…" heading that failed here.
2. **Track model calls and tool calls instead of `num_turns`.** Both are in the trace; `num_turns`
   mixes them and made a cheap run look like the worst one.
3. **Make `answer-cites-service` fair**: either both prompts ask for `path:line`, or the grader becomes
   plugin-only. As it stands the bare arm loses 4 of 5 runs on an instruction it never got.
4. **State the premise in `investigate-files`**: "add a required dueDate field". Without it, leaving
   the test out is a defensible answer, and the case measures the plugin's instruction rather than
   retrieval. That is a case-version bump.

## 5. What was not done

- No code was changed. Every lever above is a proposal for approval.
- No rerun was made to confirm a lever; each would need a paid ×5 batch of the affected case.
- `max_turns` counting `num_turns` is not verified.
- Subagents were not used; the per-run decomposition was cheap enough to run directly.

## Data

```
raw/2026-10-12-investigate-x5/
  plugin-result.json, bare-result.json     the eval results with per-run metrics
  plugin/<case>-<n>.json, bare/…           one run: calls, tools, results, route ledger, final text
  plugin/summary.json, bare/summary.json   alignment and first divergence per case
  step-read-investigate-*.txt              the read step as delivered, reproduced offline
  decompose.mjs                            result.json → per-run JSON
  calls.mjs                                per-call print: context, new tokens, tools, route state
  remetric.mjs                             metrics recomputed with an exact Files heading
evals/cases/results/traces/plugin/2026-10-12T18-45-58-015Z/   traces and kept .ambicode records
evals/cases/results/traces/bare/2026-10-12T18-47-11-218Z/
```

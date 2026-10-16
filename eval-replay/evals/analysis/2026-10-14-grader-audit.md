# Grader audit, plugin arm, 2026-10-14

Scope: latest plugin rows per case at the case's current version in `evals/history.jsonl`, plus older rows at the same version for priority cases. `rules-migrate` excluded (rerun in progress). Run counts below are runs at the current case version unless a window is named. Traces: `evals/cases/results/traces/plugin/<ts>/`. "Inferred" marks anything not read directly from a trace or file.

## Lead

Failing graders in the latest rows: review-subtle (cites-caller 2/3, finding-correct 2/3 at 14:53), init-auto (check-wired 1/1 at 00:23), plan-accept (plan-quality 1/1 at 00:23, then 0/3 at 14:53). Every other case is at 1.0 in its latest row (investigate-*, plan-draft, plan-reuse, review-clean/defect/regression/skipped, task-*).

Top 3 causes:

1. **The plan route ends without saying the plan was accepted.** `src/harness/engine/execute.ts:100` prints only "The route is complete. Make no more edits...". The ledger holds `acceptance` and `note:plan` in 4/4 plan-accept runs (00:23 and 14:53), but the final message calls the plan a draft or unverified in 3/4 and hedges in the 4th; `skills/plan/SKILL.md` ("Never call a plan accepted merely because it was generated") reinforces it. No grader scores this; it is a wrong claim to the user.
2. **The review chain loses the caller evidence.** The reviewer skipped its Grep step in 1/3 (14:53) and 1/1 (00:23, invalid JSON instead); `routes/review/readback.md` ("one sentence" per finding) dropped the caller paths in another 1/3. 5/10 finding-correct and 3/10 cites-caller failures since 10-13T07.
3. **"Invent nothing" and "name only files you change" are read literally, in the wrong direction.** init left `checks` null although jest is in devDependencies (3/4 runs); plan-accept named ruled-out files in a "Out of scope" line although `routes/plan/write.md` says not to (1/4 since that rule existed).

## Failure table

| case | grader | failed / runs | category | smallest fix |
|---|---|---|---|---|
| review-subtle | cites-caller | 3/10 (since 10-13T07; latest row 2/3) | instruction-ignored (reviewer) and injected-text-misled (readback) | brief lists callers of changed names; readback keeps `path:line` |
| review-subtle | finding-correct | 5/10 (latest row 2/3) | same as above; 2 of the 5 look like grader-noise (inferred) | same |
| review-subtle | convention-finding, finding-recorded | 1/10 each | model-capability + code gap (first fenced block parsed) | parse the last fenced block |
| init-auto | check-wired | 3/4 | injected-text-misled | `skills/init/SKILL.md` step 3 wording |
| plan-accept | plan-quality | 1/4 with current write.md (3/16 over all v5 rows; the other 2 predate the rule) | instruction-ignored plus grader strictness | wording, grader text |
| plan-accept | no-edit | 1/16 (02:24, before write.md said "never by patching") | instruction-missing, already fixed | none |
| plan-reuse | plan-quality | 1/4 (10-12 23:38 run 3; latest n1 passes) | instruction-missing | `routes/plan/design.md` reuse sweep wording |
| investigate-trace | answer-correct | 1/4 (10-12 23:36 run 3; latest n1 passes) | model-capability, hedging pushed by contract (inferred) | none worth making |
| task-multi | test-added | 3/18 since 10-13T05 (v4: 0/1) | grader-noise (not chased, per brief) | none |
| task-multi | report-sections etc. | 5/33 over all v3 rows, 0 since 10-13T06:22 | obsolete flow | none |
| review-defect | finding-correct | 2/3 at 10-13T05:37 only; 0/7 since 06:20 | obsolete flow (mc 9-11, now 2) | none |
| plan-draft | none at v2 | 0/4 | n/a | n/a |

## review-subtle

Latest row 2026-10-14T14:53 (n3, score 0.867, mc 2, $0.129). Graders: `cites-caller` is a regex `src/(invoices|reports)/[\w./-]+\.js:\d+` on the last message; `finding-correct` is an LLM judge on the last message (a caller outside the diff must be named with location).

Run 1 (failed both). Reviewer made 1 tool call (Read of brief.md), no Grep. Its own coverage note says it. Injected text it had: the step prompt "it holds the whole diff ... The code is in the checkout. Answer with the JSON block only." and `agents/reviewer.md` Dependents bullet ("Grep the checkout ... open each caller outside the diff").
```
reviewer coverageNotes: "I did not grep the callers of `round`, so I did not confirm which ones change behaviour."
```
Category instruction-ignored: the Dependents instruction exists and was not followed; the step prompt framing ("whole diff", "JSON block only") plausibly lets the model treat the brief as complete (inferred). Passing run 3 did Read, Grep `round\(`, Grep (failed path); run 2 did Read, Grep, Read.

Run 2 (failed both). The reviewer did Grep and named callers inside its explanation (`invoices/service.js:55`, `reports/service.js:53`). The generated report holds them. `routes/review/readback.md` told the model "Findings, one line each: `path:line`, risk, one sentence". The final message kept `reports/service.js:53` only under the NaN finding, wrote "including toCents, invoice tax and the report average" with no path under the rounding finding, and dropped the `src/` prefix.
```
readback.md: "Findings, one line each: `path:line`, risk, one sentence"
final:      "...changes results for every caller, including toCents, invoice tax and the report average."
```
Category injected-text-misled. Fix: in `routes/review/readback.md`, change to "one or two sentences; keep every `path:line` the explanation names, with the repository-relative path".

Run 3 passed: the final copied the callers (`src/invoices/service.js:55`, `src/reports/service.js:53`).

00:23 (n1, 0.533): reviewer wrote a first json block with `"line": collapsed` and then a corrected second block. `src/skills/review/record-answer.ts:18` `FENCE` has no `g` flag, so the first block is parsed; the review was recorded as failed (`invalid-output`) and 4 graders failed. The reviewer broke "exactly one fenced json block". Fix in code: take the last fenced block that parses (and record that more than one block was present).

Older v2 rows at 07:45 run 2 and 08:26 run 3: the final message names `src/invoices/service.js:55` and says tax changes (100.5 became 100), yet `finding-correct` failed. Judge noise (inferred; the grader text asks only for a caller outside the diff with location).

Smallest fixes, ranked:
1. Code: the brief gets a "Callers outside the diff" block built by the existing search module for each changed function name (generic: any language with a name-based refs index). Removes the dependence on the reviewer choosing to Grep and removes 1-2 reviewer tool round trips (the passing runs made 2-3 tool calls, 11-12 s each, measured from `usage` in the traces).
2. `routes/review/readback.md`: keep the paths (above).
3. `record-answer.ts`: last parsable fenced block.

## init-auto

Row 10-13T00:04 n3 (check-wired 2/3) and 10-14T00:23 n1 (0/1 pass). Grader: regex `jest` in `.ambicode/config.yaml`. The prompt is `/ambicode:init --auto` on a repo whose package.json lists jest and eslint as devDependencies, no scripts, no lockfile.
```
model: "...no scripts and no lockfile, so I'm leaving the package manager, commands and checks null."
SKILL.md step 3: "Unknown stays null; invent nothing."
```
Category injected-text-misled. A declared dependency is not an invention; the instruction gives no rule for "tool declared, no script". Fix in `skills/init/SKILL.md` step 3, stated generically: "A test or lint tool declared in the manifest is a known check: wire it with that tool's standard invocation even when no script names it. Null only when no tool is declared."

Plumbing in this case: 7 model calls; the first Glob (`{*,*/*}/{package.json,...}`, depth-2 pattern that cannot match a root file) returned nothing and the model repeated it at depth 0; `Read config.yaml` is needed only for the template. Code fix: `skills/init/scripts/scaffold.mjs` prints `manifests: [...]` and the config template, removing 2 Glob calls and 1 Read (3 of 7 calls; inferred saving).

## plan-accept

Grader `plan-quality` (LLM, reads plan-body.md): names no file under src/users, src/legacy, src/reports.

00:23 n1 (failed): the plan has an "Out of scope" line naming `src/legacy/invoice-export.ts` and `src/reports/monthly.ts`. The step text it received said "Name only files the plan changes or reuses: a file you read and ruled out goes unnamed, in any section." The model said so itself.
```
final: "I named `src/legacy/invoice-export.ts` and `src/reports/monthly.ts` in the plan as out of scope. The route's guidance says files ruled out should go unnamed"
```
Category instruction-ignored; the grader is also literal (a "leaves out" mention is not a plan to change them). Earlier 10-12 23:37 runs 2 and 3 failed the same way (before the rule existed). 14:53: 0/3 name them. Fix options: grader text "does not plan to change or reuse"; plugin side, none beyond the existing sentence (adding more prose is the tuning memory's last resort).

02:24 run 1 `no-edit`: anchor failure "Bare file name anchor; fix it with the full path." and the model used `Edit` on plan-body.md. `write.md` then said "Write ... never through the shell"; it now says "writing the whole file again with the Write tool, never by patching it". Already fixed.

Acceptance misreport (no grader): see Lead 1. `execute.ts:100` fix: for a completed route, the closing body lists each recorded gate answer and each promoted note path ("plan-accept=Accept recorded; promoted to .ambicode/tasks/plan-due/plan_...md"). Generic, no plan-specific code. And `skills/plan/SKILL.md`: "Accepted means the route recorded Accept; the completion message states it."

## plan-reuse (priority)

Rows at v2: 10-12 23:38 n3 (plan-quality 1/3), 10-14 00:23 n1 (pass, $0.2096, mc 10). Grader requires reuse of `validateDate` and `validateRange` from the shared validation module, `invoices.outstanding`, `daysBetween`, and no new date comparison.

Run 3 (failed) plan body has 0 mentions of `validateRange` and compares dates by string itself ("compare to the validated `issuedAt` string"). Its tool calls: ls, `context --help`, cat of invoices/reports module notes only, cats of src files, `refs --declarations` for `createInvoice validateDate outstanding unpaidInvoices groupBy`. It never opened `modules/shared.md` or `src/shared/validation/`. Runs 1 and 2 cat'ed `src/shared/validation/range.js` and used it.
```
design.md: "look for an existing one with `refs --declarations <name>`"
context.list: "Read only the one file you need."
```
Category instruction-missing: `refs` finds only a name you already know, and "Read only the one file you need" invites skipping the shared module. Fix in `routes/plan/design.md`, generic: "Reuse sweep: read the context note of every module the change touches and of the shared/common module, and list its directory; `refs` only confirms a name you already know."

## investigate-trace (priority)

Rows v3: 10-12 23:36 n3 (answer-correct 1/3), 10-14 00:23 n1 (pass, mc 3, 9 parallel tool calls). In the 10-12 batch all 3 runs got one Stop-hook feedback round (citations carried a `repo/` prefix taken from Grep output); 00:23 had 0. Run 3's final answer is complete on the event-bus flow but hedges: "My grep did not search for its name, so I did not confirm that nothing calls it", "I did not read `channels` or `templates`". The judge needs "does not present legacy as part of the flow" and the channels hop. Category model-capability, with hedging encouraged by the contract line "State uncertainty ... An absence of evidence is not evidence" (inferred). I would not change wording on 1/4.

## task-multi (priority)

Latest v4 n1: score 1.0, $0.1357, mc 8, 14 tool calls, 0 route plumbing. Bare v4 n1 (00:14 batch): $0.108, mc 10, 9 tools. Measured from `usage` over main-thread calls: plugin cache-creation 21,592 tokens vs bare 16,848 (+4,744); first-call cache-creation 12,174 vs 9,099 (+3,075); output 2,920 vs 2,143. The step message is 5,290 bytes, of which `policy:before-work` is 2,988 (56%) and `context.list` 649. The extra cost is injected prefix plus longer output, not extra calls. Lever (unverified gain): trim `policy:before-work` to rules whose `appliesTo` matches the touched files, or send ids plus one-line gist. The plugin made one red check (model's first fix was incomplete; root cause found after the failure), which bare may also do.

`test-added` (3/18, v3): LLM judge on the final test file; noted as noise, not chased.

## plan-draft

0/4 failing at v2. Cost $0.144, mc 9: `refs` 1, `route next` 2, `ToolSearch select:AskUserQuestion` 1 (not available in the eval; inferred artefact of the harness `allowed_tools`). The final message says acceptance could not be asked; that is accurate.

## SKILL.md versus route text

- `skills/investigate/SKILL.md`: "An investigation edits nothing: no source, no config, no `.ambicode` file." versus `routes/investigate/read.md` (and `routes/plan/write.md`, `routes/review/readback.md`): "Learned how to navigate ... Add it with `{cli} context write`". Direct contradiction. Measured effect: 0 `context write` calls in 21 non-init, non-rules runs (00:23 and 14:53 batches), so the SKILL.md side wins and the line is dead weight. Decide one: drop the line from the route texts or carve out `.ambicode/context` in the SKILL.md.
- `skills/plan/SKILL.md` "stays a draft until the human answers the route's gate with Accept" versus headless preanswer `--answer plan-accept=Accept`: no text tells the model that a preanswer counts. See plan-accept.
- `skills/rules/SKILL.md` "Do not migrate everything ... asked about first" versus `routes/rules/draft.md` "Draft every rule a source states" (same bullet list as the already fixed line). Headless runs cannot ask; the two bullets pull opposite ways.
- `skills/rules/SKILL.md` step 4 `policy check --drafts --task <task>` versus `draft.md` adding `--project <id>`: minor mismatch.
- `skills/init/SKILL.md` "Unknown stays null; invent nothing" versus init-auto's grader expecting wired checks: see init-auto.

## Plumbing calls

Batch 10-14T00:23 (n1 each) from `breakdown.mjs` plus manual reading; n3 means from history in brackets. "Route next" is pure plumbing (the model calls it only to advance); "CLI work" is `refs`, `config`, `scaffold`, `check`, which carry output the model needs; each tool call is one sequential model round trip unless batched. Average cost per call (cost / model calls) is $0.017-0.019 for plan-accept and task-multi (upper bound, includes work).

| case | model calls | route next | other CLI | other plumbing | note |
|---|---|---|---|---|---|
| init-auto | 7 | 0 | 2 (scaffold, config packs+validate) | 1 empty Glob, 1 Read of config | cut 3 via scaffold output |
| investigate-files / -how | 2 / 2 | 0 | 0 | 0 | |
| investigate-nomatch | 2 | 0 | 0 | 1 ToolSearch for AskUserQuestion | harness artefact (inferred) |
| investigate-trace | 3 (10-12: 4.7) | 0 | 0 | 0 now; 1 Stop-hook retry per run on 10-12 (3/3) | retry gone in 00:23 |
| plan-accept | 6 (14:53: 6.3) | 2 | 1 refs in some runs | 0 | run 1 at 14:53 used 7 |
| plan-draft | 9 | 2 | 1 refs | 1 ToolSearch | |
| plan-reuse | 10 | 2 | 2 refs | 0 | 10-12 run 3 also ran `context --help` |
| review-clean / defect / regression / subtle | 2 each | 0 | 0 | 0 | the single Agent call is the work |
| review-skipped | 1 | 0 | 0 | 0 | |
| task-fix | 4 | 0 | 1 check | 0 | |
| task-multi | 8 | 0 | 2 check | 0 | first check red |
| task-review-skipped | 5 | 0 | 1 check | 0 | |

Retries and denials: no guard denial and no `error [...]` CLI result in any 10-14 trace outside rules-migrate. `error [bad-argument]` (invented check name) appeared about 155 times across 396 earlier runs (string count halved to remove double logging; approximate) and 0 times in the 125 runs from 10-13T07 on. Environment noise: `git`/`xcrun` sandbox errors appear in plan-accept and plan-draft traces and the model pipes through `grep -v xcrun` (extra tokens, no extra calls).

Cutting calls, by size: (a) plan routes: merge `design` and `plan-write` into one model step and have the Write of plan-body.md trigger plan-check in a PostToolUse hook; removes 2 of 6 (plan-accept), 2 of 9 (plan-draft), 2 of 10 (plan-reuse) calls (inferred, not built); (b) init: 3 of 7 as above; (c) review: callers in the brief removes 1-2 reviewer round trips.

## Fixes ranked by expected gain

1. Route-complete message states recorded gate answers and promoted notes (`src/harness/engine/execute.ts`), plus `skills/plan/SKILL.md` wording. Fixes a wrong claim in 3 of 4 plan-accept finals; affects every headless gate route.
2. Review chain: callers in the brief (code), `readback.md` keeps `path:line`, `record-answer.ts` last parsable block. Targets 5/10 finding-correct and 3/10 cites-caller; takes review-subtle from 0.867 toward 1.
3. `skills/init/SKILL.md` step 3 (tool declared = check) plus scaffold printing manifests. Targets 3/4 check-wired and cuts 3 of 7 calls.
4. Merge design and plan-write, auto plan-check on Write. Cuts 2 calls per plan run.
5. `routes/plan/design.md` reuse sweep: read the touched modules and the shared module, list its directory. Targets plan-reuse 1/4.
6. Resolve the `.ambicode` contradiction (investigate SKILL.md versus the `context write` lines) and the rules SKILL.md "ask first" bullet.
7. Trim `policy:before-work` in the task step (2,988 of 5,290 bytes); gain unmeasured.

Not done: no run was started; no source, route, skill or grader file was changed. Grader wording suggestions (plan-quality "name no file") are left to the owner of `evals/`.

# Next moves after runs 06_1853 and 07_1933, 2026-10-08

Inputs:
- [raw/24-25-26-27-next/report.md](../raw/24-25-26-27-next/report.md) (the audit).
- `evals/TRAINING-PLAN.md`: its "Closing a stage on its floor" rule and its reopened stage 2.

## Where the plan stands

- **Stage 2 (engine) is reopened.**
  - Its first close measured the old 6 cases and never ran the task walk.
  - The audit found defects in the engine and the hooks.
  - It now also carries stage 1's two failing thresholds: first-call context and route-ready time.
- **Stage 3 (map) has not started.**
  - Phase D and the prompt-word fix are map work done early.
  - 06_1853 is the current plugin reference, and it passes the gate.
- **07_1933 is reverted.** It was wording (stage 13) applied too early, and it failed the gate at 1.1538× cost.

Stage 2 thresholds, in TRAINING-PLAN:

```
threshold                                   now                                       move
exit entry >= 97%                           120/120 (06+07)                            S0 verify
budget exits 0                              0                                          S0 verify
unneeded Stop blocks 0                      1 per iteration, need not checked          S0
model calls over bare <= +2, p95 <= +2      -0.14; p95 13.05 vs 12.05                  S0 verify
route signatures per case 1                 not measured on the new set                S0
task walk closes exit:done                  not run                                    S6 (paid)
CLI calls read the task's repository        41 of 47 refusals in 07 from the shell dir  S2
export manifest records every file          per-note copy errors swallowed             S3
typed-route activation counted              gate prints "skill fired 0/60"             S1
guard denials of plugin commands 0          8 per iteration ($R/$A aliases)            S4
first-call context over bare <= 2,500       +2,824 (06); report says unmeasured        S1, then S5
route ready <= 5 s in >= 90%                46/60 = 76.7%                              S5
```

## Moves, in order

Each step is reported first and then waits for approval. Paid steps also need an explicit go.

| # | Move | Cost | Notes |
|---|---|---|---|
| M0 | **Done.** Revert `routes/investigate/read.md` to the 06 wording (`git checkout`; the diff was only the 07 wording). Note the reopen in `iterations.md`. | free | 07 failed the gate. |
| S0 | **Done:** `stage2-baseline-v2.md`. Write `stage2-baseline-v2.md` with the same depth as `stage1-baseline.md`. Measure every stage-2 row myself from the 06 and 07 artifacts: exits, budget exits, Stop blocks and whether each was needed, route signatures per case, model calls mean and p95, and route-ready time per case with map time split out. The audit's numbers are inputs to check, not results. | free | This is the measurement the first close lacked. |
| S1 | **Done** (4 tests added; evals 370/370). Ruler fixes that stage 2 needs to measure itself, each test-first from saved data: (a) the report loses the bare traces because `lockedBaseline.file` is a joined display string, so first-call context reads as unmeasured; (b) `skill fired` becomes typed-route activation; (c) `fileTruth` drops any truth list that holds a root file (be-vs-5075); (d) previous-run findings use the same kind and case intersection only. | free | (a) and (b) are stage-2 rows. (c) and (d) are stage 0, and stage 0 never closes on a floor. |
| S2 | Reader root. `runRead` opens the repository from the shell cwd (`search.ts:116`), while `record()` resolves the task's repository. Read from the task's repository when `--task` is given. The reproduction is e-iGjP0t. **Done 2026-10-08:** the CLI's `dispatch` runs every `--task` command in the repository that holds the task's ledger when the shell is outside it (`taskWorkingDirectory`, `task-dir.ts`). That covers read, review (walk 09_2132 `config-missing` ×2) and the rest. Test: `cli.test.ts` "a --task command runs in the task's repository". It failed before the fix with `src/a.ts: not found`. | free | Engine seam: L3, task-bound CLI calls. |
| S2b | Plan write path (walk 09_2132: 2 of 2 plan routes stuck at `plan-write`). The step asked for a `steps/plan-body.md` file; with no Write tool, the guard denied the shell write and pointed to `note save`, which leaves `plan-check` failing on the missing file. **Done 2026-10-08:** `routes/plan/write.md` pipes the plan to `plan check --task {task}` on stdin in one call. The guard's plan-body refusals and `plan-draft-missing` name that command. Tests: `plan-integration.test.ts` (stdin reaches plan-accept with no failed plan-check), guard reason assertions. | free | A Write-tool path still works for sessions that have Write. |
| S2c | Eval tool grant. The plan and task prompts do list Write and Edit in `allowed_tools`. The harness granted only `--allow-tools Bash`, so no eval run in `outputs/` was ever offered Write or Edit, bare or plugin. **Done 2026-10-09:** `run-options.mjs GRANTED_TOOLS = Bash Write Edit`, and the dry run prints it. Unverified until the next walk: that a case without Write in `allowed_tools` (investigate, review) still gets no Write. The plan and task bare runs made before this (including 08_2129) ran without Write and Edit. | free | Stage 0 ruler. |
| S2d | Task-route exit (walk 09_2132 fe-vs-5164-task: `red:repeated`, then Stop, no exit). **Done 2026-10-09:** at Stop, a user-set headless route that is not on its delivered final step ends `inconclusive` with `the headless session stopped at step <id>`. The extension is in `closeFinal` (`engine.ts`). Interactive routes stay open, since the user may continue. Test: `task-route.test.ts` "a headless session that stops mid-route…" (it failed first with no exit). It covers every skill: the two stuck plan routes would also end inconclusive. | free | Interactive SessionEnd is not covered. |
| S3 | Eval export manifest. `stop.ts exportForEval` records each file's presence, size, hash and copy result, and writes `source.json` last. **Done 2026-10-09:** `source.json` gains `files` (per file: source, presence, bytes, hash, `copied` when the copy's hash matches) and `complete`; an incomplete export says so on stderr. A failed ledger copy no longer aborts the notes. Test: `stop-gates.test.ts` "the eval export lists each file…" (a ledger note whose file is missing; it failed before). The harvester does not read `complete` yet. | free | No failure was seen; this closes a silent path. |
| S4 | Guard denials. **Cause measured (S0):** all 16 are the model aliasing our own long `node "…/ambicode.mjs" read --task X` to `$R`/`$A`. Give the step a short, literal command form the model has no reason to alias, or let the guard see through a variable assigned in the same command. State that Bash takes no `cwd`/`workdir` field. **Done 2026-10-09 (guard side):** a command that assigns our CLI to a variable and runs it as `$R`/`${R}` is denied with "write the plugin's command out in full…" instead of the generic ask. The eval shell is zsh, which does not split `$R`, so seeing through the alias would only trade the denial for "command not found". After the 8 denials in 06 the model wrote the command out in 4 and fell back to grep in 4. Test: `guard.test.ts` "refuses the plugin's own command run through a variable…". Guard bundle 68,800 → 69,568 B (cap 71,680). Not done: the step wording (no aliasing, no `cwd` field); 06 had 0 `cwd`/`workdir` errors. Not done: a short `ambicode` command. CC 2.1.295 puts a plugin's `bin/` on the Bash PATH, so `ambicode read …` could replace the long `{cli}`, but the allowed-tools, the hook `if` patterns and the eval call classifiers all key on `ambicode.mjs`. | free | — |
| S5 | Stage-1 gaps. Context: attribute the +2,824 tokens with an isolated `claude -p` probe, the way Probe 1 in `stage1-baseline.md` did (contract, SKILL.md, route step, map). Then cut the largest part. Route-ready: the two shortlist passes take about 2.5 s on average and 5.5 s at p95. Reuse a request-local file catalog and grep results between pass 1 and pass 2 (N7) without changing the ranking, and check that `evals:map-recall` output is byte-identical. **Route-ready done 2026-10-09:** `cachedSearch` (one buildMap's `listFiles`/`grepFiles`, each made once; pass 2 had re-run 11 of 40 greps on fe-vs-5948) and `prefetched` greps, 4 at a time (29 greps: 2.26 s serial, 1.45 s at 4, no gain at 8 or 64). Map wall time, 20 cases, local: BE mean 786 → 409 ms; FE mean 3,752 → 2,425 ms, max 4,941 → 3,558 ms. Every case's terms, ledger entry, candidates and leads are identical; `evals:map-recall --expect` passes with identical output. Tests: `locate.test.ts` "R4 shortlist greps". **Context probe done 2026-10-09** ([analysis/context-probe-2026-10-09.md](../analysis/context-probe-2026-10-09.md), about $1.5). The outliers are the typed skill repeating the ticket. Claude Code appends the arguments to a body that substitutes no placeholder, and `$ARGUMENTS` repeats them. Investigate, plan and task now fill only `$0`, and the fallback names `"<request>"`. be-vs-4606 full: 36,660 → 34,428 first-call tokens (+3,981 → +1,749 over naked); be-vs-5071 32,545 → 32,276. Test: `skill-content.test.ts` "a typed skill carries its arguments once" (fails on the old skills). | probe a few cents; the rest free | Map time is search code, but this threshold is about readiness, not recall, so it stays here. |
| S6 | **Done 2026-10-09: walk 10_2314** (1 run, CC 2.1.292 pinned through PATH, $2.78; skills still had `$ARGUMENTS`). 8/8 routes end with an exit. Plan 2/2 reach `plan-check` and exit; review 2/2 reach `exit:done` (no `config-missing`); task 2/2 end `inconclusive` at `red` (S2d). $R denials 0. Route step ready: localize 2.7 s, plan 1.3 s, task 2.0 s. New findings: (1) a plan whose check fails gets the headless default `Reject`, the route exits `done`, and the model keeps revising outside the route (fe-vs-5164-plan: 2 more plan checks, $0.89); (2) the review cases have no reviewer recording (`replay-miss`: eval-replay/core.json holds 4895, 6086, 6253, 6292 only); (3) plan sessions get no Stop export, since their route ended before Stop; (4) `check` named a null check "configured" (fixed, `check-command.test.ts`). Was: `evals:walk` × 2 runs (8 cases: investigate, task, plan and review). Check every stage-2 row: exits, Stop blocks, model calls, context, route-ready time, the reader root, guard denials. For task: does the route close `exit:done`, and does red/green repeat after a limit entry? It also gives policy bytes for stage 4. | about $4–5 (walks 01 and 05 cost $2.06–2.45 a run) | The observation tier for engine work. `npm run evals:walk -- --runs 2` does not work: the option parser takes the first `--runs`, which is the script's `--runs 1`. Run `npm run evals:select && npm run evals:run -- --tag walk --runs 2 --ablation none --model claude-sonnet-5-5 --max-cost-usd 10 -j 4 --walk`, or add an `evals:walk2` script. |
| S7 | Final gate: investigate `evals:decide` (20 × 3) against the lock, with every stage-2 row re-measured. Close stage 2 on its full thresholds or on its floor. Then stage 3 starts. | about $13 (06 cost $12.87) | Full run, as for every final gate. |

## Notes: improvements to try later

None of these block stage 2. Each names the cheapest place to test it.

| # | Idea | Evidence | Test where | Stage |
|---|---|---|---|---|
| N1 | Pass the ticket text to term ranking as its own source, apart from the eval/host framing, instead of growing `REQUEST_WORDS`. | be-vs-6015 and fe-vs-6292 maps are mostly framing words. The last two words added cost one true file. | `evals:map-recall`, free. The same seam serves task/plan `map(context)`. | 3a |
| N2 | `read path:12` should serve a window around line 12, not line 12 to EOF. | 190 of 269 served headers in 07 covered the whole file. | `read-many.test.ts` plus `replay-read-budgets.mjs`, free | 3b |
| N3 | Read budget of 12 or 16 KB. Test it only together with N2. | At 12 KB the replay serves 26.7% fewer bytes and 28.0% fewer truth-file lines. It does not reach the two worst FE cost cases. | the replay, free; then a plugin decide | 3b |
| N4 | Mark the map's confidence in the payload (specificity, owner evidence). A weak map then says so, and the `scope` gate can fire on a weak map, not only an empty one. | 7 delivered maps have no truth file, yet each still reads as authoritative. | map-recall, plus a route test | 3a/3b |
| N5 | Conditional read wording: batch the leads when the map is credible; do one discovery search first when it is weak. Needs N4 first. | 07: unconditional "read first" raised reading requests 29.4% at equal recall. | plugin decide | 13 |
| N6 | `locate.ts`: keep the full match frequency, or a saturation flag, before breadth weighting. Today the 200-match cap comes first. | Saved maps show `code`, `path` and `dialog` cut at 200. | map-recall, free | 3a |
| N8 | Give the gate a precision check (≥ bare − band). Today the floor checks precision by hand. | be-vs-6140: precision 0.510 at recall 1.0, hidden by saturation. | `eval-gate.test.mjs`, free | 0 |
| N10 | Pin effort, scaffold/config hash and bundle hash in the lock and in result metadata. | Effort is recorded but not checked. | lock test, free | 0 |
| N11 | Use a fixed, declared recall tolerance instead of the bare range. | An unstable treatment can widen its own band. | gate test, free; changes the ruler, so it needs a decision | 0 |
| N12 | **Experiment: tool scoping.** Today Write is not scoped in the plan cases (`allowed_tools: Write`), so a plan run can write any file and only the graders catch it. Bash is guarded only on 5 patterns. Options: (a) drop Write from plan cases, since the body now goes through stdin (S2b); (b) a route-aware guard rule that denies Write/Edit outside `.ambicode/task/` while an investigate, plan or review route is active, released when the route ends; (c) a route step declares `tools:` and the build checks it against the skill's `allowed-tools`; (d) a walk deviation for `No such tool available` errors. Trigger: trim `allowed-tools` only if traces show the model using tools inefficiently. | Write/Edit/Bash calls per run by skill, guard denials, cost per run | free code, then one walk | 0 |

N7 (shortlist cache), N9 (literal commands) and the export manifest note moved into S5, S4 and S3.

## Walk 10_2314 findings, applied 2026-10-09

| # | Finding | Change | Evidence |
|---|---|---|---|
| W1 | A failed plan check withheld Accept. The trusted `plan-accept=Accept` preanswer was declined (`option-not-offered`), the headless default Reject ended the route, and the model kept revising outside it (fe-vs-5164-plan, $0.89). | A user-set headless run offers `Accept, Reject` on every draft, failed or not, and never Revise. Interactive: a failed check offers `Revise, Reject`, so the default leaves the draft. `plan.yaml` `acting: [Accept, Revise]`: a model-typed Revise is declined `acting-needs-human`. **Contract change:** the 06-R1 sha and acting list, and both S5 tests (a flag Revise was `via: model`). A headless run without the Accept preanswer still takes Reject. | `plan-route.test.ts` (2 new tests), `plan.engine.test.ts` S5 |
| W2 | Both review cases hit `replay-miss`. **Cause (corrected after walk 02_0000):** the scaffold's `git add -A` applied the user's global excludes (`~/.gitignore_global`: `.husky`, `.env`, …). The recorder runs as the user and committed 457 files; the sandbox committed 460. The base commits differed, so the snapshot ids did too. The sandbox id was the same in both walks (`a92bdf82…`, `907eb477…`). My first diagnosis, a route ledger changing the id on every run, was wrong for the sandbox; the recordings from it (`d158e0dd…`, `c521f16b…`) never matched and were removed. | `base-scaffold.mjs`: `GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null` and `add -A` with `core.excludesFile=/dev/null`. Kept: init's ignore entries, except the index directory, in `.git/info/exclude` (locally an unignored ledger does change the id: `9b71202a…` vs `7872f3b5…`). 76 scaffolds regenerated. Re-recorded both cases (record_0206, $0.20) into `core.json`. | `base-scaffold.test.mjs`: 2 tests, each failed before its fix. A local scaffold now reproduces both sandbox ids exactly. |
| W3 | Plan sessions had no Stop export. Stop logged `skipped, no route pointer`. Cause: `plan check` ended the route from Bash, where the sandbox sets `TMPDIR=/tmp/claude-502`; hooks run with `/var/folders/…/T`. `ended-route` went where Stop does not look. | Stop falls back to the ledger: the session's latest route, if it exited and no Stop has run since. | `route-hooks.test.ts` "…found in the ledger, once" (failed before). Scan: about 33 ms for 100 tasks / 5 MB. |

Open:
- `core.json` covers 2 of the 16 current review cases. The 4 older recordings (4895, 6086, 6253, 6292) miss on the current cases: 6086 and 6292 now snapshot as `working-efc4678b…` and `working-26ea0f64…`. Recording the other 14 costs about $1.6.
- The split TMPDIR also sends the CLI's `active-route` writes and delivery markers to a directory the hooks never read. The ledger stays the authority, so nothing broke in the walk. Not changed.

### Walk 02_0000 (2026-10-09, 1 run, CC 2.1.292, $2.53 with arm; 10_2314 was $2.78)

- **W1 holds in the route.** Both plans: check failed, trusted Accept, plan promoted, `exit:done`. fe-vs-5164-plan $0.892 → $0.576, 32 → 21 turns. **New: the model still revises after the exit.** `plan check` printed `plan check failed: … 14 bad` together with `The route is complete. Nothing further is required of you.`; the model fixed the anchors and re-ran `plan check` outside the route (1 extra draft each, 35–57 s). Not fixed.
- **W2 failed in this walk** (cause above). Fixed and verified at $0 since; not re-walked.
- **W3 holds.** 8/8 sessions exported, all `complete: true`, both plan sessions included.
- **First-call context** (this vs 10_2314): review 17,665 vs 17,811, investigate 18,917 vs 19,581, plan 20,327 vs 21,819, task 20,288 vs 20,907. The walk tickets are short; the long ones gained most in the probe.
- **Task:** fe-vs-5164 `inconclusive` at red again. be-vs-6140 `exit:human no-red`: two `route next` at red without a red `check`, then the model edited the spec anyway.
- **S2c:** Edit 0.63 calls/run, all in task cases; no Write or Edit in investigate or review.
- The walk command exited 1; the report and harvest completed. `fatal: ambiguous argument 'HEAD'` ×3 again, not investigated.

### W4 and walk 04_0014 (2026-10-09, 1 run, CC 2.1.292, $2.44 with arm)

- **W4, applied before the walk:** `plan check` after the plan route ended is refused (`plan-accepted` / `plan-route-ended`) before anything is saved. When a headless Accept takes a failed draft, the exit text adds "This draft was accepted as it is, check failures included: do not revise it." Test: `plan-integration.test.ts` "after a headless route accepted its draft…" (failed before).
- **W1 confirmed.** Both plans: check failed, Accept, promoted, `exit:done`, no `plan check` after the exit, no refusal needed. fe-vs-5164-plan $0.520 / 18 turns (02_0000: $0.576 / 21; 10_2314: $0.892 / 32). be-vs-6140-plan $0.413 / 28 turns, all before the exit.
- **W2 confirmed.** Both review cases `REPLAYED from a recording`, no `replay-miss`.
- **W3:** 8/8 exported. 2 plan exports read `complete: false`: the promoted `plan-draft_*.md` was missing, because promotion renames it to `plan_*.md`. **Fixed after the walk:** a promoted draft is recorded `error: promoted, promotedTo: <plan>` and counts as complete only when the plan file was copied with the promoted hash. Test: `route-hooks.test.ts` "a draft promoted into the plan…" (failed before).
- First-call context is flat against 02_0000 (review 17,732, investigate 18,920, plan 20,292, task 20,154).
- Task unchanged: fe-vs-5164 `inconclusive` at red; be-vs-6140 `exit:human no-red`, then edits.

### S7 result: investigate decide 05_0035 (2026-10-09, 20 cases × 3, CC 2.1.292, Sonnet 5.5, with arm only)

Gate: **FAIL, 1 of 9 checks (cost 1.1408× against 1.1×)**. Report: `reports/core/2026-10-09/05_0035_localize-ambicode-with-prompt-sonnet-5-5/`.

| Stage-2 row | Threshold | 05_0035 | Result |
|---|---|---|---|
| runs that end with an exit | ≥ 97% | 60/60 `exit:done` | pass |
| `budget` exits | 0 | 0 | pass |
| Stop blocks | 0 unneeded | 0 | pass |
| model calls over bare | ≤ +2 | 8.67 vs 7.82 (+0.85) | pass |
| model calls p95 | ≤ bare p95 + 2 | 18 vs 13 (+5) | **fail** (06: 13.05 vs 12.05) |
| route signatures per case | 1 step sequence | 1 (6 variants differ only in `search > command` entries) | pass |
| task-bound CLI calls read the task's repository | 0 refusals | 0 CLI errors in 60 sessions | pass |
| export manifest | every file listed, written last | 60/60 `complete: true` | pass |
| typed-route activation | counted from the ledger | `route started 60/60` | pass |
| guard denials of the plugin's own commands | 0 | **16 in 16 runs** (06/07: 8 in 7) | **fail** |
| first-call context over bare | ≤ 2,500 | +2,660 (18,677 vs 16,017) | **fail** (by 160) |
| route step ready ≤ 5 s | ≥ 90% | 60/60; median 1.7 s, p95 2.6 s (was 46/60) | pass |

Recall 0.557 vs 0.494 (Δ 0.063, band 0.056), precision 0.696 vs 0.709, F1 0.567 vs 0.530. Cost $0.2504 vs $0.2195 per run.

The denials are all the `$R`/`$A`/`$N` alias of `node …/ambicode.mjs read`. They are refused (S4 works as designed) and the model retries in full. The 16 runs with a denial: $0.28, 9.56 model calls, 1.19 failed calls; the other 44: $0.24, 8.34 calls, 0.07 failed. The plugin has 5 runs with ≥14 model calls (fe-vs-5948 ×2, fe-vs-6141 ×3), two of them with a denial; bare has 2.

## Alias denials: wording, then the guard rewrite (2026-10-09)

- Wording ("typed out in full each time (a variable fails in zsh)") in read.md, 06_1010, be-vs-* investigate ×2: denials in 4 of 20 runs (05_0035: 16 of 60). Reverted.
- Guard rewrite: a variable holding the plugin's CLI is inlined and the call allowed with `updatedInput`; the 4 shapes seen are unit tests. Not yet measured on a model.

## Notation, engine contract and Route line (2026-10-09)

Session contract rewritten as notation legend + route rules (788 → 1,670 B; 03b-C5 cap 1,024 → 1,700). 15 step texts and 6 SKILL.md bodies in the notation (21,663 → 20,397 B). Header gains `Route: x✓ [x] x?`; the route end says `!edit · !CLI route next -> final message`.

Task cases, 2 runs each (08_1105 fe-vs-5164-task, 09_1107 be-vs-6140-task):

| case | $/run | turns | edits after the route ended | exit |
|---|---|---|---|---|
| fe-vs-5164-task | 0.461 (prev 0.430, 0.435) | 20.0 (16, 21) | 0 of 2 | 1 `human (no-red)` |
| be-vs-6140-task | 0.367 (prev 0.338, 0.388) | 18.5 (25, 24) | 0 of 2 | 2 `human (no-red)` |

3 of 4 runs wrote the implementation during red without running `check --phase red`, and the route ended `no-red`.

Investigate sweep: void twice (07_1105, 10_1109). Every run hit the five-hour session limit at its first call (`api_error`, 0 turns); the harness still reported the sweep complete.

### Correction: the three void investigate sweeps were not a rate limit

07_1105, 10_1109 and 11_1119 ended at 0 turns because `skills/investigate/SKILL.md` held "!`.ambicode` file": Claude Code runs "!`cmd`" in a skill body as a shell command, it failed (`command not found: .ambicode`), and the run ended. The `api_error` traces in those folders were stale copies from an earlier session limit. Fixed in the text; a test now rejects "!`" in every SKILL.md.

### Investigate sweep with notation + guard rewrite (12_1120, be-vs-* ×2, $4.63)

| metric | 12_1120 | 06_1010 (before) | bare |
|---|---|---|---|
| recall | 0.759 | 0.768 | 0.742 |
| precision | 0.732 | 0.718 | 0.800 |
| $/run | 0.232 | 0.216 | 0.198 |
| turns | 10.7 | 9.9 | 8.5 |
| model calls | 7.3 | 7.8 | 6.7 |
| failed tool calls | 0.10 | 0.20 | 0.03 |
| first-call context | 19,213 | 18,917 | 16,044 |

Alias attempts: 0 of 20 runs (denials or rewrites). Which of the changes removed them is not separable from this run.

### Red re-print states the consequence (13_1235 fe-vs-5164-task, 14_1237 be-vs-6140-task, 2 runs each, $1.75)

All 4 runs ended `human (no-red)` (before: 3 of 4); 0 edits after the end. The re-print carried the new line in the traces I read. The line does not change the outcome, and the outcome is not a model mistake: in the sandbox the red check cannot run (no `node_modules`; the `unit` check has no command in `.ambicode/config.yaml`), and the models said so in their final messages. The earlier reading "the model skipped the red check" was wrong for these cases; `no-red` is the honest end of a case whose check cannot run. Whether the route should end there, or offer a `blocked` exit with the reason, is a task-stage decision.

## Stage 2 close: 6-case gate 26_1600 (2026-10-09)

Cases picked by between-iteration recall spread over within-iteration noise on 06, 07, 05 and the notation run: fe-vs-6141, fe-vs-6406, be-vs-6015, be-vs-5941, be-vs-5973, fe-vs-3571. Six sweeps (20_1553 to 25_1558, $4.52) merged into `26_1600_six-ambicode-with-prompt-sonnet-5-5`; session files must be merged too, or route-ready reads from the harness start.

Gate: FAIL 1 of 9, cost 1.1845×. Recall 0.503 vs 0.436 (band 0.086), precision 0.806 vs 0.759, model calls p95 17 vs 16, context +2,897, failed calls 0.00. Same cases in 05_0035: 0.489, 1.20×; in 07_1933: 0.510, 1.26×. The user closed stage 2 with cost, route-ready (12/18) and the untested task walk as debt (TRAINING-PLAN §5).


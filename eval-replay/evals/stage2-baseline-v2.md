# Stage 2 — engine, reopened: first measurement on the 20-case set (2026-10-08)

Sources:
- Plugin runs `06_1853` (the reference) and `07_1933` (stronger read wording, reverted). Both are 20 investigate cases × 3, Sonnet 5.5, effort low.
- The bare model comes from the locked baseline `30_2248` (20 × 3).
- I re-ran the reports with the S1 fixes, so the bare traces are now read (before, first-call context was "unmeasured").
- Free, no new runs.

Method:
- Per-run rows come from `report.json`: `route`, `routeReadyS`, `mapMs`, `modelCalls`, `firstContext`, `injected`.
- Stop blocks come from the exported ledgers (`limit which:stop-block`), with the reason from the session trace.
- Tool errors come from the session traces: each `is_error` tool result, matched to its tool call.
- The scripts are in the session scratchpad: `s2.mjs` and `errs.mjs`.

## Thresholds

| Threshold | Pass | 06_1853 | 07_1933 | State |
|---|---|---|---|---|
| runs that end with an exit entry | ≥ 97% | 60/60 `exit:done`, one route each | 60/60 | **pass** |
| `budget` exits | 0 | 0 | 0 | **pass** |
| Stop blocks the model did not need | 0 | 1 block, needed | 1 block, needed | **pass** (see below) |
| model calls over bare, mean | ≤ +2 | −0.14 (7.68 vs 7.82) | +0.85 (8.67) | **pass** |
| model calls, p95 | ≤ bare p95 + 2 | 13.05 vs 12.05 (+1.0) | 15.05 (+3.0) | **pass** on 06; 07 fails |
| route signatures per case | 1 step sequence | 1 | 1 | **pass** (see below) |
| task walk closes `exit:done` | yes | not run | — | **open** (S6) |
| task-bound CLI calls read the task's repository | 0 refusals caused by the shell's directory | not counted | the audit counts 41 of 47 | **fail** (S2) |
| eval export records every file | per-file presence, hash and copy result | 120/120 exports complete; copy errors swallowed in code | — | **open** (S3) |
| typed-route activation counted | ledger route starts | `route started 60/60 (ledger), Skill tool 0/60` | 60/60 | **pass** (fixed in S1) |
| guard denials of the plugin's own commands | 0 | 8 in 7 runs | 8 in 8 runs | **fail** (S4) |
| first-call context over bare | ≤ 2,500 tokens | **+2,824** mean; median of case means about +2,517 | +2,977 | **fail** (S5) |
| route step ready ≤ 5 s | ≥ 90% of runs | **46/60 (76.7%)** | 48/60 (80.0%) | **fail** (S5) |

## Exits, Stop blocks, signatures

- **Exits.** Every run has exactly one route and one `exit:done`. The exported ledger, note and hash are complete in 120/120 runs.
- **Stop blocks.** Each run set has one block, and both were citation checks on abbreviated paths. The model fixed them in one extra call (17 s and 14 s). Neither block was unneeded: the cited path did not exist as written.
  ```
  06 e-PgPaym  "rula-reba/{reba,rula}/components/manual-override-wizard/{neck,trunk}/*.component.html:31,40" -> ".component.html does not exist"
  07 e-jupd2D  "lm-lift/.../lm-lift-manual-inputs.component.html:85" and 4 more "..." paths -> 5 problems
  ```
- **Signatures.** 06 has 6 raw signature variants across 12 cases. All of them share one step sequence:
  ```
  route > template:skipped > fetch:skipped > envelope > map > policy > policy > ground:completed > scope:skipped > read:delivered > … > note > exit:done
  ```
  The variants differ only in:
  - `search`/`command` entries: `read` calls with `--task`.
  - A trailing `session`: SessionEnd writes after the Stop export, in 37 + 7 + 5 runs.
  - The one `limit > turn > hook` repeat (the Stop block).

  The step order is stable. The report's signature should drop the `session` tail and the CLI-call entries before comparing; that is a report change and not a stage gate.

## Model calls

```
              mean   p95    max
bare          7.82   12.05  16
06 plugin     7.68   13.05  14
07 plugin     8.67   15.05  20
```
06 holds both rows. The 07 tail is the reverted wording (fe-vs-6141 17.3 vs 13.7 bare; fe-vs-5948 14.7 vs 11.0).

## Guard denials (S4)

All 8 + 8 denials are the model aliasing our own command to shorten it. The step text gives `{cli}` as `node "/Users/…/ambicode/scripts/ambicode.mjs"`. The model writes `R='node …/ambicode.mjs read --task X'; $R paths…`. The guard cannot see what `$R` runs, so it asks, and headless means denied. Every one is a `read` call.
```
06: 8 denials in 7 runs, every one `$R`/`$A` = ambicode.mjs [read]
07: 8 denials in 8 runs, the same; plus 2 InputValidationError (`workdir`, `cwd` passed to Bash)
```
The other tool errors are ordinary model shell errors: a zsh glob `--include=*.ts` with no match (exit 1), a `cd` into a wrong directory, and `wc` on a directory. They are not engine failures.

## First-call context (S5)

The first-request delta over bare is +2,824 tokens (06), +2,977 (07).

Injected bytes, means per run, plugin vs bare:
```
SessionStart hook                 787  | -
UserPromptSubmit hook (route step) 2,392 | -      (equals the step payload: 1,882–2,646 B per case)
command_permissions                96  | -
sandbox_instructions             8,605 | 7,725  (+880: the plugin's paths)
skill_listing                    6,293 | 6,040  (+253)
session_context                    646 | 386    (+260)
prompt_snapshot               35,390 | 35,310  (+80: the typed command prefix)
```
- **Bytes vs tokens:** these add up to about 4.7 KB. The 2,824 tokens would need about 1.7 B/token, so either the tokenizer is denser on this text, or part of the delta is not in these attachments. Unattributed until the S5 probe.
- **Outlier cases:** three cases sit near +4,000 to +4,300. Their step payload is no larger (1,882–2,484 B), so the payload is not the cause:
  ```
  be-vs-4606  +4,328   step 2,484 B
  be-vs-4835  +4,064   step 1,882 B
  fe-vs-6141  +4,329   step 2,435 B
  ```
  The other 17 cases sit between +2,178 and +3,317. A probe should check those three first.

## Route ready (S5)

Over the 20 cases × 3 runs, route ready is 3.13 s mean, p50 2.41 s and p90 6.28 s. 46/60 runs are under 5 s. The map is almost all of it: map time averages 2,508 ms (p95 5,479 ms), and route ready minus map time averages 0.62 s.

The split is by project, not by case:
```
BE cases (10)  ready 1.1–2.1 s, map 664–1,492 ms   -> every run under 5 s
FE cases (10)  ready 2.8–6.8 s, map 2,830–5,291 ms -> 14 of 30 runs over 5 s
```
- **What to fix:** the FE repository makes the two shortlist passes slow. That points at file-catalog and grep cost on a larger tree, and a cache that both passes share is the lever.
- **One map entry:** in COMBO-01 (06), one map took 3,219 + 2,219 ms in its shortlist passes.

## What changed in the ruler (S1, same day)

- **(a) Bare traces:** the report reads every locked source's traces, so the bare arm is traced (60/60) and first-call context is measured: `context +2824` instead of `context-unmeasured`.
- **(b) Activation:** the gate prints `route started N/N (ledger), Skill tool M/N` instead of `skill fired`.
- **(c) Root-file truth:** a truth list with a root file (`package.json`) is no longer dropped. The 06 report now shows `map-empty` in 21 runs / 7 cases (was 18 / 6), matching the audit.
- **(d) Previous runs:** previous-run findings compare only cases and kinds both runs scored, and only runs with the same model and served prompt. The "0.529 vs 0.469 against walk 05" improvement claim is gone.

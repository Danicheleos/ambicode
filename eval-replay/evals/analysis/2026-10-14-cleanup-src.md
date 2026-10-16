# src cleanup audit (2026-10-14)

Scope: `git diff 5d55260 -- src` (109 files, +3098/-1051). `git status --short src` is empty: no uncommitted or untracked src changes. Read-only; no build, no code edited. Line deltas are src only (tests excluded) unless noted.

Method: exports of every changed non-test file counted for importers outside the file and outside tests (script, not hand-picked); handler names in `src/types/harness.ts` matched against `routes/**`; ledger fields traced writer to reader; comments in added lines scanned for length >3 and for eval/run ids.

Dead-code scan result (CONFIRMED negative): every handler in `HANDLER_NAMES` is referenced by a route yaml (0 unused). No navigator/shortlist/learn/keywords leftovers from the rolled-back navigator in the diff: `shortlist` is the pre-existing search layer (`src/types/modules/search.ts:2`, `map.ts:86`), `confidence` is the pre-existing finding field (`primitives.ts:6`), `KEYWORDS` in `command-parser.ts:219` is shell keywords. The only navigator-adjacent text is the `context write` hint in `task.iterations` (item 9).

## CONFIRMED

### C1. `rules` stale-key shim in config load (delete, -13 lines)
`src/modules/config/load.ts:41-43` (+`projectsOf` at 52-55) throws a custom error when a project has `rules`. It sits after the `schemaVersion` check (`load.ts:38-40`), and `schemaVersion` went 4 to 5 in the same change (`types/modules/config.ts`) with the message "run /ambicode:init again". A v4 config never reaches the shim; only a hand-written v5 config with a removed key does, and the strict schema already rejects it with "unrecognized key". Cause: migration comfort, no trace. Recommendation: delete both blocks and the matching test in `config.test.ts` (~19 test lines).

### C2. Per-rule `appliesTo` (delete, -4 src, ~-25 test/doc lines)
`types/modules/policy.ts:38-40` (`appliesTo: Globs.optional()`), `packs/resolve.ts:62`, `authoring/drafts.ts:77` (union of rule globs). Shipped policies using it: 0 (`grep -rnE "^\s+appliesTo" policies` is 0 lines; pack-level `appliesTo` only). Per-rule `activities` IS used (`policies/*` carry 40 rule-level `activities` lines), so keep that. Cause given in status: "rules filtered by activity and appliesTo" (phase 2); analysis `2026-10-13-review-subtle-regression.md:58` even says per-rule triggers are not language-agnostic. No pack needs it. Recommendation: remove the per-rule field, keep the pack-level one; also fix `docs/policy-authoring.md:86-93`.

### C3. `stop-check.md` is still written although the block now carries the same text (delete, -2 src, -1 field)
`harness/engine/stop.ts:120` writes `dir.stopCheck`; the reason on line 122 now contains the problems and the generated block ("23 of 397 runs spent an extra Read on stop-check.md", comment at 121). Readers of the file in src: 0 (`grep stopCheck`: `task-dir.ts:28`, `types/modules/evidence.ts:51`, the writer, and two tests). Docs still describe it (`docs/compatibility.md:157`, `skills/review/references/outcomes.md:159`). Recommendation: drop the write, `stopCheck` in `TaskDir`/`task-dir.ts`, the `mkdirp` before it if nothing else needs it, and the two doc lines. Risk: low; the test at `stop-check.test.ts:109` reads the file and must change.

### C4. `format` literal and the "runnable" filter repeated 5 times (merge, -8 lines)
`entry.key !== 'format'` / `FORMAT`: `skills/review/checks.ts:11,23` (own `const FORMAT`), `skills/task/handlers.ts:57` and `:67` (bare literals), `modules/checks/run/format.ts:14` (`FORMAT_CHECK`). The same `checkKeys(project).filter(command && key !== format)` shape is built three times. Recommendation: one exported `runnableKeys(project)` (or a `format` flag on `checkKeys`) in `check-command.ts` next to `checkKeys`; one constant.

### C5. Two parsers of the baseline entry (merge, -5 lines)
`skills/common.ts:82-85` `baselineIn(chain)` and `modules/checks/run/format.ts:15-21` `baselineOf(deps,task,chainIds)` build the same `{head, dirty}` from the same entry with the same casts. `baselineOf` also lives in `format.ts` yet is imported by `bundle.ts:10` and `skills/review/handlers.ts:12` (a module that is about formatting is the baseline's owner). Recommendation: `baselineOf` = filter entries, then call one shared builder; move it out of `format.ts`.

### C6. "Newest review entry per reviewId" implemented twice (merge, -4 lines)
`modules/review/answer/captured.ts:9-13` (`pendingReview`, a Map keyed by reviewId) and `modules/evidence/report/report.ts:52-53` (`latest`, filter with `slice().some`). Same rule, one is O(n^2). Recommendation: export the Map-based "latest per review" from `captured.ts` (or `ledger-chain`) and use it in `report.ts`.

### C7. `pinReview` wrapper has one caller (inline, -5 lines)
`modules/review/bundle/bundle.ts:233-235` is `pinAssembled(assembleBundle(...))`; sole importer `cli/commands/review/review.ts:33`. The route handler already calls the two functions directly (`skills/review/handlers.ts:118`). The `append?` option on `pinReview`/`pinAssembled`/`writeBundleArtifacts` exists only for the route handler: that is the one real second caller, keep it. Also `envelopeRequirements` (`bundle.ts:213-222`) computes `head` only to null-check it (dead condition) and re-filters the chain the caller already has. Recommendation: inline `pinReview`; drop `head` (-3). Also `pinAssembled` sets `statusReason = '... then \`review record\`'` (`bundle.ts:~247`), now wrong because the hook records; reword.

### C8. Exports used nowhere else (drop `export`, 0 lines, tidy)
No importer outside own file and tests: `CALLERS_MAX_BYTES`, `CALLERS_MAX_NAMES`, `nearestNames`, `renderCallers` (`callers.ts`, tests only); `STAGE_LIMITS` (`stage.ts:11`, tests only); `renderRule`, `renderRuleGroups` (`stage.ts`, used only inside); `AppendEntry`, `BaselineScope`, `PinnedReview` (`bundle.ts`); `ChangedFile`, `ChangedName` (`callers.ts`); `renderReview` (`cli/.../review.ts`). Low value, zero risk; do alongside other edits.

### C9. Stale `format` leftovers after the `format` CLI command was deleted
`platform/ledger/kinds.ts:73` `via: z.literal('model')` on `format` entries: written (`format.ts:40`) with a constant, read nowhere; formatting is now a code step, so "via model" is false. `skills/review/references/outcomes.md:26` still says "`check --file` or `format`" (a command that no longer exists). `types/harness.ts` `Cause` still lists `'check'`/`'review record'`, fine. Recommendation: drop `via` from the schema and from the 4 append sites (-4), fix the doc line. Risk: existing ledgers carry `via`; the schema is z.object so extra keys parse unless strict; verify with `kinds.test.ts:50` first.

### C10. Comments violating the rule (shorten to <=3 lines, strip eval/run/task ids)
Eval or run ids in comments (the user rule says none): `execute.ts:201` ("eval ledgers"), `execute.ts:210` ("eval traces"), `stop.ts:34-38` ("39 of 102 task runs ... 132 final messages"), `stop.ts:121` ("23 of 397 runs"), `guard-core.ts:72` ("14 of 14 audited"), `rules/output.ts:1` ("task-multi failed 2 of 3 runs"), `report.ts:32,52,82,115` ("task-multi-3", "task-multi-2, 2026-10-13", "task-multi 3/3"), `common.ts:141` ("0 hits in 87 of 95 task runs"), `review/checks.ts:13-17` ("10 calls and ~34 s ... 86 of 107 runs"), `findings/validate.ts` header ("2 of 23 review-subtle runs", "eval C3"), `bundle.ts` pinAssembled ("76 ms ... 3 times"), `architecture.test.ts` cap line (history). Over 3 lines: `stop.ts:34-38` (5), `stop.ts:63-66` (4), `review-record.ts:22-26` (5), `subagent-stop.ts:11-15` (5), `packs/builtin.ts:13-16` (4), `packs/select.ts:21-25` (5), `packs/validate.ts:140-143` (4), `types/modules/policy.ts:61-64` (4), `review/checks.ts:13-17` (5). Note this conflicts with the repo CLAUDE.md ("comments record why, with the evidence") but matches the memory rule `minimal-code-comments`; I followed the rule you gave in the task. About 19 blocks, net -30 lines.

## SUSPECTED (needs a decision or a measurement)

### S1. Eval-cwd workarounds: `callerCwd`, `loadFor`, `repositoryFile` (simplify or delete, about -30 lines, medium risk)
Cause, from `analysis/2026-10-13-s1-reports.md:69,83`: "model cwd is the repo's parent" in all 6 task-fix runs; "Evals run with cwd = repo's parent; same failure in real use from any cwd above the repo". So the evidence is eval-only; the real-use claim is unmeasured. Code: `Runtime.callerCwd` (`types/composition.ts:16`, `composition/root.ts:16,33`, `cli/main.ts:99`), `repositoryFile` (`check-command.ts:~132-139`, 9 lines, tries the path from the caller's cwd, else assumes repository-relative), `loadFor`/`load(repositoryRoot)` in `hook/events/run-hook.ts:25-40` (re-creates the runtime per hook from the found repo). The only reader of `callerCwd` is `check-command.ts:135`. The hook half is defensible for monorepo-parent sessions and `findSessionRepository` already exists; the `callerCwd` half is a path-guessing heuristic (exists-from-caller vs repo-relative) that exists to forgive a wrong `--file` base. Recommendation: keep `loadFor` only if a real-use trace shows a session started above the repo; otherwise delete `callerCwd`+`repositoryFile` and let a wrong path fail with the existing "outside the repository" error. Unmeasured: no trace of real use.

### S2. `| head` deny with a `node $S` branch (simplify, -6 lines)
`hook/guard/rules/output.ts` (10 lines) + `guard-core.ts:66,72` + `command-parser.ts` `piped` field (about 12 lines) + 733 B of the guard cap (`architecture.test.ts` 24340 to 25073: a raised limit, stated in the comment). Cause: task-multi failed 2 of 3 runs on `| head` (output.ts:1). The `script[0] === '$'` branch with a built RegExp over `command` handles the model assigning `S=.../ambicode.mjs` first, a shell habit seen in the eval sandbox; the literal `ambicode.mjs | head` case is the general one. Recommendation: keep the literal case, drop the `$S` branch and its regexp (about -3 lines, and its test); mention in the next cap comment. Related churn: `Set.has` to `/^(?:...)$/.test` rewrites in `guard-core.ts:18,30`, `repository.ts:9-12,22,27,32`, `command-parser.ts:219-220,271-272`: no behavior change; presumably to claw back guard bytes. Unmeasured (cannot build here); if the bundle fits without them, revert.

### S3. Three routes to the same reviewer answer (merge, about -25 lines, medium risk)
`hook/events/subagent-stop.ts` (28 lines) writes `reviewer-answer.txt`; `review-record.ts:22-26` `answerText(input)` reads the same text from `tool_response` as `fallback`; `cli review record` reads stdin as a third fallback; `readAnswer` in `record-answer.ts` picks between them. SubagentStop exists for the `async_launched` case (comment `review-record.ts`). Check before cutting: how often is the review subagent launched in the background in real or eval traces. If 0, the capture file, `REVIEWER_ANSWER_FILE`, the `remove` in `pinAssembled`, and the SubagentStop case in `run-hook.ts:90-92` go. If >0, keep. No number found in analyses.

### S4. `contextOf` second render when the report exceeds `HOOK_LIMIT` (`review-record.ts:13-19`)
A guard with a hypothetical trigger: no analysis cites a report over the cap. Recommendation: measure report sizes in `evals/**/reviewer*` traces; if all under `HOOK_LIMIT`, delete (-5 lines).

### S5. Migration scaffolding for old installs (about -45 lines, plus tests, no observed cause)
`config packs`: `listedCopy` (`cli/commands/config/packs.ts:25-34`, "a copy from an earlier layout") and the `kept, not listed` branch; `packs/validate.ts:141-160` `validatePackSet(..., builtinIds)` and `load.ts` `builtinFiles` plumbing ("a `replaces` naming a built-in this release lacks"); `docs/rule-migration.md` pointers in two messages (`load.ts:~35`, `validate.ts`). Cause: renaming built-in packs (policies normalized in 001b7ba). Valid only if there are installed users with old copies; there is no trace of one. Recommendation: confirm there are no installs outside this repo, then delete.

### S6. Ecosystem keys in pack selection
`policies/express/*`, `policies/angular/*` carry `detect: [{file: package.json, contains: '"express"'}]` and `unless: [...'@angular/ssr']`. The code (`select.ts`) is generic, the ecosystem knowledge is in policy data, which is what packs are; but rule "profile, not ecosystem" says facts come from the measured profile. Not code to delete; flag as a rule question: `detect`/`unless` markers are an ecosystem table by another name (8 of 15 packs). `select.ts` (54 lines) + `config packs` (95 lines) exist only to evaluate them. Decision for you.

### S7. Duplicated pack reads in `config packs`
`copyBuiltin` (`packs.ts:40`) calls `listBuiltinPackFiles` once per enabled pack after `selectPacks` already listed and parsed them all; each pack is read 3 times (select, copy, `PolicyPack.parse`). Performance irrelevant at this scale; simplify only if the file is touched: have `selectPacks` return the file path and parsed pack (-6 lines).

### S8. `stop.ts` re-derives the current step
`saveAnswer` (`stop.ts:66-73`) reads the ledger, finds the route head, folds to get `position`; the engine already has this view when it runs `advance`. Move the `answersAsNote` decision into `engine.answerNote` (return null when not applicable) and drop `foldRoute`/`buildChain`/`readLedger` imports from stop.ts (-8 lines). Medium risk (hook path); cause for the feature itself is measured (about 700 output tokens, 4 s/run) so keep the feature.

### S9. `task.iterations` hint text
`skills/task/handlers.ts:~102-107`: a code handler emitting a fixed English paragraph with a command line and "Learned how to navigate or write code here? Add it with `context write`". A handler whose only job is a conditional string; it could be a `when:`-gated md step payload (`routes/task/write.md`) with no code. `harness/engine/execute.ts:318` adds a payload key for it. Net about -12 src lines if the route language can express "iterations > 1" (check `routes/README.md`; if not, keep). The `context write` line is the one place navigator-style "learn" wording survives; it was not shown to have a measured cause.

## Not found (checked, clean)
- Handlers without route use: 0. Ledger kinds: `limit.phase`, `limit.key/files` are written (`check-command.ts`) and read (`fold.ts:67`, `report.ts` `proven`). `review.reviewerRan/stage` read in `captured.ts`/`report.ts`.
- Flags no caller passes: `raise` on `authorizeKey`/`runCheckOnly` has 2 callers passing `false` (`format.ts:55`, `review/checks.ts`), 1 default; needed. `append?` see C7.
- Language hardcoding in new src: none (`callers.ts` uses `harvest`/`refs`, language-agnostic per its analysis; `select.ts` reads markers from yaml).

## Ranked by lines x safety

| # | item | status | src lines | risk |
|---|---|---|---|---|
| 1 | C10 comment cuts | confirmed | -30 | none |
| 2 | S5 migration scaffolding | suspected | -45 | low if no installs |
| 3 | S1 callerCwd/repositoryFile (and maybe loadFor) | suspected | -30 | medium |
| 4 | S3 reviewer-answer capture | suspected | -25 | medium |
| 5 | C1 `rules` shim | confirmed | -13 | none |
| 6 | C4+C5+C6+C7 merges | confirmed | -22 | low |
| 7 | S9 task.iterations | suspected | -12 | low |
| 8 | C2 per-rule appliesTo | confirmed | -4 (+25 test/doc) | none |
| 9 | C3 stop-check.md | confirmed | -4 (+2 doc) | low |
| 10 | S2 `$S` branch | suspected | -6 | low |
| 11 | S4, S7, S8, C9, C8 | mixed | -35 | low |

Total if all taken: about -230 src lines of +3098 added.

Not done: no build/typecheck/test run (paid evals running; the guard byte cap for S2 cannot be measured without building); real-use frequency of S1/S3/S4 not measurable from the analyses.

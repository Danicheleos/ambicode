# src findings (recorded, not applied)

Three read-only audits (Sonnet, low effort), run on 2026-10-06 while the peer session was restructuring `src/`.
File:line references are from the **pre-restructure layout** (`src/route`, `src/task`, `src/review`, `src/workers`, …);
resolve them by symbol in the new layout. None of these change executable behavior unless noted.

## Duplicated logic

| # | What | Where (old layout) | Suggested fix |
|---|---|---|---|
| D1 | `messageOf` (`error instanceof Error ? error.message : String(error)`) | 4 definitions: `review/claude-reviewer.ts:411`, `page/takeover.ts:122`, `ports/node-process-runner.ts:250`, `page/cleanup.ts:110` (named `describe`); inlined ~20 more times across 21 files | one helper in `util/errors.ts` |
| D2 | Claude argv building | `workers/process-runner.ts:53-62` vs `review/claude-reviewer.ts` `argvFor` (~207-235) | reviewer passes `tools`/`jsonSchema` to the runner (the 17-workers design's "generalized into the process runner") |
| D3 | Process failure classification | `process-runner.ts:68-73` computes `reason`; `claude-reviewer.ts:253-292` re-derives it; `assertIsolationAvailable` (156-175) a third time | use the runner's `reason` |
| D4 | Process-outcome boilerplate (spawn-failed → timed-out → truncated) | `git/git.ts:68-82`, `providers/gitlab/api.ts:81-94`, `page/open-browser.ts:37-40`, `checks/remote.ts:132-138`, `checks/run.ts:300-355` | `describeOutcome(outcome)` in `ports/process.ts` (low priority) |
| D5 | Unique timestamped artifact loop | `workers/plan-check.ts:152-156`, `workers/worker-run.ts:97-101`, `task/notes.ts:105-117` (only notes has a collision bound) | `writeUniqueArtifact(fs, dir, stem, text)` |
| D6 | `hash12` | `route/gates.ts:89`, `task/notes.ts:60`; inline in `requirements/capture-files.ts:7,42` | `util/hash.ts` beside `contentHash` |
| D7 | `OWNING_SKILLS = new Set(['plan'])` | `route/ownership.ts:5`, `route/context.ts:50`, `route/engine.ts:116` | keep in import-free `ownership.ts`, import elsewhere; also fixes its `Set` vs `ReadonlySet` typing |
| D8 | `toPosix` inline (`.split(path.sep).join('/')`) | `checks/adapters.ts:92`, `workers/plan-check.ts:156`, `workers/worker-run.ts:101`, `ports/filesystem.ts:106`, `task/notes.ts:61,150` | `util/glob.ts:15` `toPosix` |
| D9 | `isInside` inline (`relative(...).startsWith('..')`) | `checks/adapters.ts:91`, `checks/select.ts:382`, `code-intelligence/relates.ts:29`, `hook/events/run-hook.ts:227`, `hook/events/stop-check.ts:96,109`, `policy/drafts.ts:88` | `util/paths.ts:21` `isInside`. **Behavior note:** inline form rejects a file named `..foo` |
| D10 | `NEED_COMMANDS` table vs `onNeedCommand` registry | `route/engine.ts:124` (fallback at :254) vs `route/gates.ts:187-189` (only registrant `review/route-handlers.ts:116`) | drop the table or fold into the registry |
| D11 | `POINTER_LIMIT` | `hook/guard/guard-state.ts:13`, `route/active-route.ts:12` | guard copy is deliberate (import-free bundle): pin with an equality test |
| D12 | `TRANSCRIPT_TAIL` vs `TRANSCRIPT_TAIL_BYTES` | `hook/guard/guard-state.ts:~19`, `hook/events/stop-check.ts:22` | one name, one literal style |
| D13 | Size literals (4 MiB, 8 MiB, 1 MiB) under different names | `claude-reviewer.ts:152,160`, `testing/temp-repo.ts:39`, `codeindex.ts:36`, `config/defaults.ts:67,73`, `git/git.ts:17`, `gitlab/api.ts:6`, `worker-run.ts:15` | name once if desired |
| D14 | Two `Chain` interfaces | `route/ownership.ts:12`, `route/fold.ts:~10` | `Pick` the exported one if import-free allows |
| D15 | `sessionUnbound` twice, different signatures | `route/session.ts:77`, `task/notes.ts:68` | reuse if possible |
| D16 | `isObject` | `modules/config/detect.ts:425`, `modules/requirements/capture.ts:31` | shared guard |

## Aliases and wrong dependency direction

- `claude-reviewer.ts:75` `REVIEWER_ENV_ALLOWLIST = WORKER_ENV_ALLOWLIST`, `:77` re-export of
  `STRUCTURED_OUTPUT_ATTEMPTS`, `:293-295` `reviewerEnvironment()` → `defaultWorkerEnvironment()`: test-only
  aliases. Delete and point the tests at `process-runner.ts`.
- `workers/process-runner.test.ts:4` imports from `review/` while `review/claude-reviewer.ts` imports from
  `workers/`: a test-level cycle.
- `localTimestamp` (`review/review-name.ts:25`) is used by `workers/plan-check`, `workers/worker-run`,
  `task/notes`, `config/init-route`, `checks/remote`, `checks/run` → move to `util/`.
- `markOwned` / `OWNERSHIP_MARKER` (`page/cleanup.ts`) imported by `review/claude-reviewer.ts`,
  `snapshot/snapshot.ts`, `cli/commands/view.ts` → move to `ports/` or `util/`.
- `route/harness.ts` (`harnessOf`, `ownerOfHarness`) is a ledger helper used by hooks → `task/` or a hook-shared
  module (it is guard-bundled; keep it import-free).

## Misplaced test data

- `route/fixtures/review-requirements.yaml` — only consumer `requirements/session-fixture.ts:14`
  (`FIXTURE_ROUTE`); move both to `src/testing/`.
- `requirements/session-fixture.ts` itself is test support → `src/testing/`.
- `task/navigation-line.ts` (presentation of `search` entries) → beside `task/report.ts`, after checking callers.

## Dead or over-exported code

- Zero-reference exports: `INDEX_DRIFT_FILES`, `CONFIG_DIR`, `PROJECT_POLICIES_DIR`, `SchemaVersionProbe`,
  `GitLabCollectionSchema`, `PUBLICATION_RUN_SCHEMA_VERSION`, `bindMarker`, `parseStartTokens`, `reviseCount`,
  `objectProducer`.
- Unused barrels: `contracts/index.ts`, `hook/index.ts`.
- ~290 exports used only inside their own file; a verified sample: `describeMutations`, `findingLine`,
  `FORMAT_COMMAND`, `MAX_WORKSPACE_BYTES`/`ENTRIES`, `MAX_REPORTED_MUTATIONS`, `readOwnership`,
  `controlFilePath`, `requestTakeover`, `LINK_TOKEN`, `MAX_BODY_BYTES`, `MAX_FIELD_BYTES`, `SELECT_PREFIX`,
  `BODY_PREFIX`, `GLAB_TIMEOUT_MS`, `GLAB_MAX_OUTPUT_BYTES`, `assessCoverage`, `sameSha`, `RESULT_FILE`,
  `POSITIONS_FILE`, `PUBLICATION_FILE`, `preexistingOmission`, `SNAPSHOT_PREFIX`, `classifyBytes`, `checkDraft`,
  `LAST_ROUND`, `loadWorkerDefinition`, `MAX_ARTIFACT_BYTES`, option interfaces (`GitOptions`, `SweepOptions`,
  `PageServerOptions`, …). Dropping `export` is safe for these.
- `WorkerProcessResult.argv` is returned on every path but read by nobody; becomes live if D2/D3 are done.
- The exhaustive dead-export scan timed out in one audit; rerun it on the new layout.

## Naming

- `KINDS` in `task/kinds.ts:3` (ledger kinds) vs `task/notes.ts:15` (note-kind table) → rename the file-local
  one `NOTE_KINDS`.
- `shown` (`hook/guard/guard-core.ts:50` truncation vs `task/notes.ts:62` path join) and `describe` (two
  meanings) collide by name only.
- File naming mixes `ledger-lock.ts`/`task-dir.ts` with `kinds.ts`/`slug.ts`; test suffixes mix
  `.route.test`, `.limits.test`, `.diagnostics.test`.
- Duplicate type/const names (`OwnershipMarker`, `GitLabNote`, `PublicationLease`, `ReviewerRecordings`) vs the
  `…Schema` suffix used elsewhere.

## Confirm, do not change

- `task/kinds.ts:10-11` accepts legacy `L<n>` ledger ids; no producer remains. File-format compatibility — keep
  unless the user drops it.
- `task/notes.ts:26` legacy `plan` notes stay readable; move the comment next to the `plan` entry.
- `hook/shell/command-parser.ts` `legacy*` is the bash 3.2 model, not a leftover.
- `review/validate.ts:95` `onInvalid: drop` is intentional and off by default.

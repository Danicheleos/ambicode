# Findings: reported, not fixed

These are left for a decision because each one either changes behavior, renames a public or file-format name, or is wide enough to hide a regression.
`../evals/02-src-findings.md` (Dn numbers) audited the same code. Its items that were applied here are listed at the end.

## Duplication and naming

| # | What | Where | Why not fixed / suggestion |
|---|---|---|---|
| F1 | Two unrelated `ReviewTarget` types | `types/harness.ts` (route-arg interface) and `types/review.ts` (zod schema and type) | One name, two meanings, and both live in the shared types folder. Rename the harness one to `ReviewTargetArgs`; it touches the route flags and the CLI. |
| F2 | Two `KINDS` tables | `modules/evidence/ledger/kinds.ts` (ledger kinds) and `modules/evidence/notes.ts` (note kinds) | They clashed when shared types were pulled into `types/evidence.ts`, so `NoteKind`, `SaveKind` and `SAVE_KINDS` stay in `notes.ts`. Rename the note one to `NOTE_KINDS` (D-naming), then move the three types. |
| F3 | `isObject` twice, with different guards | `config/init/detect.ts` (`Record<string, unknown>`) and `requirements/capture/capture.ts` (`Json`) | One generic guard in `util/` with the caller narrowing. Fixing it changes the inferred types at the call sites. |
| F4 | `type Entry = LedgerEntry` local aliases | `harness/gates/consent.ts`, `harness/gates/answers.ts`, and `harness/types/engine.ts` (exported for `fold.ts` and `run-context.ts`) | They only shorten the name. Using `LedgerEntry` directly removes the alias and one exported type. |
| F5 | Test fixtures export the same short names | `A`, `TASK` (`check-fixture.ts`); `A`, `B`, `TASK` (`plan-fixture.ts`); `A` (`requirements-session.ts`) | `testing/index.ts` can export only one of each. Give them descriptive names (`CHECK_TASK`, `PLAN_TASK`, …). |
| F6 | `messageOf` is still inlined about 20 times | `error instanceof Error ? error.message : String(error)` across about 20 files (D1) | Only the 4 named copies were folded. The inline uses are mechanical but spread wide. |
| F7 | `toPosix` and `isInside` inlined | D8, D9 | **D9 changes behavior**: the inline `relative().startsWith('..')` also rejects a file named `..foo`, so each site needs a check. |
| F8 | Process-outcome handling three times | D2, D3, D4: Claude argv building, the failure `reason`, the spawn-failed/timed-out/truncated cascade | Folding them belongs in the process runner (17 §1), as one change with its own tests. |
| F9 | Unique timestamped artifact loop | D5: `plan-check.ts`, `worker-run.ts`, `notes.ts`; only `notes` bounds collisions | `writeUniqueArtifact(fs, dir, stem, text)`. |
| F10 | `NEED_COMMANDS` table vs the `onNeedCommand` registry | D10: `harness/engine/engine.ts` and `harness/gates/gates.ts` | Two ways to express one thing; drop the table. It is in engine dispatch, so it was left alone. |
| F11 | `POINTER_LIMIT` and `TRANSCRIPT_TAIL*` copies | D11, D12: `hook/guard/guard-state.ts` against the harness and stop-check copies | The guard copies are deliberate, because the bundle has to stay import-free. Add an equality test instead of merging them. |
| F12 | `sessionUnbound` twice with different signatures | D15: `harness/session/session.ts`, `modules/evidence/notes.ts` | |

## Types placement

- **Kept beside their runtime value:**
  - `TypedEntry` (`z.infer` of `schemas` in `ledger/kinds.ts`)
  - `LayerName`, `MapLayer` and `MapResult` (from `LAYER_NAMES` in `search/text/map.ts`)
  - `NoteKind`, `SaveKind` and `SAVE_KINDS` (F2)

  Moving them would make a `types/` file import an implementation file. To move them, move the schemas or tables as well.
- **`hook/shell/command-parser.ts` keeps its types**, because a test pins the file as import-free for the guard bundle. `hook/index.ts` re-exports them from there.
- **Single-symbol `types/` files** follow the "importers' common level" rule but read as noise. Each holds one constant or interface:
  - `harness/types/definition.ts` (`RAISED_BY`)
  - `hook/types/events.ts` (`MAX_HOOK_INPUT_BYTES`)
  - `modules/evidence/types/ledger.ts` (`LEDGER_FILE`)
  - `modules/search/types/text.ts` (`SCORE_FILENAME`)
  - `modules/requirements/types/capture.ts` (`EXPANSION_FETCH`)
  - `modules/review/types/publication.ts` (`SelectedComment`)
  - `types/skills.ts` (`CHECKS_GATE`)

  Decide whether to fold them into the area's broader `types` file.
- **`src/types/` is large:** 24 files and about 245 cross-area symbols. `types/review.ts` re-exports `ProvenanceEntry`, `RequirementConflict` and `RequirementSource` from `types/requirements.ts`, and those re-exports can go.

## Dead or over-exported code still present

- **Production exports used only by tests:**
  - `registryGate` (`harness/gates/gates.ts`)
  - in `harness/session/session.ts`: `hookBinding`, `environmentSessionSource`, `updatedInputSessionSource`, `associationSessionSource`, `writeAssociation`, `removeAssociation`
  - `buildSnapshot` (`review/snapshot/snapshot.ts`)
  - `hitCount` (`requirements/capture/expansion.ts`)
  - `REGISTERED_HOOK_EVENTS` and `REGISTERED_HOOK_ENTRIES` (`types/hook.ts`)

  These are kept, because the tests exercise them as units. They would be candidates for removal if the tests went through the public path.
- **About 290 exports are used only inside their own file** (D: dead or over-exported). Dropping `export` is safe for them but touches about 100 files, so it was not done in this pass.
- **`WorkerProcessResult.argv`** is returned and never read.

## Possible bugs and over-engineering

- **`smoke:candidate` fails at its `policy` step with `config-missing`.** It fails identically on HEAD before this refactor, so the cause is pre-existing.
- **`harness/engine/engine.ts` runs to about 700 lines** and holds dispatch, delivery, consent and tail logic together. The `NEED_COMMANDS` fallback (F10) and the two `OWNING_SKILLS` checks show the seams to split along.
- **`cli/types/commands.ts` holds about 30 `*_OPTIONS` tables**, one per command and moved out of each command file because `main.ts` imports them all. A per-command `{ options, run, render }` record would remove the table import and the matching switch in `main.ts`.

## Applied from `../evals/02-src-findings.md`

- D1: the 4 named `messageOf` copies.
- D6: `hash12`.
- D7: `OWNING_SKILLS`.
- The aliases section: `REVIEWER_ENV_ALLOWLIST`, the `STRUCTURED_OUTPUT_ATTEMPTS` re-export and `reviewerEnvironment`.
- The zero-reference exports, except `INDEX_DRIFT_FILES`, which `codeindex.ts` does use.
- `contracts/index.ts` is now the documented `types/index.ts`, and `hook/index.ts` is kept as the documented barrel.
- `../evals/01` §3 (`.gitignore`) and §4 (the `replay-reviewer.test.ts` path).

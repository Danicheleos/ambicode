# Significant changes (2026-10-06)

File, type and function moves are not listed here. Everything below changes code, the build or the tests rather than only moving them.

## Build and packaging

1. **Review page templates moved** from the repo-root `templates/` to `src/modules/review/page/templates/`.
   - `tools/build.mjs` clears `scripts/templates/` and copies the templates there.
   - The runtime reads them through the new `pageTemplatesDirectory(pluginRoot)` (`src/util/plugin-root.ts`), which returns `<plugin>/scripts/templates`; it used to read `<plugin>/templates`.
   - `tools/package-candidate.mjs` ships `scripts/templates/*.eta|.css`, because the candidate check forbids `src/` in an install.
   - `src/testing/fixtures/page-harness.ts` reads the source copy.
2. **Root scripts moved to `tools/`:**
   - `build.mjs`
   - `check-line-endings.mjs`
   - `bundle-split`, `hook-artifact` and `prepare-artifact` tests
   - `install-local*`, `package-candidate.mjs`, `smoke-candidate.mjs`

   Their `ROOT` is now the parent directory, and `build.mjs` sets `absWorkingDir`. The `package.json` scripts, `verify.yml` and the docs follow.
3. **`package.json` `"imports"`** adds the `#cli`, `#composition`, `#harness`, `#hook`, `#modules`, `#platform`, `#skills`, `#testing`, `#types` and `#util` aliases. The README explains why tsconfig `paths` were not used.

## Code

4. **Dead code removed.** None of these had any reference in src, evals, tools or fixtures:
   - `CONFIG_DIR` and `PROJECT_POLICIES_DIR` (`types/defaults.ts`)
   - `parseStartTokens` and its `StartFlags` (`harness/definition/flags.ts`)
   - `objectProducer` (`harness/definition/routes.ts`)
   - `reviseCount` (`harness/engine/fold.ts`)
   - `bindMarker` and its `HookBinding` (`harness/gates/consent.ts`)
   - `PUBLICATION_RUN_SCHEMA_VERSION` (`review/publication/publish.ts`)
   - `GitLabCollectionSchema` (`gitlab/provider.ts`)
   - `SchemaVersionProbe` (`types/modules/config.ts`)
5. **Unused imports removed** in 57 files. Most were left behind when types moved out of a file.
6. **Test-only aliases removed** from `review/reviewer/claude-reviewer.ts`:
   - `REVIEWER_ENV_ALLOWLIST`, which equalled `WORKER_ENV_ALLOWLIST`;
   - the re-export of `STRUCTURED_OUTPUT_ATTEMPTS`;
   - `reviewerEnvironment()`, which equalled `defaultWorkerEnvironment()`.

   `reviewer-boundary.test.ts` now imports the originals. One assertion in `process-runner.test.ts` compared the alias to itself, so it was dropped.
7. **Duplicates folded into one definition each:**
   - `messageOf(error)` → `util/errors.ts`. It replaces 4 copies, in `node-process-runner.ts`, `page/takeover.ts`, `reviewer/claude-reviewer.ts` and `page/cleanup.ts` (where it was named `describe`), and about 15 inline `error instanceof Error ? error.message : String(error)` sites.
     `util/errors.ts` itself and the import-light `hook/guard/guard.ts` keep the inline form.
   - `isObject` → `util/guards.ts` (`value is Record<string, unknown>`), replacing the copies in `config/init/detect.ts` and `requirements/capture/capture.ts`.
   - `hash12` → `util/hash.ts`, replacing the copies in `harness/gates/gates.ts` and `evidence/notes.ts`.
   - `OWNING_SKILLS` is now exported once, as a `ReadonlySet`, from the import-free `harness/session/ownership.ts`. `harness/engine/context.ts` and `engine.ts` import it instead of redefining it.
8. **`cli/main.ts`:** `MAX_HOOK_INPUT_BYTES` is now a static import from `types/hook.ts`; before, it was destructured from the lazily imported `run-hook`. `runHook` itself stays lazy.
9. **Tests:**
   - `src/testing/paths.ts` (`REPO_ROOT`, `SRC_ROOT`) replaces the per-file `fileURLToPath(new URL('../../..', import.meta.url))` roots, and the 25 `const ROOT = REPO_ROOT` aliases are gone.
   - `replay-reviewer.test.ts` uses the new recordings path in its "must be absolute" example.
10. **Types extraction.** 228 symbols moved into `types/` folders:
    - 172 by the plan;
    - 56 pulled in as local dependencies, or lifted so that a `types/` file never imports a deeper `types/` file.

    The types now import only same-level or higher `types/` folders. That removed a runtime import cycle (`RequirementEvidence` ↔ `RequirementSource`) which a first, naive placement had caused.
    Moved declarations that were file-local became `export`; their text is otherwise unchanged.
11. **Header-comment fix:** the comment "Imports sit below the types so the type-only importers above stay light" in `harness/engine/context.ts` was removed, because the types it described are gone from that file.
12. **`src/types/` grouped by layer.** `types/platform/` (claude, git, ports, provider) and `types/modules/` (one file per module) sit beside the cross-cutting top-level files.
    `src/modules/types/` folded into `types/modules/`, and the single-symbol `types/` files folded into the area's broader file:
    - `harness/types/definition.ts` → `types/harness.ts`; `hook/types/events.ts` → `types/hook.ts`
    - `types/locate.ts` and `modules/search/types/{code-index,text,declarations}.ts` → `types/modules/search.ts`
    - `types/skills.ts` and `modules/review/types/bundle.ts` → `types/modules/review.ts`
    - `modules/evidence/types/ledger.ts` → `types/modules/evidence.ts`; `modules/requirements/types/capture.ts` → `types/modules/requirements.ts`
    - `modules/review/types/publication.ts` → `types/modules/publication.ts`; `gitlab/types/gitlab.ts` → `gitlab/types/schemas.ts`
13. **Renames:**
    - `ReviewTarget` in `types/harness.ts` → `ReviewTargetArgs`, so it no longer shares a name with the review schema.
    - `KINDS` in `evidence/notes.ts` → `NOTE_KINDS`. It moved with `NoteKind`, `SaveKind` and `SAVE_KINDS` to `types/modules/evidence.ts`; `NOTE_LABELS` stays in `notes.ts`.
    - The `type Entry = LedgerEntry` aliases are gone (`consent.ts`, `answers.ts`, `harness/types/engine.ts`); the code uses `LedgerEntry`.
    - Fixtures: `A`/`B` → `SESSION_A`/`SESSION_B`, deduped into `testing/fixtures/ids.ts`; `TASK` → `CHECK_TASK` (`check-fixture.ts`) and `PLAN_TASK` (`plan-fixture.ts`).
14. **`export` dropped from 227 file-local statements** in 109 files. `src/types`, `src/testing`, barrels and tests were left alone, and names referenced from evals, tools or fixtures kept their export.
15. **`types/modules/review.ts` no longer re-exports** `ProvenanceEntry`, `RequirementConflict` and `RequirementSource`; `reviewer/prompt.ts` imports them from `types/modules/requirements.ts`.
16. **Second decision batch (F8–F12 and the two structural findings):**
    - **F9:** `util/files.ts` has `writeUniqueFile(fs, base, extension, text)`. It is used by `plan-check.ts`, `worker-run.ts` and `notes.ts`, and `localTimestamp` moved there from `review/bundle/review-name.ts`.
      **Behavior change:** worker and plan-check artifacts are now capped at `UNIQUE_FILE_LIMIT` (9) per minute, as notes already were. Past the cap they throw the new `artifact-collision` code, which is documented in `skills/review/references/outcomes.md`.
    - **F8:**
      - `platform/ports/process.ts` gains `outcomeFailure(outcome)` (spawn-failed → timed-out → truncated → nonzero-exit) and `describeOutcome(outcome)`. `runWorkerProcess` classifies through `outcomeFailure`, and `open-browser.ts` uses both.
      - The reviewer now passes `--tools` and `--json-schema` to the runner and uses the runner's `reason` and final `argv`, so `WorkerProcessResult.argv` is read now.
      - **Changes:** the reviewer argv now ends with `--tools … --json-schema …`; the pinned baseline in `process-runner.test.ts` was updated to match. The `claude --help` failure detail says `exited with N` (was `exited N`).
      - Not folded: git, gitlab api, checks remote and checks run each map a failure to a distinct error code, certainty or recovered verdict. Their order also differs: git tests the exit before truncation. A shared helper would only rename the `if`s.
    - **F10:** the engine's `NEED_COMMANDS` table is gone. The task route registers `onNeedCommand('task', 'review', …)` in `skills/task/handlers.ts`, as the review route already did.
    - **F11:** the guard's copies are now exported as `POINTER_LIMIT` and `TRANSCRIPT_TAIL_BYTES` (the latter renamed from `TRANSCRIPT_TAIL`), with one literal style. `tool-turns.test.ts` pins both to the originals in `harness/session/active-route.ts` and `hook/events/stop-check.ts`.
    - **F12:** the plan-note helper in `evidence/notes.ts` is renamed `noRouteSession`. Its message and code differ from the harness `sessionUnbound`, so the two were not merged.
    - **Engine split:** `harness/engine/engine.ts` went from 685 to 363 lines. It keeps start, advance, deliver, stop and the run setup.
      - `execute.ts` holds the advance loop (`createExecutor(scope)`): code and model steps, failures, gates and completion.
      - `status.ts` holds `routeStatus`.
      - `Part` moved to `harness/types/engine.ts`.
    - **CLI records:**
      - Each command file exports its `*_OPTIONS` and a `CliCommand` record (`{ name, options, validate?, run }`). `main.ts` builds a name → record map; `SPECS` is derived from it, and the 140-line switch and `validateCombination` are gone.
      - `view` and `version` stay in `main.ts`, so `view.ts` is still imported lazily and its chunk split is unchanged.
      - `cli/types/commands.ts` is deleted: `Rendered`, `CliCommand`, `RouteTools` and `ViewOutput` are in `cli/types/cli.ts`, and the tests import options from the command files.

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
   - `SchemaVersionProbe` (`types/config.ts`)
5. **Unused imports removed** in 38 files. Most were left behind when types moved out of a file.
6. **Test-only aliases removed** from `review/reviewer/claude-reviewer.ts`:
   - `REVIEWER_ENV_ALLOWLIST`, which equalled `WORKER_ENV_ALLOWLIST`;
   - the re-export of `STRUCTURED_OUTPUT_ATTEMPTS`;
   - `reviewerEnvironment()`, which equalled `defaultWorkerEnvironment()`.

   `reviewer-boundary.test.ts` now imports the originals. One assertion in `process-runner.test.ts` compared the alias to itself, so it was dropped.
7. **Duplicates folded into one definition each:**
   - `messageOf(error)` → `util/errors.ts`. It replaces 4 copies, in `node-process-runner.ts`, `page/takeover.ts`, `reviewer/claude-reviewer.ts` and `page/cleanup.ts` (where it was named `describe`).
   - `hash12` → `util/hash.ts`, replacing the copies in `harness/gates/gates.ts` and `evidence/notes.ts`.
   - `OWNING_SKILLS` is now exported once, as a `ReadonlySet`, from the import-free `harness/session/ownership.ts`. `harness/engine/context.ts` and `engine.ts` import it instead of redefining it.
8. **`cli/main.ts`:** `MAX_HOOK_INPUT_BYTES` is now a static import from `hook/types/events.ts`; before, it was destructured from the lazily imported `run-hook`. `runHook` itself stays lazy.
9. **Tests:**
   - `src/testing/paths.ts` (`REPO_ROOT`, `SRC_ROOT`) replaces the per-file `fileURLToPath(new URL('../../..', import.meta.url))` roots, and the 25 `const ROOT = REPO_ROOT` aliases are gone.
   - `replay-reviewer.test.ts` uses the new recordings path in its "must be absolute" example.
10. **Types extraction.** 228 symbols moved into `types/` folders:
    - 172 by the plan;
    - 56 pulled in as local dependencies, or lifted so that a `types/` file never imports a deeper `types/` file.

    The types now import only same-level or higher `types/` folders. That removed a runtime import cycle (`RequirementEvidence` ↔ `RequirementSource`) which a first, naive placement had caused.
    Moved declarations that were file-local became `export`; their text is otherwise unchanged.
11. **Header-comment fix:** the comment "Imports sit below the types so the type-only importers above stay light" in `harness/engine/context.ts` was removed, because the types it described are gone from that file.

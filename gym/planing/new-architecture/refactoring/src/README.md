# src refactoring — structure and conventions

This is a structural pass over `src/` that follows the v6 architecture (`../../v6/00-README.md`): L0 platform, L1 modules, L2 harness and L3 skills.
It does not change behavior except where [01-changes.md](01-changes.md) lists a change.
Findings that were reported but not fixed are in [02-findings.md](02-findings.md).
Audits of the evals tree are in `../evals/`; its `02-src-findings.md` is cross-referenced from 02 here.

Verified 2026-10-06 with `npm run verify` (build, typecheck, 2,573 unit tests, plugin validation) and `node tools/check-line-endings.mjs`.
All of them pass. The guard bundle is 67.7 KB, against a 67.6 KB baseline.

## Layout

```
src/
  cli/            bin entry (main.ts), args, options/, commands/{checks,config,policy,prepare,requirements,review,route,search,workers}/, types/
  composition/    runtime and workspace wiring (root.ts)
  harness/        L2 route engine: definition/ (DSL, routes, flags), engine/, gates/, session/, types/
  hook/           Claude Code hooks: events/, guard/ (standalone bundle), session/, shell/, types/
  modules/        L1 capabilities, one folder each, subfolders by concern
    checks/       run/, selection/, workspace/, types/
    config/       init/, types/ (load.ts, root)
    evidence/     ledger/, task/, report/, types/ (notes.ts, root)
    policy/       packs/, authoring/
    requirements/ capture/, envelope/, types/
    review/       bundle/, findings/, page/ (+ templates/), publication/, reviewer/, snapshot/, types/
    search/       text/, declarations/, code-index/, types/
    workers/
    types/        types shared by two or more modules (ecosystems, checks, config, …)
  platform/       L0: git/, ports/ (node implementations), providers/{github,gitlab}/
  skills/         L3: common.ts plus init, investigate, plan, review, rules, task
  testing/        paths.ts (REPO_ROOT, SRC_ROOT), fakes/, fixtures/
  types/          contracts shared across areas (the former src/contracts plus defaults and claude-platform)
  util/           dependency-free helpers
tools/            build, packaging, install, smoke and line-ending scripts (were in the repo root)
```

## Conventions

- **Imports:** relative (`./x.ts`) inside an area and `#alias/path` across areas.
  An area is a top folder, or `modules/<name>` or `platform/<name>`.
  The aliases are `package.json` `"imports"` (`"#util/*": "./src/util/*.ts"`), not tsconfig `paths`.
  `node --test` runs the `.ts` files directly by type stripping and never reads tsconfig, so tsconfig `paths` would resolve for `tsc` and esbuild but fail at test runtime.
  Node, TypeScript and esbuild all resolve `package.json` imports natively.
  Alias specifiers carry no extension, because `#x/y.ts` hits TS2877.
- **`types/` folders:** an exported type, or a literal constant or schema, that other files import lives in a `types/` folder.
  The folder sits at the level that all of its importers share, and there is at most one such folder per area:
  - `src/types/` holds what crosses areas.
  - `src/modules/types/` holds what crosses modules.
  - `<area>/types/<subfolder>.ts` holds what crosses subfolders of one area.

  Exceptions stay beside their code (see 02 §Types):
  - types derived from a runtime value (`z.infer`, `keyof typeof`);
  - the import-free shell-parser file;
  - handler tables and ports, which are runtime objects rather than literals.
- **`index.ts`:** one per area: `cli`, `composition`, `harness`, `hook`, `skills`, `util`, `testing`, each `modules/<name>`, each `platform/<name>`, `types` and `modules/types`.
  Each one is a documented public surface, with one comment line per subfolder group and one line per function that says what it does and how to call it.
  Internal imports deliberately do **not** go through the barrels, for three reasons:
  - routing them through would create import cycles;
  - it would pull code into the import-light guard bundle;
  - it would defeat the lazy view-chunk split in the CLI bundle.

  The barrels list only what production code imports from outside the area. The exceptions are `testing`, which lists every helper, and the two `types` barrels, which list everything.
- **Root scripts:** they moved to `tools/`, and `package.json`, CI (`verify.yml`) and the docs point there.
  `fixtures/` stays at the root because it is shared by src tests and evals (see `../evals/01-required-outside-evals.md` §5).

## Paths updated outside src

- `package.json`: `imports`, the `build`, `test:unit`, `validate:plugin`, `package:*` and `smoke:*` scripts.
- `tsconfig.json`: `include`.
- `.github/workflows/verify.yml`.
- `.gitignore`: removed the stale evals lines that `../evals/01` §3 asked to remove.
- `docs/installation.md`, `docs/release-checklist.md`, `docs/compatibility.md`.
- `gym/planing/new-architecture/v6/`:
  - `02-overview.md`
  - `41-migration.md`
  - `modules/10-search.md`
  - `modules/12-route.md`
  - `modules/13-evidence.md`
  - `modules/15-guard.md`
  - `modules/16-checks-review.md`

  These are path strings only, edited in place as asked. Line numbers quoted next to paths, such as `git.ts:217-229`, are from the old files and were not re-derived.
- `evals/cases/scripts/src/analysis/shortlist-recall.mjs`: `PREPARE_SHORTLIST_LIMIT` now comes from `src/types/search.ts`.
  The other evals imports were already on the new paths and resolve; each imported name was checked.

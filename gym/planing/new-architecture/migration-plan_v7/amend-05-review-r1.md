# Step 05 amendment — review round 1 (2026-10-06)

User decisions on the PLAN items of `plan/migration-v6-reports/step-05/review.md`. These rules
replace the step-05 rules they name. The reviewed text of `step-05-search.md` is unchanged, and
step-05 rules not named here still apply. The round-2 review checks the fix against this file.

## P1 — the plugin holds no grammar table; init measures the project (option B)

- 05-A8 replaced. `SearchProfile.index?: {tool: 'codeindex', languages: string[], files: number}`
  is optional. Step 09's `init` fills it by asking codeindex (`codeindex scan --repo .`: the
  language histogram and the count of files it would index). If the field is absent (not measured),
  there is no gate and codeindex decides. If `files` is 0, the codeindex adapter reports state
  `error`, reason `codeindex indexes no file of this project`. `INDEX_GRAMMARS`/`indexGrammar` are
  removed. The plugin keys nothing by grammar or ecosystem (03c-S1).
- 05-B1, 05-B3, 05-B4: "grammar missing" reads "`profile.index.files` is 0".
- 05-C1, 05-C4: as step 03c (`countDeclarations(texts, names, {exportOnly, patterns?})`, no
  ecosystem parameter). The no-pattern case is a profile without `sources`.

## P2 — one key list per command, from the observed codeindex 2.31.4 output (option A)

- 05-A6 replaced for successful output. A null or non-object row is skipped. Any other shape is
  `{ok:false, state:'error', reason:'codeindex output has no result list'}`:
  - `find`: a top-level list of `{name, kind, file, line}`;
  - `refs`: `callSites[] {file, line}` plus `referencingFiles[]` paths without a call site
    (`line: null`); it needs at least one of the two lists;
  - `relates` (`impact`): `files[] {rel, depth}`. Rows with `depth` ≤ 1 are importers, the target
    itself is dropped, and `imports` is `null`;
  - `delta(base)`: `base` is a revision. It answers `{ok:false}` without a spawn until step 08 needs it.
- 05-A5: file arguments are relative to `--repo .`, the project root. Returned paths stay
  repository-relative.
- Open for later, not in this round: `neighbors` for imports (option B) and a parsed `delta`.

## P3 — freshness measured by drift, not HEAD (option A plus the drift rule)

- 05-B3 / D2 replaced. When the marker exists, `drift` = the number of project files that differ
  from the marker's commit in the working tree (`git diff <head> -- <project>`) plus the untracked,
  not-ignored project files. If `drift ≤ search.indexDriftFiles` (default 20), the state is `fresh`;
  otherwise it is `stale`. If the marker's commit no longer exists, `drift` is null and the state is
  `stale`. Commits, a new branch, a checkout back or a rollback change the state only through the
  files that actually differ.
- `IndexStatus.drift: number | null`. `formatIndexStatus` prints a nonzero drift:
  `index: codeindex fresh (drift 3 files, built in 900 ms)`. The ledger `map.index` is unchanged.
- A failed rebuild keeps the marker, so the index stays fresh or stale by its drift. The
  `index-build-failed` release reads: "the previous index (if any) stays in use, fresh while at most
  `search.indexDriftFiles` project files differ from it".
- `startIndexBuild` still skips a fresh index, so small commits no longer trigger rebuilds.

## P4 — scaffolds resolve SIDE from where the case is generated (option A)

- Tests §13: the acceptance "a case copied one level deeper still resolves SIDE" is dropped. A moved
  case is regenerated.
- 05-S2, 05-S3, 05-K3: `sideRel` = the side directory `<benchmarks>/<side>` relative to the case
  directory (`sideRelFrom`). Base extraction stays in the one builder (05-S4).

## Also folded in

- N4: a null row is skipped (P2), never thrown.
- 05-A3: "executable" is checked with `access(X_OK)` through a new `FileSystem.isExecutable`.

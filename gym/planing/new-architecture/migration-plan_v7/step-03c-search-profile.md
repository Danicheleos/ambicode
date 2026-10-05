# Step 03c — Language-free search: a repository profile built at init

> Prerequisites: step 03b round 7 in the tree (03b-M18…M20, 03b-H9). Spend: $0 except 03c-V3,
> which needs named authorization and a ceiling. Read [05-working-rules.md](05-working-rules.md)
> first. Normative sources: D9 and D18 in [v6/01](../v6/01-goals-and-constraints.md) (deterministic
> search choices only when declared in config, printed and recorded; language-agnostic by
> construction); [v6/10](../v6/modules/10-search.md) §1, §2; [step 03b](step-03b-decision-a-tuning.md)
> rules M13, M14, M16.
> Owner of: `src/code-intelligence/profile.ts`, the `profile` field of a project, and every search
> fact that today depends on `ecosystem`. Checks, packs and LSP guidance keep their ecosystem.

## Goal

The search code (`rankTerms`, `locate`, `harvest`, `buildMap`, `featureOf`) stops reading the
project's `ecosystem`. The facts it needs are measured from the repository by `ambicode init`,
written as a `profile` on each project, printed, and read at map time. No profile: generic behaviour.

## Starting point

Recheck at dispatch.

- `src/config/ecosystems.ts`: `ECOSYSTEMS` per ecosystem — `sourceGlobs`, `declarationPatterns`
  (one shared list), `exportFilter` (TypeScript `^\s*export\b`), `i18nGlobs` (TypeScript only),
  `sharedKinds` (TypeScript only); `FALLBACK_ECOSYSTEM`; `ecosystemFacts()`.
- Consumers: `map.ts` `i18nKeys` (`i18nGlobs`), `buildMap` → `featureOf` (`sharedKinds`);
  `harvest.ts` (`exportFilter`); `dependents.ts` (`FALLBACK_ECOSYSTEM.declarationPatterns`);
  `locate.ts` `withTemplates` (`TEMPLATE = /\.(html|scss|sass|less|css)$/` → `.ts`) and
  `shortlistRules` (`SHORTLIST_DEFAULTS[project.ecosystem]` when `project.shortlist` is absent).
- `src/config/init.ts` writes `shortlist: shortlistDefaults(ecosystem)` for each detected project;
  `src/cli/commands/init.ts` `runInit` (flags `json`, `dry-run`).
- `src/contracts/config.ts` `ProjectConfig` (strict object; `shortlist` optional).
- Already language-free: `isTestPath` (union of conventions), `COMMON_NAMES`, 03b-M12, M15, M17,
  M18 (layer share), M19 (sequence folders), M20 (route segments).
- Benches: TS 25/53 true files in the map (`gym/decA/round6/map-baseline.json`); Python 17/34
  (`gym/decA/python/map-c5.json`, 27 reachable). Both through `map-recall --cases`.

## Files

| File | Change | Budget |
|---|---|---|
| `src/code-intelligence/profile.ts` | new: `buildProfile` and its four detectors | ≤ 220 lines |
| `src/contracts/config.ts` | `SearchProfile`; optional `profile` on `ProjectConfig` | +25 |
| `src/config/ecosystems.ts` | keep `declarationPatterns` only; drop the other search facts | −30 |
| `src/config/init.ts`, `src/cli/commands/init.ts` | write and print the profile; `--refresh-profile` | +50 |
| `src/cli/commands/config.ts` | print the effective profile | +10 |
| `src/code-intelligence/map.ts` | catalogs and feature kinds from the profile | ±25 |
| `src/code-intelligence/locate.ts` | companion pairs from the profile; shortlist fallback | ±25 |
| `src/code-intelligence/harvest.ts` | export rule from the profile | ±10 |
| tests: `profile.test.ts` (new), `search.test.ts`, `config.test.ts`, init tests | — | — |

## Contract

```ts
// src/contracts/config.ts
export const SearchProfile = z.strictObject({
  stamp: z.strictObject({ commit: z.string(), files: z.number().int().nonnegative() }),
  sources: z.array(z.string().min(1)),            // file extensions without the dot, most files first
  companions: z.array(z.tuple([z.string(), z.string()])), // [from, to] extensions, same folder and stem
  catalogs: z.array(z.string().min(1)),           // globs of text catalogs, repository-relative
  featureKinds: z.array(z.string().min(1)),       // middle name parts (`x.<kind>.ext`) for the feature line
  exportOnly: z.boolean(),                         // a declaration counts only on an `export` line
});
// ProjectConfig gains: profile: SearchProfile.optional()

// src/code-intelligence/profile.ts
export async function buildProfile(runtime: Runtime, project: ProjectConfig): Promise<SearchProfile>;
export const GENERIC_PROFILE: Omit<SearchProfile, 'stamp'>; // used when a project has no profile
```

No new error code. A malformed `profile` fails config validation like any other field.

## Rules

**P — profile (init)**
- 03c-P1 `ambicode init` computes a profile for each project it creates and writes it under that
  project. An existing `profile` is left as it is; `init --refresh-profile` replaces it. `--dry-run`
  prints it without writing.
- 03c-P2 `sources`: extensions of tracked files under the project root where the shared
  declaration patterns match at least one line in 30% or more of up to 50 sampled files, with 5 or
  more files; sorted by file count. A new project's `shortlist.include` is built from them; its
  `exclude` is the union of today's test excludes.
- 03c-P3 `companions`: `[a, b]` when 20 or more `a` files have a `b` file in the same folder with the
  same name before the last extension, and that is 50% or more of the `a` files; `a` is not in
  `sources`, `b` is.
- 03c-P4 `catalogs`: json, yaml, yml, po, properties, arb, xlf or ftl files with 20 or more string
  values of which 60% or more hold a space and none of whose keys does; files that share a folder
  and extension collapse to one `folder/*.ext` glob.
- 03c-P5 `featureKinds`: middle name parts with 10 or more files in 3 or more folders whose files
  change in the same commit as a same-stem sibling of another kind in 30% or more of their commits
  (last 500 non-merge commits). Tests are always on the feature line and are not kinds.
- 03c-P6 `exportOnly`: true when 40% or more of the declaration lines in the sampled `sources`
  files start with `export`.
- 03c-P7 `stamp`: `HEAD` commit and tracked file count at build time. `init` and `config` print
  each field in one line; the profile build takes at most 5 s on either bench repository.

**S — search reads the profile**
- 03c-S1 Search code does not read `project.ecosystem`. `ecosystemFacts` keeps
  `declarationPatterns` only; `i18nGlobs`, `sharedKinds`, `exportFilter` and `sourceGlobs` go.
- 03c-S2 `i18nKeys` reads `profile.catalogs` (03b-M13's English-first order and phrases unchanged).
- 03c-S3 `withTemplates` lifts a hit from `a` to its `b` sibling for each `profile.companions` pair;
  the extension regex and the `.ts` target go.
- 03c-S4 `featureOf`'s folder rule lists tests and files of `profile.featureKinds`.
- 03c-S5 `harvest` applies the export rule when `profile.exportOnly` is true.
- 03c-S6 `shortlistRules` without `project.shortlist` builds include globs from `profile.sources`,
  else from the union of today's defaults.
- 03c-S7 No profile: `GENERIC_PROFILE` (`sources` = union of today's extensions, no companions, no
  catalogs, no feature kinds, `exportOnly` false) and one config notice: "no search profile; run
  `ambicode init --refresh-profile`".

**V — verification**
- 03c-V1 Offline ($0): bench configs regenerated with `init --refresh-profile`; the profile of each
  bench is printed in the report. `map-recall --expect` passes on TS against round 6 and on Python
  against `map-c5.json`; listed paths on TS do not rise by more than 5.
- 03c-V2 Offline ($0): the TS bench profile reproduces the facts it replaces: companions include
  html and scss → ts, catalogs include the i18n folders, `exportOnly` is true. Any difference is
  reported with its map-recall effect, not patched into the detector.
- 03c-V3 Paid, only with named authorization and a ceiling: 10 localize cases × 3 plugin runs,
  gated by the 03-A3 command plus `--min-runs 3`; 03-A5 unchanged.

## Decided readings

- The profile lives on each project in `config.yaml` (user default, may be changed before
  dispatch): it is declared, printed and editable, which is what D9 asks for; D18 asks for specifics gathered at init.
- 03b-M18, M19 and M20 stay live: they cost one file list at map time and need no stored fact.
- `init` never edits an existing profile, so a user's edit survives; staleness is shown by `stamp`,
  not repaired automatically.
- Thresholds are fixed numbers in `profile.ts`, not configuration.

## Non-goals (a reviewer may not raise these)

- Repository stop words and observed test naming (no measured miss on either bench).
- Changing checks, packs, LSP guidance or the `Ecosystem` enum.
- Profile refresh from hooks, or any automatic staleness repair.
- New declaration patterns, or per-language declaration logic.
- A third bench repository (welcome, but it is a measurement, not a rule).

## Tests

- `src/code-intelligence/profile.test.ts`: 03c-P2…P7 on fixture repositories (one TS/Angular-shaped,
  one layered Python-shaped), including the negative case of each detector.
- `src/config/config.test.ts`: `SearchProfile` valid and invalid; 03c-S7 notice.
- init tests: 03c-P1 create, keep, `--refresh-profile`, `--dry-run`.
- `src/code-intelligence/search.test.ts`: 03c-S1…S6 (existing M13, M14, M16 tests rewritten to pass
  their facts through a profile); 03c-S7 generic behaviour.

## Done when

- [ ] Every rule has a named test, except 03c-V1…V3, which are reported.
- [ ] `grep -n "ecosystem" src/code-intelligence/` shows no read of `project.ecosystem`.
- [ ] `npm run verify` exits 0; the bundle is rebuilt.
- [ ] 03c-V1 and 03c-V2 results are in the report, with both bench profiles.
- [ ] 03c-V3 is run only after authorization; until then the step is reported partial.

## Hand-off

Step 05 (search) and step 09 (init rules) receive the profile and do not rebuild it. Any later
search fact is added as a profile field with its detector, never keyed by ecosystem.

## Coverage of the v6 brief

| Source | Here |
|---|---|
| D9: deterministic search choices declared in config, printed, recorded | 03c-P1, 03c-P7, decided reading 1 |
| D18 and R16: the plugin is language-agnostic; specifics gathered at init | 03c-S1 |
| 03b-M13 catalogs | 03c-P4, 03c-S2 |
| 03b-M14 template pairing | 03c-P3, 03c-S3 |
| 03b-M16 feature-line kinds | 03c-P5, 03c-S4 |
| v6/10 §1–2 map layers | unchanged |

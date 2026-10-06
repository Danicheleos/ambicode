# Findings: reported, not fixed

F1–F6 and F8–F12 were decided and applied (01 §7, §12–§16). These are left for a decision because each one either changes behavior, renames a public or file-format name, or is wide enough to hide a regression.
`../evals/02-src-findings.md` (Dn numbers) audited the same code. Its items that were applied here are listed at the end.

## Duplication and naming

| # | What | Where | Why not fixed / suggestion |
|---|---|---|---|
| F7 | `toPosix` and `isInside` inlined | D8, D9 | **D9 changes behavior**: the inline `relative().startsWith('..')` also rejects a file named `..foo`, so each site needs a check. |

## Types placement

- **Kept beside their runtime value:**
  - `TypedEntry` (`z.infer` of `schemas` in `ledger/kinds.ts`)
  - `LayerName`, `MapLayer` and `MapResult` (from `LAYER_NAMES` in `search/text/map.ts`)

  Moving them would make a `types/` file import an implementation file. To move them, move the schemas or tables as well.
- **`hook/shell/command-parser.ts` keeps its types**, because a test pins the file as import-free for the guard bundle. `hook/index.ts` re-exports them from there.
- **`types/modules/review.ts` and `types/modules/search.ts` are now the largest contract files**, after the folding. Split them by subfolder (bundle/page/publication, text/declarations/code-index) if they keep growing.

## Dead or over-exported code still present

- **Production exports used only by tests:**
  - `registryGate` (`harness/gates/gates.ts`)
  - in `harness/session/session.ts`: `hookBinding`, `environmentSessionSource`, `updatedInputSessionSource`, `associationSessionSource`, `writeAssociation`, `removeAssociation`
  - `buildSnapshot` (`review/snapshot/snapshot.ts`)
  - `hitCount` (`requirements/capture/expansion.ts`)
  - `REGISTERED_HOOK_EVENTS` and `REGISTERED_HOOK_ENTRIES` (`types/hook.ts`)

  These are kept, because the tests exercise them as units. They would be candidates for removal if the tests went through the public path.
- **`src/types` and `src/testing` may still hold file-local exports.** They were excluded from the un-export pass because both are documented, list-everything surfaces.

## Possible bugs and over-engineering

- **Process-outcome handling (rest of F8/D4):** `git.ts`, `gitlab/api.ts`, `checks/run/remote.ts`, `checks/run/run.ts` and `code-index/codeindex.ts` still branch on `outcome.kind` themselves (see 01 §16 for why).

- **`smoke:candidate` fails at its `policy` step with `config-missing`.** It fails identically on HEAD before this refactor, so the cause is pre-existing.

## Applied from `../evals/02-src-findings.md`

- D1: `messageOf`, the 4 named copies and about 15 inline sites.
- D6: `hash12`.
- D7: `OWNING_SKILLS`.
- The aliases section: `REVIEWER_ENV_ALLOWLIST`, the `STRUCTURED_OUTPUT_ATTEMPTS` re-export and `reviewerEnvironment`.
- The zero-reference exports, except `INDEX_DRIFT_FILES`, which `codeindex.ts` does use.
- `contracts/index.ts` is now the documented `types/index.ts`, and `hook/index.ts` is kept as the documented barrel.
- `../evals/01` §3 (`.gitignore`) and §4 (the `replay-reviewer.test.ts` path).

# Measurements taken for the v2 architecture design (2026-10-03)

Off-the-shelf code-index tools timed on copies of this repository (`self`, 159 ts files), the BE
benchmark snapshot (532 ts) and the FE snapshot (2,338 ts, 4,262 files). node v24.15.0, macOS,
no `node_modules` in the snapshots, the eval's generated tsconfig (`lsp-arms.mjs` `tsconfigFor`).

- `run.sh`: install (`@maxgfr/codeindex`, `@raymondchins/agentmap`, `@sourcegraph/scip-typescript`),
  cold and warm index per repo, help texts. Log: `results.log`. The TypeScript language-service block
  at its end failed (module import); `compare.mjs` repeats it.
- `queries.sh` / `queries.log`: first query timings; `codeindex` read commands there were called with
  the wrong flag (`--out` instead of `--index`) and with unsplit arguments, hence `exit=2`; the
  corrected calls are in `compare.mjs`.
- `compare.mjs <repoDir> <symbol> <file> <codeindexIndexDir> <binDir>`: language-service reference set
  for one symbol, timings, and precision/recall of `git grep -w -l`, `agentmap --relates` dependents
  and `codeindex refs` against it. Results quoted in `v1/modules/10-search.md` §3.

Summary of the numbers used in the design:

```
                          cold index self/BE/FE     warm        query BE/FE          refs P/R BE   refs P/R FE
codeindex 2.31.2          0.9 / 0.9 / 5.7 s         0.15/0.5 s  refs 236 / 483 ms    1.00/1.00     1.00/1.00
agentmap                  1.2 / 1.3 / 6.1 s         0.1/0.2 s   relates 93 / 163 ms  1.00/1.00     1.00/0.36
scip-typescript           4.0 / 4.4 / 11.6 s        -           no local query       -             -
git grep -w -l            -                         -           17 / 41 ms           1.00/1.00     1.00/1.00
TS language service       create 8-11 ms; first references 706 / 2,434 ms; second 10 / 48 ms; RSS 368 / 777 MB
```

Symbols: BE `PermissionHelper` (22 referencing files), FE `UserFacade` (179). Both names are unique
in their repository, which is why grep is exact here; colliding names were not measured.

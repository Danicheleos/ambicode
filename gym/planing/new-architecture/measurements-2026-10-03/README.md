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

## Provenance note (added 2026-10-04 after review-v2 #50)

The logs in this directory record the **first attempts**, two of which failed: the language-service
block in `results.log` died on the `reuse-score.mjs` import, and the `codeindex` read commands in
`queries.log` exited 2 (wrong flag, unsplit arguments). The corrected `compare.mjs` was re-run by
hand and its stdout was **not saved**, so the following numbers in the table above exist only in
this README: `codeindex refs 236 / 483 ms`, all four precision/recall rows, and the whole TypeScript
language-service line. Where the logs do hold a number it differs from the table because the logged
figure includes process spawn: `git grep -w -l` 70 ms (BE) / 151 ms (FE) in `queries.log` vs 17 / 41
in-process; `agentmap --relates` 115 / 199 ms logged vs 93 / 163. The v3 design quotes the logged
numbers where they exist and labels the rest "unlogged re-run"; v3 33 §0.5 re-runs `compare.mjs`
and commits `compare.log` before any of them is used in a decision.

## Re-run status (migration step 00, 2026-10-04)

`compare.mjs` was **not** re-run and there is still no `compare.log`. Its inputs are absent from this
directory: `repos/` (the three repository copies `run.sh` makes), `tools/` (the installed
`@maxgfr/codeindex` and `@raymondchins/agentmap`) and `out/` (the codeindex index directories). Step 00
may not install an index dependency, and the BE/FE copies are benchmark snapshots that must stay in
the ignored `benchmarks/` locations. So every figure above that is marked unlogged stays an
**unlogged re-run**; none was promoted to a logged fact. Before re-running: `run.sh` copies the BE/FE
snapshots to `repos/` here, which is **not** gitignored (checked with `git check-ignore`), so ignore that
directory first or point the script at an ignored location. Then run `run.sh` (installs the tools), and
`node compare.mjs <repoDir> <symbol> <definingFile> <codeindexIndexDir> <binDir> | tee -a compare.log`
per repository, and record the node version and machine with it.

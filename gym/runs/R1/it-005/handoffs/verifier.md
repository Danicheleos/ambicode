# verifier handoff — it-005 — 1595f5e (+ uncommitted working tree)
## Ran
- `npm run verify` → exit 0; output file: /tmp/it005-verify.log (exit code in /tmp/it005-verify.exit)
- `node check-line-endings.mjs` → exit 0 ("514 tracked text file(s), all stored as LF")
- `git diff --stat -- . ':!gym'` → 2 files, +263/−13
- `jq` over `gym/runs/R1/it-005/scratch/keep/be-vs-5546-review-996-d520e3ca/run-{1,2}.json`, `summary.json`, `usage.json` → derivations below
- `node /tmp/it005-probe.mjs` (imports the exported pure functions only; no recorder, eval or `claude` run) → probes of defects 1–3 below
- `git check-ignore`, `grep -rlI evals-record-core` (excl. node_modules, dist, .git, runs)
- Not run: `npm run package:reproducible` (verify already builds and validates the plugin; the change touches no shipped file, `evals/scripts` is not in the package)
## Numbers
| field | value | from |
| verify exit | 0 | /tmp/it005-verify.log |
| tests / pass / fail / skipped | 791 / 790 / 0 / 1 | /tmp/it005-verify.log:1096-1101 |
| base tests / pass / fail / skipped | 776 / 775 / 0 / 1 | gym/runs/R1/it-005/base-verify.log:1071-1076 (lead's log, not re-run) |
| delta | +15 | 791 − 776 |
| files in `git diff --stat -- . ':!gym'` | evals-record-core.mjs, evals-record-core.test.mjs only | git diff --stat |
| tests in new file | 15 (3 options, 2 directory, 5 stability, 2 choice, 3 summary/usage) | grep `it(` = 15; matches the +15 delta |
| findings per run | 5, 5 | `jq '.findings|length'` on run-1/run-2 |
| medium+ per run (risk in medium, high) | 3, 1 | jq select on `.findings[].risk` |
| medium+ keys run-1 | OrganizationController.ts x2, OrganizationValidators.ts | jq |
| medium+ keys run-2 | OrganizationController.ts | jq |
| stability | 1 of 2 distinct keys in >= 2 runs = 0.5 | jq group_by over unique-per-run keys |
| summary.json vs run files | k 2, counts [5,5], mediumPlusCounts [3,1], stability 0.5, failedRuns [], refused [] all match | jq |
| usage.json vs run files | turns 4/2, apiDurationMs 17459/22090, outputTokens 2272/2717, costUsd 0.0997412 / 0.07319919999999999 all equal `.usage` in the run files (jq equality true) | jq |
| run files | snapshotId equals recording.snapshotId (working-6b833f10eaf5db97), model sonnet, keys case,costUsd,findings,recording,run,snapshotId,usage,wallMs | jq |
| importers of evals-record-core.mjs | none: only its own test; other hits are the `evals:record` script (package.json:22, a CLI, not an import), a comment at evals-bench.mjs:608, evals-core/README.md:97, trace files, and an untracked copy of the test in .claude/worktrees/agent-a881fef9e579dcc33 (git-excluded) | `grep -n "import.*record-core"` |
## Could not do
- `npm run package:reproducible` not run (see Ran).
- Did not run the recorder: the failing inputs below are shown through the exported pure functions, not the CLI.
## Disagreements (verifier/auditor only)
| field | lead's value | mine | source of difference |
| verify exit / tests / pass / fail / skipped | 0 / 791 / 790 / 0 / 1 | same | none |
| base tests | 776 / 775 / 0 / 1 | same (read from base-verify.log, not re-run) | none |
| diff --stat files | two files | same | none |
| tests in new file | 15 | 15 | none |
| findings counts | 5, 5 | 5, 5 | none |
| medium+ counts | 3, 1 | 3, 1 | none |
| stability | 0.5 | 0.5 | none |
| usage turns / costUsd | 4, 2 / 0.0997412, 0.0731992 | 4, 2 / 0.0997412, 0.07319919999999999 | rounding of the same double |
| summary.json / usage.json match run files | yes | yes | none |
| "nothing imports evals-record-core.mjs" | true | true | none |
Defects (no numeric disagreement, but see 1–3, which I would block or waive explicitly):
1. `stability` with k < 2. evals-record-core.mjs `buildSummary` (stability call in the `summary.cases.push`) computes over successful runs only. With `--runs 3` and two failed runs, one surviving run with a medium finding gives `stability: 0`, which reads as "fully unstable"; it is unmeasurable and should be null. Failing input: `buildSummary([{case:'x',runs:[{run:1,ok:true,findings:[high a.ts]},{run:2,ok:false,detail:'d'}]}])` → `"k":1,...,"stability":0`. The proof run itself (k=2) is not affected. No test covers k=1 with a medium finding.
2. `--keep-runs` guard does not enforce "gitignored". evals-record-core.mjs `keepRunsDirectory` accepts any path with a `scratch` segment. Only `gym/runs/**/scratch/` (gym/runs/.gitignore:1) and `benchmarks/` (.gitignore:39) are ignored. Failing input: `--keep-runs scratch/keep`, `evals/scratch/keep` or `src/scratch` are accepted and `git check-ignore` reports NOT ignored, so NDA reviewer output could be committed. Brief item 1 says "scratch (gitignored, 06 §2)". Fix would be a `git check-ignore` on the target or a prefix check. Also accepted: `/tmp/scratch` (outside the repo, harmless) and symlinked `scratch` directories (not probed).
3. Stale files: `summary.json` / `usage.json` are rebuilt from the current invocation only. A second `--keep-runs` call into the same directory for a subset of cases overwrites both and drops the other cases, while their `run-*.json` remain. Not a miscount, but summary no longer describes the directory.
4. Minor: `--runs 99999999999` is accepted (no upper bound) and would queue that many paid reviews per case; a `writeFile` failure inside the worker's try block is reported as a REFUSED run and the successful recording is dropped; `--runs 2 a a` (duplicate case name) is accepted, `reviewCases` yields one case so it is harmless; a finding with both paths null shares one key (schema allows it, `FindingLocation` at src/contracts/review.ts:46-51).
Checked, no defect: default no-flag path is behaviour-preserving (runs=1: same log label, same recordings-file entry, exit code 1 iff a case failed, no new file; the recordings write moved after the pool but the content is identical); the recordings file gets the highest successful run index independent of completion order (`chooseRecording`, tested); summary omits the prompt md5 and `policies/` hash (brief permits, lead's handoff must say so); usage fields are `?? null`, never 0.
## Claims without evidence
- Defect 3 and the symlink case in defect 2 were read from code, not run.

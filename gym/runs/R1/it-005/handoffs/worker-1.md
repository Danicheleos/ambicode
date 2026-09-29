# worker handoff — it-005 — based on 1595f5e (lead's transcription of the worker's two reports; the diff is `../diff.patch`)

## Ran
- `git checkout --detach 1595f5e` in the worktree (it started at `cea8fa3`, which has no `evals/scripts/src`) → exit 0
- `npm ci` → exit 0
- Round 1: `node --test evals/scripts/src/evals-record-core.test.mjs` → 15 tests, 15 pass; `npm run verify` → exit 0, 789 / 788 / 0 / 1 in the worker's tree
- `node evals/scripts/src/evals-record-core.mjs --runs 0` → exit 1 before any spawn; `--keep-runs /tmp/keep` → exit 1 ("no path segment is scratch"), before any spawn
- Round 2 (verifier defects), tests written first: 3 failed on the round-1 code (`evals/scratch/keep` accepted twice; stability 0 with one successful run), a 4th failed on a missing export (`assertFreshKeepDirectory`); after the fixes `node --test` → 19 / 19 pass; `npm run verify` → exit 0, 793 / 792 / 0 / 1 in the worker's tree
- `node evals/scripts/src/evals-record-core.mjs --keep-runs evals/scratch/keep` → exit 1 ("git does not ignore it"), before any spawn

## Numbers
| field | value | from |
|---|---|---|
| tests in the new file | 19 | worker's `node --test` |
| worker-tree base | 774 | the worker's own revert; the main tree measures 776 (`../base-verify.log`); the 2-test gap is not explained |
| main-tree G1 with the final diff | 795 / 794 / 0 / 1 | `../verify.log` (lead) |

## Files touched
- `evals/scripts/src/evals-record-core.mjs` (+151/−13 in the main tree)
- `evals/scripts/src/evals-record-core.test.mjs` (+185, new)

## Could not do
- The write path for `run-k.json`, `summary.json`, `usage.json` and the `assertFreshKeepDirectory` refusal are not exercised by unit tests through `main`; the lead's proof runs cover them (`../metrics.json` T3.proofRun).
- md5 of the reviewer system prompt and the `policies/` tree hash are absent from `summary.json`: the prompt is generated into the scaffold's `.ambicode/reviews/`, which the recorder deletes, and the plan does not define the tree hash.

## Claims without evidence
- None.

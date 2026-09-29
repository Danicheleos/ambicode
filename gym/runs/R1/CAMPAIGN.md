# Campaign R1

| Field | Value | Source |
|---|---|---|
| campaignId | `R1` (directory `gym/runs/R1/`, branch `gym/R1`, tags `gym/R1/*`) | supervisor kickoff "campaign R1"; `git branch --show-current` → `gym/R1` |
| status | open | — |
| startCommit | `2c63668c658b79868621316cbeba3fa0fd804cce` | `git rev-parse HEAD` at iteration 0 |
| forkedFrom | `tuning` (`bfadeef`), ancestor of startCommit | `git merge-base --is-ancestor tuning HEAD` → true; `git log --oneline tuning..HEAD` → `2c63668`, `8265a27` (both supervisor/gitignore only) |
| planDigest | `33895be5e4b98099a4a8611774b9b0517a007b2bec41a024256e017fbb0873b5` | `sha256sum gym/plan/*.md \| sha256sum` after replan R-4 (owner apply 2026-09-29, tag gym/R1/replan-4); before: `c2c756c67bbaf32eb70c26ccff900b8711c74e2af6b29de965411c4eed66dd64` (after R-3, tag gym/R1/replan-3), `c7d037a1911594eb921dbc9890437b1f1f3e8108b98002c48f5b10550d406317` (after R-2, tag gym/R1/replan-2), `a7feb66fef5cf1d2ecff7ba3aee4eb57e6e8f217c64abc2a21bd7f1e81c9ca5f` (after R-1, tag gym/R1/replan-1), `ca5d65f25e77a6307bdcd1db0fe7bfe453d58a5034d96c5e326dbddfb5a71096` (iteration 0) |
| pluginVersion | 0.3.4 | `jq -r .version .claude-plugin/plugin.json` |
| budgetUsd | 400 | owner, `labels/labels.json` L-012 answer (a) "400" (2026-09-29T08:54:57.804Z); stop at 90 % = $360 (03 §3 S2); budget checkpoints at $200 (50 %) and $300 (75 %). Previously 250 (L-009, 2026-09-29T03:24:22.933Z) and 150 (L-002, 2026-09-29T02:23:04Z). The lead's ledger counts lead session costs + every eval-harness `costUsd`, baseline included (`cp-budget-*.md`). The supervisor restarted at 03:24:23Z with `"budgetUsd":250` (`supervisor/supervisor.log`); it counts only session costs + `it-*/metrics.json` |
| spentBeforeIteration0 | $1.70 (sessions 1–3, no progress, all writes refused) | `gym/runs/R1/supervisor/state.json` `spentUsd` 1.7028 |
| models | lead `claude-opus-5-5` (effort high); helpers `claude-sonnet-5-5` (effort high); eval agent pinned `claude-opus-5-5` (`--model`) | USER-GUIDE §3 item 4 (owner's answer); `gym/plan/supervisor/defaults.json` |
| ownerChannel | `gym/runs/R1/OWNER-INBOX.md` (lead appends) | supervisor kickoff; USER-GUIDE §3 item 3 "OK" |
| pushAllowed | no | supervisor kickoff; USER-GUIDE §3 item 5 |
| installAllowed | no | supervisor kickoff; USER-GUIDE §3 item 6 |
| usageSource | owner reads usage on a Claude Team x5 subscription; campaign spend is the list-price `costUsd` from sessions and eval results | USER-GUIDE §3 item 2 |

## Notes

- `gym/runs/.gitignore` has the five lines of 06 §2 (`cat gym/runs/.gitignore`, iteration 0).
- The guard denies every `claude …` command for the lead (nested-agent rule, denial 1 of session 4), so the prerequisite `claude auth status` was not run by the lead; login state is observed from the first eval sweep instead.
- **Budget history, settled by L-002.** `supervisor/supervisor.log` start events have `"budgetUsd":1000` (01:22Z) and then `"budgetUsd":100` (01:35Z, the running supervisor). Outside the lead's sessions, this row became 3000 (~02:09Z), the OWNER-INBOX line became "$1000 (raised by user)", and at 02:18:43Z (file mtime) this note was changed to quote "300" for the kickoff and for `supervisor.log`, which the log does not support. Session 4 treated $100 as operative and filed L-002. The owner answered 150 on 2026-09-29T02:23:04Z and asked for both stray values to be replaced; session 5 did that.
- The owner's planning session answered L-001 in `labels/labels.json` (2026-09-29T02:05:11Z). It added 3 transcripts to `archive/` (manifest now 318 lines, `sha256sum -c` 318 OK). It also left uncommitted edits to `gym/plan/supervisor/{defaults.json,policy.mjs,test/policy.test.mjs}` (new volatile inputs; a per-invocation `claude` subcommand check). The lead does not commit those; they are the owner's.

# Campaign R1

| Field | Value | Source |
|---|---|---|
| campaignId | `R1` (directory `gym/runs/R1/`, branch `gym/R1`, tags `gym/R1/*`) | supervisor kickoff "campaign R1"; `git branch --show-current` → `gym/R1` |
| status | open | — |
| startCommit | `2c63668c658b79868621316cbeba3fa0fd804cce` | `git rev-parse HEAD` at iteration 0 |
| forkedFrom | `tuning` (`bfadeef`), ancestor of startCommit | `git merge-base --is-ancestor tuning HEAD` → true; `git log --oneline tuning..HEAD` → `2c63668`, `8265a27` (both supervisor/gitignore only) |
| planDigest | `ca5d65f25e77a6307bdcd1db0fe7bfe453d58a5034d96c5e326dbddfb5a71096` | `sha256sum gym/plan/*.md \| sha256sum` at iteration 0 |
| pluginVersion | 0.3.4 | `jq -r .version .claude-plugin/plugin.json` |
| budgetUsd | 3000 | owner decision in the supervisor kickoff ("budget 3000 USD"); stop at 90 % = $90 (01 §5); counts supervisor session costs + `it-*/metrics.json` `costUsd` (10 §4 row 4) |
| spentBeforeIteration0 | $1.70 (sessions 1–3, no progress, all writes refused) | `gym/runs/R1/supervisor/state.json` `spentUsd` 1.7028 |
| models | lead `claude-opus-5-5` (effort high); helpers `claude-sonnet-5-5` (effort high); eval agent pinned `claude-opus-5-5` (`--model`) | USER-GUIDE §3 item 4 (owner's answer); `gym/plan/supervisor/defaults.json` |
| ownerChannel | `gym/runs/R1/OWNER-INBOX.md` (lead appends) | supervisor kickoff; USER-GUIDE §3 item 3 "OK" |
| pushAllowed | no | supervisor kickoff; USER-GUIDE §3 item 5 |
| installAllowed | no | supervisor kickoff; USER-GUIDE §3 item 6 |
| usageSource | owner reads usage on a Claude Team x5 subscription; campaign spend is the list-price `costUsd` from sessions and eval results | USER-GUIDE §3 item 2 |

## Notes

- `gym/runs/.gitignore` has the five lines of 06 §2 (`cat gym/runs/.gitignore`, iteration 0).
- The guard denies every `claude …` command for the lead (nested-agent rule, denial 1 of session 4), so the prerequisite `claude auth status` was not run by the lead; login state is observed from the first eval sweep instead.
- **budgetUsd row edited outside the lead's session, unverified.** The lead wrote `budgetUsd | 300 | owner decision in the supervisor kickoff ("budget 300 USD")`. At 2026-09-29 ~02:09Z (file mtime 04:09 local) the value and the quoted source became 3000, while the "stop at 90 % = $90" in the same cell stayed. Separately, the lead's OWNER-INBOX line was edited to "ceiling $300 (raised by user)". The kickoff text says 300 USD. `supervisor/supervisor.log` session-4 start has `"budgetUsd":300`. `labels/labels.json` has no budget entry. The edits disagree with each other (3000 vs 1000). **The operative ceiling is $300** until a `labels.json` line or a supervisor restart with another `--budget-usd` settles it (03 §2 "raising a limit … human only"; 05 §1 "says a human decided something"). Filed as L-002. The lead did not revert either edit.
- The owner's planning session answered L-001 in `labels/labels.json` (2026-09-29T02:05:11Z). It added 3 transcripts to `archive/` (manifest now 318 lines, `sha256sum -c` 318 OK). It also left uncommitted edits to `gym/plan/supervisor/{defaults.json,policy.mjs,test/policy.test.mjs}` (new volatile inputs; a per-invocation `claude` subcommand check). The lead does not commit those; they are the owner's.

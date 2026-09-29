# User guide — setting up and running the campaign

For the owner of this repository. The agents' rules are in the numbered files; this page
is what **you** do before, during and after. Commands are for macOS/zsh from the
repository root unless stated.

## 1. What you are starting

A lead agent, with a verifier, an auditor and disposable workers, will run
evaluate → improve → evaluate iterations on the plugin, on the branch
`gym/<campaign-id>` forked from `tuning`. Each iteration costs $0–70 in model calls and
about 1–75 minutes ([01 §5](01-goals-and-metrics.md#5-cost-and-time-per-iteration)).
Nothing is pushed, published or installed into your Claude configuration unless you
say so here. Cycle 1 ends when [01 §1](01-goals-and-metrics.md#1-definition-of-trained-cycle-1)
holds.

## 2. Prerequisites (check each; the lead re-checks them in iteration 0)

| Need | Check | State on 2026-09-28 |
|---|---|---|
| Node 24 | `node --version` | v24.15.0 |
| Claude Code CLI, logged in | `claude --version`; `claude auth status` | 2.1.284; `claude auth status` → `"loggedIn": true` (claude.ai, first party) on 2026-09-29 |
| This repository at the start commit | `git rev-parse --short HEAD` on `tuning` | `3e5e146`, staged `gym/planing` changes (commit or stash them first) |
| Gates green | `npm ci && npm run verify && npm run package:reproducible` | verify exit 0, 751 tests; reproducible zip sha256 `c8c5b7b3…dec7f` |
| Benchmark data (NDA, gitignored) | `ls benchmarks/cases \| wc -l`; `ls benchmarks/reviewer-recordings.json` | present; 5 recordings |
| Pre-campaign sweeps | `ls evals/evals-core/results/eval-2026-09-28T*.json` | 3 files |
| Volatile inputs still present | `ls ~/.claude/projects/-Users-KillBill-Documents-projects-inseer-inseer-frontend/{8efdbd08,9a235fc3}*.jsonl`; `for d in gym/planing/investigation/cache/VS-6735/reviews/*/; do test -d "$(cat $d/snapshot-path.txt)" && echo ok || echo MISSING; done` | all present; the snapshots live in `/var/folders` and can vanish — start soon or copy them yourself to `gym/runs/<campaign-id>/archive/` |
| Budget | your usage plan | **TBD** — decide a ceiling; the default the lead assumes is $500 |
| Disk | `df -h .` | 97 GiB free |

Optional, only for WP7 or re-preparing review versions: `glab auth status`.

## 3. Decisions to make before starting (write them down; the lead copies them into `CAMPAIGN.md`)

1. Campaign id: `2026-09-29_R1`, e.g. `2026-09-29-c1`.
2. Budget ceiling in USD and where you read your usage (**TBD** in [08 §5](08-safety-and-rollback.md#5-post-incident-audit)). I'm using claude team x5 with subscription
3. The channel where the lead escalates (a file path such as `gym/runs/<campaign-id>/OWNER-INBOX.md` works; the lead appends, you read). OK
4. Model for the lead and helpers (your `~/.claude/settings.json` sets `claude-fable-5-1` at `xhigh` for interactive sessions; the eval sandbox agent is pinned to `claude-opus-5-5` by the plan, [01 §3 T2](01-goals-and-metrics.md#t2-curated-benchmark-sweep)). claude-opus-5-5 for a lead, claude-sonnet-5-5 for helpers, effort=hight
5. Whether the lead may `git push` the campaign branch to `origin` (default: no, do not remove drop already commited data. If need to rollback create a separate branch).
6. Whether the lead may install candidates into an **isolated** Claude config for smoke tests (default: no; never the normal config). Mostly not. Why?
7. Fix `CLAUDE.md:115` ("751 tests" → 751) yourself if you want; the lead may not edit `CLAUDE.md`. Fixed

## 4. Starting the lead

**Unattended (recommended when you are away).** The supervisor runs the lead as headless
sessions. It restarts the lead on failures, keeps each session up to the context limits,
and kills and rolls back on dangerous actions ([10-supervisor.md](10-supervisor.md)).
Commit or stash the staged `gym/planing` changes, create the campaign branch, then:

```
node --test gym/plan/supervisor/test/*.test.mjs                      # 96 tests, all must pass
node gym/plan/supervisor/supervise.mjs archive --campaign <id>       # copies volatile inputs; exit 1 names anything missing
node gym/plan/supervisor/supervise.mjs run --campaign <id> --dry-run --budget-usd <n>   # prints the exact claude argv
export GYM_NOTIFY_CMD='<your command; the text is in $GYM_MESSAGE>'   # optional: halts reach your phone
nohup node gym/plan/supervisor/supervise.mjs run --campaign <id> --budget-usd <n> > gym/runs/<id>/supervisor.out 2>&1 &
```

It keeps the Mac awake while a session runs (`caffeinate -i -w <pid>`), but it cannot
survive a reboot or a lid-close sleep. Keep the machine on power with the lid open, or run
it under `tmux`. Defaults (model `claude-opus-5-5` at `high`, soft 300k / hard 500k tokens,
$80 per session) are in `gym/plan/supervisor/defaults.json` and can be overridden by flags.

**Interactive (when you are at the keyboard).** Open a session at the repository root:

```
claude
```

and paste (fill the angle brackets):

```
You are the lead agent of the ambicode training campaign. Read gym/plan/README.md and follow its
reading order before any other action. Campaign id: <id>. Budget ceiling: $<n>. Owner channel:
<path or channel>. Push allowed: no. Install allowed: no. Start with iteration 0 exactly as
gym/plan/02-loop-protocol.md §2, then loop per §3. Stop on any condition in 03 §3 or 08 §1.
```

An interactive session has no guard unless you add `--settings gym/runs/<id>/supervisor/lead-settings.json`
(written by any supervisor run, including `--dry-run`) and export the same `GYM_*` variables the
supervisor sets (10 §1). The ambicode plugin's own hook injects its operating contract into every
session (`hooks/hooks.json`); that is expected and harmless.

## 5. While it runs

| What | Where | How often |
|---|---|---|
| Progress | `gym/runs/<id>/STATE.md` (one row per iteration) | any time |
| Spend | `jq -r '.costUsd' gym/runs/<id>/it-*/metrics.json \| paste -sd+ - \| bc` | daily |
| Questions for you | `gym/runs/<id>/labels/pending.md` | daily — each has a default and an expiry iteration; answer in `labels/labels.json` |
| Incidents | `gym/runs/<id>/incidents/`, and `gym/runs/<id>/STOP` if present | on any notification |
| Checkpoints | `gym/runs/<id>/cp-*.md` | at each checkpoint, read the go/no-go evidence |

Label answers use the rubric in `evals/evals-archived/typescript/adjudication.md`
(`actionable / correct-but-inert / unfounded / unverifiable`).

Things only you can do, queued from the audit ([00 §6](00-audit.md#6-open-questions)):
- Q5: in the FE repo, `npx tsc -p tsconfig.spec.json --noEmit 2>&1 | grep -c "error TS"` and the eslint check on `advanced-table.component.spec.ts`.
- Q7: one `findReferences` on `advanced-table-view.model.ts:14` in a fresh FE session with the LSP plugin on.
- Q3: label the 5 recordings' findings against `benchmarks/**/threads.json`.
- Run one more real cycle (investigate → plan → task) on an FE ticket after WP2 lands, so T4 has a second point; copy its transcripts into `gym/runs/<id>/archive/`.

## 6. Stopping, pausing, resuming, handing over

- **Stop now:** `touch gym/runs/<id>/STOP` (any shell). The supervisor terminates the running session within 2 s and exits; see [08 §2](08-safety-and-rollback.md#2-emergency-shutdown).
- **After a halt** (the supervisor wrote `STOP` itself: second guard kill, budget, or 3 sessions without progress): read `OWNER-INBOX.md`, `incidents/`, `git stash list` and `gym/runs/<id>/supervisor/guard.log`; fill the `## Audit` section of each incident (08 §5); then `rm gym/runs/<id>/STOP` and start the supervisor again with `--reset-violations` if you cleared the kills. It starts a fresh session; spend and history carry over in `supervisor/state.json`.
- **Resume in a new session:** the kickoff prompt of §4 with "reconstruct state per 06 §6 before anything" — the lead must not rely on memory.
- **Roll back:** [08 §3](08-safety-and-rollback.md#3-rollback-to-a-checkpoint); you can run it yourself.
- **Handover / end:** `CAMPAIGN.md` `status: done` plus `gym/runs/<id>/HANDOVER.md` (the lead writes it: accepted iterations, tags, what changed in the plugin, open labels, spend). To ship, follow `docs/release-checklist.md` yourself; the campaign does not release.

## 7. Guarantees and their limits

- No NDA content is committed: eval results, traces, recordings, snapshots and transcripts stay under gitignored `scratch/` and `archive/` ([06 §2](06-data-and-state.md#2-committed-vs-scratch)). Check with `git diff --cached --name-only` before you push anything.
- No publishing: every eval command runs with `--no-publish`; the harness script refuses `--publish-report`.
- The FE repository is never entered by an agent; its transcripts are used from copies.
- The plan cannot stop a model rollout from moving scores; the without-plugin arm is the drift detector, and S4 stops the loop when it moves.
- Costs in this plan are list-price estimates reported by `claude plugin eval` and the reviewer; compare with your usage page.

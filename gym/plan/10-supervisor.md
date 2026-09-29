# 10 — Supervisor, guard and context budget

How the lead runs unattended. A supervisor process outside Claude launches the lead
as headless sessions. It restarts the lead after failures and unexpected stops, and
terminates it on a dangerous action. A guard hook inside the session enforces
[08 §4](08-safety-and-rollback.md#4-security-constraints) and the context budget. Code:
`gym/plan/supervisor/` (policy, guard, supervisor, tests). This file replaces the manual
kickoff in [USER-GUIDE §4](USER-GUIDE.md#4-starting-the-lead) for unattended runs.

## 1. Components

| Piece | File | Runs as | Does |
|---|---|---|---|
| Supervisor | `supervisor/supervise.mjs` | owner's shell, outside Claude | launches, watches, classifies each session end, restarts / resumes / sleeps / halts, rolls back, writes incidents, notifies |
| Guard | `supervisor/guard.mjs` | Claude command hook on SessionStart, PreToolUse, PostToolUse, Stop, PreCompact | allows, denies or kills each tool call; scans tool output for credentials; measures context; blocks stops that are not at a safe point; re-primes after compaction |
| Policy | `supervisor/policy.mjs` | imported by both | pure rules, unit-tested |
| Defaults | `supervisor/defaults.json` | read by the supervisor | model, limits, forbidden roots, volatile inputs |
| Tests | `supervisor/test/*.test.mjs` | `node --test gym/plan/supervisor/test/*.test.mjs` | 96 tests: 79 policy cases, 8 guard-process cases, 9 supervisor scenarios against a stub `claude` |

The lead session is started as:
`claude -p <prompt> --session-id <uuid> | --resume <uuid>`, `--settings <generated hooks + permission denies>`,
`--setting-sources project,local` (no user plugins, hooks or MCP servers), `--strict-mcp-config` with an
empty server list, `--permission-mode dontAsk` (no prompts to hang on), `--allowedTools` from
`defaults.json`, `--max-budget-usd <per session>`, `--output-format stream-json`, and
`--plugin-dir <repo>` so the working-copy ambicode skills are available. Print the exact
argv with `--dry-run`.

## 2. Context budget

A cold start costs about 25k tokens for the plan alone (`cat gym/plan/*.md | wc -c` →
100,510 bytes on 2026-09-29), plus the reading an iteration needs. So the lead keeps one
session for several iterations and rolls over only at these limits:

| Level | Default | Measured how | Effect |
|---|---|---|---|
| soft | 300,000 tokens | guard, after every tool call: `input + cache_read + cache_creation` of the last assistant row in the session transcript | advice injected next to the tool result, repeated every 25k: finish this iteration, do not start another, then hand off |
| hard | 500,000 tokens | same | guard **denies new heavy starts**: sweeps (`evals-bench.mjs run`, `npm run evals*`), recordings, preflight, `claude plugin eval`, and helper spawns (`Agent`). Everything needed to finish and record the running step stays allowed |

Change the limits with `--soft` and `--hard`, or in `defaults.json`. For scale: one
3-iteration feature session reached 313,178 tokens without compaction. The limits are
the owner's choice (2026-09-29), not measured optima.

## 3. Safe points and the PHASE file

The lead writes `gym/runs/<id>/PHASE`: one line, `<it-NNN> <phase>`, at every step change of
[02 §3](02-loop-protocol.md#3-one-iteration).

| Phase | Safe to end the session? |
|---|---|
| `boot`, `select`, `brief`, `implement`, `gate`, `measure`, `decide`, `record` | **no** — the Stop hook refuses the stop and tells the lead to reach `record`, then `idle` |
| `idle` | only at or over the soft limit; below it the Stop hook sends the lead to the next iteration |
| `handoff` | yes — planned rollover; the supervisor starts a fresh session |
| `blocked` | yes — everything left waits on the owner; the supervisor exits and notifies |

The Stop hook never blocks twice in a row (`stop_hook_active`), so a lead that cannot
continue does stop, and the supervisor classifies the end (§4). A missing PHASE file counts
as `boot`.

## 4. What the supervisor does when a session ends

Checked in this order; the pure function is `superviseDecision` in `policy.mjs`.

| # | Observed | Action |
|---|---|---|
| 1 | `gym/runs/<id>/STOP` exists | exit; nothing restarts until the owner removes it |
| 2 | `CAMPAIGN.md` `status: done` | exit and notify |
| 3 | guard KILL marker | stash uncommitted plugin changes (`gym/runs/` excluded, commits kept), write `incidents/<ts>-<rule>.md`, notify; start a **fresh** session told to read the incident first. A killed session is never resumed. The 2nd kill in a campaign (`maxViolations`) → **halt** |
| 4 | spend ≥ 90 % of the budget (session costs + `it-*/metrics.json` `costUsd`) | halt |
| 5 | failed session whose output says usage/rate limit or overloaded | sleep 15 → 30 → 60 → 120 min, then resume |
| 6 | 3 consecutive sessions with no progress (no change to `STATE.md` or the campaign tags) | halt |
| 7 | clean end, PHASE `blocked` | exit and notify |
| 8 | clean end, PHASE `handoff`, or `idle` at/over soft | fresh session (planned rollover) |
| 9 | clean end anywhere else (unexpected stop) | resume the same session below hard; fresh above |
| 10 | crash, non-zero exit, error result, or watchdog (no output and no transcript write for 120 min) | resume on the first failure, fresh on the second |

**Halt** = write `STOP` with the reason, forget the session id (a halted or killed session is
never resumed), notify, exit 2. The owner restarts after review with `--reset-violations`. That is the only state that waits
for a human; every other failure is handled while the owner is away. A fresh session
reconstructs from disk ([06 §6](06-data-and-state.md#6-reconstructing-state-from-disk)); a
resumed one is told why it was resumed and to re-check `git status` and PHASE first.

## 5. Guard levels

| Level | Examples (all in `test/policy.test.mjs`) | Effect |
|---|---|---|
| allow | `npm run verify`, sweeps, `jq`, `git reset --hard gym/<id>/…`, writes inside the repo, worker worktrees `../ambicode-it-*`, temp | none |
| deny | `git push`, `curl`, web and MCP tools, `claude plugin eval` without `--no-publish`, nested `claude -p`, writes to `gym/plan/` (except `gym/plan/rev-*`), writes outside the allowed roots, the FE repo, `~/.claude` reads, `git stash drop`, global installs | the call is refused with a reason; the count is shown to the lead; the **5th denial in one session becomes a kill** |
| kill | `sudo`; reading or writing credential paths (`.ssh`, `.aws`, `.env`, keys, keychain); dumping the environment; writing the guard, `~/.claude`, Claude settings, git hooks or global git config; `--dangerously-skip-permissions`, `--settings`, `--bare`, killing the supervisor; `unset GYM_*`; piping to a shell, `base64 -d \| sh`, `eval`; uploads, `ssh`/`scp`/`nc`; `rm -rf` of `/`, `~`, the repo, `.git` or `benchmarks/`; `launchctl`, `crontab`, `osascript`; history rewrites; **a credential in any tool output** (the output is replaced before the model sees it) | `continue: false` stops the session at once, the KILL marker makes the supervisor terminate the process group within 2 s and run §4 row 3 |

Violations of each kind are logged to `gym/runs/<id>/supervisor/guard.log`. The guard fails
closed: if its environment is missing or it throws, the tool call is denied.

## 6. Verified behaviour

Real sessions on `claude-haiku` via `--settings`, 2026-09-29, $0.23 in total:

```
guard kill      cat <canary>/.env → PreToolUse kill, session ended; Stop hook did not fire; result still "success" (so the marker, not the exit code, is authoritative)
stop hook       stop at PHASE measure → blocked; the model set PHASE blocked and was allowed to stop
resume          -p --resume <id> rejoined the same session id and recalled the earlier command
supervisor e2e  kill → incident + fresh session; kill → stash of the edit, halt, STOP, 3 inbox lines; exit 2
```

## 7. Limits (read before trusting it)

- **The guard is a tripwire, not a sandbox.** It matches command text. A program that writes a file from inside Python or Node, or builds a command in a variable, can get past it. Obfuscation patterns are kill-level for that reason. The OS-level Claude sandbox (`sandbox` settings) would enforce file and network boundaries, but it is **not enabled**: it is untested with the nested eval harness, which needs network and its own sandboxes. TBD: an owner-run trial.
- **Auto-restart after a kill** is the owner's decision (2026-09-29). It replaces "no spend until a human clears it" ([08 §2](08-safety-and-rollback.md#2-emergency-shutdown)) for the first kill only. The second kill halts.
- Session cost comes from `total_cost_usd` of each headless session. Eval-harness spend comes from `metrics.json`. A sweep still running when a session dies is counted only if the lead recorded it.
- Subagents trip the same hooks (documented behaviour); the whole process group is terminated on a kill.
- The watchdog needs 120 min of silence; a hung sweep is caught late by design, because a T2 decision sweep takes about 50 min.
- Desktop notifications do not reach you when you are away. Set `GYM_NOTIFY_CMD` to your own command (for example a push-notification webhook) to get halts on your phone. It receives the text in `$GYM_MESSAGE`, and nothing is sent anywhere unless you set it.

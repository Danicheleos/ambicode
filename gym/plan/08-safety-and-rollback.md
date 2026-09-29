# 08 — Safety and rollback

Emergency shutdown, rollback to any checkpoint, security constraints, and the
post-incident audit. State layout is in [06](06-data-and-state.md); stop conditions
that are about progress rather than safety are in
[03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate).

## 1. Triggers

Any one of these invokes §2 immediately, by whoever sees it (lead, verifier, auditor,
worker, human):

| # | Trigger | How it is detected |
|---|---|---|
| E1 | A command is about to, or did, write outside this repository's tree, `gym/runs/`, the scratchpad, or a worker worktree | `git status` in another repo; a path under `~/`, `/Users/KillBill/Documents/projects/inseer/`, `~/.claude/` in a tool input |
| E2 | Any publish: `claude plugin eval` without `--no-publish`, `--publish-report`, `ambicode view` publishing a comment, `glab` with a non-GET method, `git push` | tool input inspection; `evals-bench.mjs` refuses the first two by construction (`:586`) |
| E3 | A secret in a file under `gym/` or in a handoff: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `sk-ant-`, a `.env` body | `grep -rEn 'sk-ant-|OAUTH_TOKEN=|API_KEY=' gym/runs/` in the verifier's pass |
| E4 | `benchmarks/`, `evals/evals-core/cases/`, `evals/**/results/`, `.ambicode/`, `archive/`, `gym/runs/**/scratch` staged or committed | `git diff --cached --name-only`, `git log --stat -1` |
| E5 | Spend exceeds the ceiling, or one command's `costUsd` > $80 (≈ 4× a 1-run sweep) | result JSON `costUsd`, `record.log` |
| E6 | A destructive git or shell command outside the allowed list in §4 | tool input inspection |
| E7 | The plugin installed into the owner's normal Claude configuration changed (`~/.claude/ambicode-install/marketplace/`) without the owner asking | `ls -la ~/.claude/ambicode-install/marketplace/` mtime vs `CAMPAIGN.md` start |
| E8 | A helper reports a permission denial and asks another agent to do the denied thing | the handoff text (permission laundering; refuse and escalate) |

## 2. Emergency shutdown

**Automatic path (unattended runs).** The guard ([10 §5](10-supervisor.md#5-guard-levels)) turns a kill-level trigger into an immediate session stop, and the supervisor carries out steps 2–7 below itself: it terminates the process group, stashes uncommitted plugin changes, writes the incident, notifies, and restarts fresh. On the second kill in a campaign it halts, and the owner's decision (2026-09-29) replaces step 7's "no further spend" for the first kill only ([10 §4](10-supervisor.md#4-what-the-supervisor-does-when-a-session-ends)). The manual steps apply when a human or a role other than the guard invokes the stop.

Who may invoke: anyone in §1. Steps, in order, none skipped:

1. `touch gym/runs/<campaign-id>/STOP` — every role checks this before each tool call that spends or writes; presence ends the loop ([02 §1](02-loop-protocol.md#1-entry-conditions)).
2. Stop model spend: `pkill -f 'claude plugin eval'`; `pkill -f 'evals-record-core'`; `pkill -f 'evals-reviewer'`. List what was killed: `pgrep -fl 'plugin eval|evals-record|evals-reviewer'` must return nothing.
3. Freeze the tree: `git stash push -u -m "STOP <ts>"` **only if** `git status --short` shows changes; record the stash name. Do not reset yet.
4. Write `gym/runs/<campaign-id>/incidents/<ts>-<trigger>.md`: trigger id, the tool input or file that tripped it (quoted), the iteration, what was running (step 2 output), the stash name, the last accepted tag.
5. Commit the incident file alone: `git add gym/runs/<campaign-id>/incidents/ && git commit -m "gym <campaign-id>: STOP <trigger>"`.
6. Set `CAMPAIGN.md` `status: stopped` in the same commit or the next.
7. Notify the owner (channel in `CAMPAIGN.md`, TBD) with the incident file path. No further model spend until a human line clears it (03 §2).

For E2 (a publish) and E3 (a secret) additionally: record exactly what left the machine
(URL, comment id, file), because it may be cached or indexed even if deleted later; the
owner decides on revocation.

## 3. Rollback to a checkpoint

Targets: any tag `gym/<campaign-id>/it-NNN` or `cp-K`. Before anything destructive
(CLAUDE.md): look at what will be discarded.

```
T=gym/<campaign-id>/it-004                      # the target
git status --short                              # 1. what is uncommitted — read it
git diff --stat "$T"..HEAD -- . ':!gym'         # 2. what the rollback removes from the plugin
git log --oneline "$T"..HEAD                    # 3. which iterations are undone
git stash push -u -m "pre-rollback <ts>"        # 4. keep the uncommitted work retrievably (skip if step 1 was empty)
git reset --hard "$T"                           # 5. the rollback
git tag -l 'gym/<campaign-id>/*' | sort         # 6. tags survive; STATE.md rows after $T are marked rolled-back, not deleted
npm run verify                                  # 7. confirm the end state: exit 0, 751+/0 fail
npm run package:reproducible                    # 8. identical digest to the target's metrics.json G2 line
```

Then append to `STATE.md`: `rollback → <tag>, <ts>, reason, incident path`. History is
never rewritten: rolled-back iterations keep their directories and their `decision.md`
gains a `rolled-back-by:` line ([09 §3](09-replan.md#3-superseding-without-losing-history)).

Rolling back the installed plugin (only if the campaign installed one, which needs the
owner's line, USER-GUIDE §4): `node install-local.mjs install dist/ambicode-<previous>`
after rebuilding that version from its tag (`docs/installation.md`, "Upgrade and
uninstall"); confirm with `node install-local.mjs inspect`.

Rolling back state files only (no code): `git checkout <tag> -- gym/runs/<campaign-id>/STATE.md`
is **not** allowed; STATE.md is append-only.

## 4. Security constraints

**Secrets.** Never pass a token as an `EVAL_*` variable (the sandbox exposes them to the
agent and the report; plugin-evals docs `env` field). Never read `~/.claude/*.json`
credentials, `~/.ssh`, `~/.aws`, `.env`. The reviewer's env allowlist
(`src/review/claude-reviewer.ts:88`) is not to be widened by any WP.

**Network.** Only: model calls made by `claude`/`claude plugin eval`; `npm ci` from the
lockfile; `git fetch` from `origin`. No `glab` except `GET` through `audit-mrs.mjs` and
`prepare-reviews.mjs`, and only in WP7 with the owner's line. No `WebFetch` in workers.

**Destructive commands.** Allowed: `git reset --hard <campaign tag>` after §3 steps 1–4;
`git worktree remove <path>` for a worker worktree after its diff is captured;
`rm -rf` only under `gym/runs/<campaign-id>/*/scratch/`, the scratchpad, or a worker
worktree path. Forbidden: `git push`, `git push --force`, `git branch -D` on any branch
not `gym/<campaign-id>` or a worker branch, `git clean -fdx` at the repository root,
`rm -rf` of `benchmarks/`, `evals/`, `dist/`, `archive/`, `.ambicode/`, `node_modules/`
(reinstall with `npm ci` instead), any `sudo`, any write to `/Users/KillBill/Documents/projects/inseer/**`.

**Other repositories.** The FE repository is read by humans only. Agents never `cd` into
it. Its transcripts are used only from the archive copy ([06 §5](06-data-and-state.md#5-volatile-inputs-to-archive-before-iteration-1)).

**Publishing.** Every eval command carries `--no-publish`; `evals-bench.mjs` enforces
it. A bare `claude plugin eval .` runs the trigger suite only (manifest
`experimental.evals`, `.claude-plugin/plugin.json`), but is still not used; the npm
scripts are.

**Plugin installation.** The campaign does not install candidates into the owner's Claude
configuration unless USER-GUIDE §4 says the owner enabled it; then only with
`--config-dir <isolated dir>` for tests, and the normal configuration only on the owner's
explicit line per version.

## 5. Post-incident audit

Within the same session as the stop, or the next session before any other work:

1. Reconstruct from disk ([06 §6](06-data-and-state.md#6-reconstructing-state-from-disk)); confirm the incident file matches `git log -1`.
2. For E1/E4: `git log --all --stat` and `git stash list`; if NDA or off-scope content entered git, list the exact blobs; the owner decides on history rewriting (the only case where it is allowed, and only by the human).
3. For E2/E3: enumerate what left the machine and when; write the revocation checklist for the owner.
4. For E5: recompute spend from every `metrics.json` and `record.log`; compare with the owner's usage page (**TBD: where the owner reads usage**).
5. For E6/E7/E8: quote the tool input; identify which rule in this file or [04](04-orchestration.md) would have prevented it; if none, that is a replan trigger R8 ([09](09-replan.md)).
6. Append `## Audit` to the incident file: what happened, what was lost, what was changed to prevent it, and who cleared the resume. `STOP` is removed only by a human line, recorded in the same section.

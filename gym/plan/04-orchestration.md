# 04 — Orchestration

Roles, what each may and may not do, the handoff format, and how helpers report so the
lead can verify instead of trust. The loop these roles execute is
[02-loop-protocol.md](02-loop-protocol.md); the controls on the lead are
[05-anti-hallucination.md](05-anti-hallucination.md).

## 0. Topology

```text
human owner ──(labels, budget, STOP)──▶ lead ──▶ verifier (right hand, long-lived)
                                          ├──▶ auditor (right hand, long-lived)
                                          └──▶ worker-N (one per iteration, disposable, own worktree)
```

All agents run on this machine as Claude Code sessions or subagents of the lead. The
eval harness (`claude plugin eval`) spawns its own sandboxed children; those are not
roles here. Model for the lead and helpers: **TBD: owner's choice**; the lead records
`models.*` in every `metrics.json` ([06 §3](06-data-and-state.md#3-metricsjson-schema)).

## 1. Lead

Responsible for: selecting the next item, writing `brief.md`, spawning helpers, running
the decision table, writing `decision.md`, `STATE.md`, checkpoints, incidents.

May: run every command in [01](01-goals-and-metrics.md); commit and tag on
`gym/<campaign-id>`; `git reset --hard` to an accepted tag after the diff check;
create files under `gym/runs/`.

The guard ([10 §5](10-supervisor.md#5-guard-levels)) enforces the network, secret, publish and tamper rules below for the lead and every helper; subagent tool calls trip the same hooks.

May not: edit `src/`, `skills/`, `prompts/`, `policies/` directly (a worker does, so the
lead reviews a diff it did not write); edit `gym/plan/` (only [09](09-replan.md) does);
accept an iteration whose numbers the verifier has not reproduced; push; publish an
eval report; touch the FE repository; raise a limit or threshold; write to
`benchmarks/`, `.ambicode/config.yaml` (except through `ambicode init` in a fixture).

## 2. Verifier

Responsible for: independent re-measurement. Given `it-NNN/`, it re-runs `npm run
verify`, re-extracts every number in `metrics.json` from the result files with its own
`jq`/`node` commands, checks that every path cited in `brief.md` and `decision.md`
exists at the iteration's commit, and reports **agree / disagree per field**.

May: read everything; run G1–G3, `evals:score`, `jq`; run T1 when the lead's T1 result
dir is missing. May not: run T2 or T3 (spend); edit any file outside
`it-NNN/handoffs/verifier.md`; talk to a worker.

The verifier is long-lived across iterations (SendMessage to continue it) so it keeps
the baseline in context; it is respawned when its handoff misses a field twice (§5).

## 3. Workers

One per iteration, disposable. Spawned with the brief and nothing else (no history of
other iterations). Works in `git worktree add ../ambicode-it-NNN gym/<campaign-id>`
so the lead's tree stays clean; the lead merges by `git diff` + `git apply` or by
fast-forwarding the worktree branch, never by trusting the worker's summary.

May: edit only the globs in the brief; run `npm run typecheck`, `npm run test:unit`,
`npm run verify`; write tests. May not: run T1/T2/T3 (spend belongs to the lead), touch
`gym/`, `benchmarks/`, `.ambicode/`, `package.json` version; commit on the campaign
branch; install the plugin; call MCP servers; read `~/.claude/*.json`.

A worker's report is a diff, a `verify.log` and the list of tests it added. Prose that
describes behaviour without a test behind it is not accepted.

## 4. Auditor

Responsible for: [05](05-anti-hallucination.md) controls. Every 3 iterations and at
every checkpoint it re-reads [01](01-goals-and-metrics.md) and the last three
`decision.md`, and reports drift: claims without a file reference, metrics compared to
the wrong baseline, WP order skipped, scope creep in `diff.patch` against the brief's
globs, and label defaults taken silently. May read everything; may write only
`it-NNN/handoffs/auditor.md` and `labels/pending.md`.

## 5. Replacing a helper

| Trigger | Action |
|---|---|
| no report within the brief's time box (default 60 min worker, 20 min verifier) | one respawn with the identical brief; the stale handoff is kept and marked `timed-out` |
| handoff missing a required field (§6) twice | respawn; note in `decision.md` |
| handoff cites a non-existent path or a number not in any file | do not respawn blindly: the auditor checks the lead's brief first ([05 §5](05-anti-hallucination.md#5-red-flags)); then respawn |
| worker's diff touches files outside the brief | discard the worktree (`git worktree remove --force`), respawn with the globs restated |
| lead itself compacts or restarts | re-enter through [06 §6](06-data-and-state.md#6-reconstructing-state-from-disk); helpers are re-spawned from disk state, not from memory |

A respawned helper gets the same brief plus the previous handoff path; it must start by
stating what in that handoff it could not reproduce.

## 6. Handoff format

Every helper writes one Markdown file in `it-NNN/handoffs/<role>[-N].md`:

```markdown
# <role> handoff — it-NNN — <commit sha>
## Ran
- `<command>` → exit <n>, <wall s>; output file: <path>   (one line per command, in order)
## Numbers
| field | value | from (path:line or command) |
## Files touched (worker only)
- <path> (+a/−b)
## Could not do
- <step> — <why> (a skipped step is listed here, never omitted)
## Disagreements (verifier/auditor only)
| field | lead's value | mine | source of difference |
## Claims without evidence
- (must be empty; anything here blocks acceptance)
```

Rules: numbers come with their source; commands come with exit codes; "done" without an
output path is not done ("Never report a step as done that you skipped", CLAUDE.md).

## 7. How the lead verifies rather than trusts

1. Before reading a handoff's prose, open its `## Ran` output files and re-derive the two
   numbers the decision turns on.
2. `git diff --stat <last tag>..HEAD -- . ':!gym'` must list only the brief's globs.
3. The verifier's `## Disagreements` table must be empty or explained field by field; an
   unexplained disagreement is an inconclusive iteration, never an accept.
4. A worker's "tests added" list is checked against `git diff --name-only -- '*.test.*'`.
5. Any claim in a handoff about the FE repository, MCP servers, or human intent is
   discarded unless quoted from a file under `gym/runs/` or `labels/`.

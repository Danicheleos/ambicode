# Module: Plan check (a skill script; helper processes are an appendix)

## Purpose

Verify plan text mechanically before the human is asked to accept it. In v8 that is one thing:
**`plan check`**, the skill script `skills/plan/scripts/plan-check.mjs`, run by the plan route's
`plan-check` step. The process runner and the worker kinds of v7 are gone (C1, C5, C7). Subagents
(scout, collector, an LLM judge) are **proposed, not shipped**: they rest on unprobed platform facts
(P21) and on a plan eval that has not run (33 §4).

## Inputs

`steps/plan-body.md` of the task (the one model-writable file, 15 §1), the repository root, and the
step input every script gets: one JSON object on stdin `{task, skill, repositoryRoot, taskDir,
steps, args, params, revise, raisedBy, headless}` (12 §1).

## Outputs

One JSON object on stdout: a `worker {worker: plan-check, outcome: ran, ms, artifact: null, summary
{failed, anchorsBad, anchors?}}` ledger entry (kind `worker` in `kinds.ts`), and on failure `failed
{code: plan-check-failed, message, recoverable: true, revise {args, lastRound}}`. The script never
writes the ledger; the engine appends the entry before the failure.

## Workflow

### 1. `plan-check` step

```yaml
- id: plan-check
  actor: code
  run: ["evidence.notes.save(plan-draft, from: steps/plan-body.md)", "script(plan-check)"]
  produces: ["note{plan-draft}", worker]
  onFail: revise plan-write
```

The draft is saved first (D11), then the script runs. Code only, no model: every `path:LINE` or
`path:A-B` anchor outside code fences must name a file inside the repository that exists, with the
range within its line count. Anchors that fail are `outside-repository`, `missing-file` or
`line-out-of-range`. The first 10 bad anchors are listed to the model; the count is exact. A script
exit other than 0, a 60 s timeout or output that is not JSON fails the step (`script-failed`,
`script-output-invalid`).

**Rounds are route re-entry, not a loop inside the script (#42):** a failure sets `onFail: revise
plan-write`; `plan-write` has `repeat: 3`, so at most two revisions happen; the failures come back
as a section of the write step, with the "last revision" notice on the final round; what remains goes
into the plan's Known limitations and the report's Not verified. Quoted-identifier proximity,
acceptance-criteria mapping and duplicate-name checks are **not** performed (C8).

## Appendix: proposed after 33 §4 (not in the build)

| id | Runner | Tools | Why it might pay | What must be true first |
|---|---|---|---|---|
| `scout` | plugin subagent | Read, Grep, Glob, `$A map/refs` | the plan session peaked at 214k context (M20); a scout returns ≤ 8 KB | 33 §4's plan eval shows the main session's context or cost is the bottleneck (+$16–23 per decision for the arm, #59) |
| `collector` | plugin subagent | the bound MCP server's read tools | keeps JQL payloads out of the main context — the only mechanism that would, since capture reduces disk, not context (#47) | P21: a plugin subagent inherits the session's MCP servers (probe) |
| `plan-judge` | plugin subagent | Read | coverage judgment beyond the mechanical anchors | a calibrated judge (κ ≥ 0.6 on ≥ 60 labels, best-practices F-3) |

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| more than 10 bad anchors | lists the first 10 and the exact count; `repeat: 3` on `plan-write` still bounds the revisions |
| script crash or invalid output | `script-failed` / `script-output-invalid`; the step fails, not recoverable |

## What changes from v0.5.0

`plan check` is a skill script with route re-entry; no worker runner, `workers.approved` or `worker
run`; the `worker` step actor is gone.

## Open problems

- P21 Subagent MCP inheritance (for the appendix only).
- P22 Subagent cost is additive; nothing in the appendix ships without the plan eval.

# Module: Workers (helper processes; subagents as an appendix)

## Purpose

Run model-free or isolated work outside the main session where it has a measured scorer behind
it. In v2 that is one thing: **`plan check`**, a code-only verifier of plan text. The process runner
that the isolated reviewer already is becomes a shared runner. Subagents (scout, collector, an LLM
judge) are **proposed, not shipped**: they rest on unprobed platform facts (P21) and on a plan eval
that has not run (33 §4).

## Inputs

A worker definition (`workers/<id>.yaml`: argv template or module call, `tools`, `maxBudgetUsd`,
`maxTurns`, `outputSchema`); the route's proposal; the human's answer or `workers.approved`.

## Outputs

`.ambicode/task/<slug>/workers/<id>-<ts>.json`, schema-validated; ledger `worker {id, outcome:
ran|inline|skipped, costUsd?, ms, artifact}`.

## Workflow

### 1. Runner

One **process runner** (generalized from `claude-reviewer.ts`: allowlisted env, cwd, `--tools`,
`--json-schema`, output cap, failure reasons). A worker that needs no model (`plan check`) runs in
the CLI process itself. The `worker` route step prints a proposal; options *run* / *inline* / *skip*;
default and release **inline** (non-acting); `workers.approved: [id]` pre-answers *run*. Headless:
inline.

### 2. `plan check` (ships)

```
$A plan check --task <slug> [--from steps/plan-body.md | stdin]
```

Code only. Every existing path exists; every `:LINE` ≤ file length; every quoted identifier occurs
within ±3 lines of its anchor (the `anchors2.js` scorer from the real run, already written; prose
range anchors get the range check only, P26); every `AC-*` id from `requirements acs` is mapped in
the plan's table or listed under Not covered; no new exported name duplicates an existing one
(`$A find`). Output: `{anchors: {checked, bad[]}, acs: {mapped, unmapped[]}, duplicates[]}`; the plan
route feeds failures back, bounded to 2 rounds, then they go into the plan's Known limitations.

### 3. Proposal text (example, not a measurement)

```
Worker: plan-check — verifies anchors, AC coverage and duplicates in the plan text (no model).
Options: run | inline (default; the route runs the checks and shows the list) | skip
```

## Appendix: proposed after 33 §4 (not in v2's build)

| id | Runner | Tools | Why it might pay | What must be true first |
|---|---|---|---|---|
| `scout` | process | Read, Grep, Glob, `$A map/refs/find/relates` | the plan session peaked at 214k context (M20); a scout returns ≤ 8 KB | 33 §4's three-arm plan eval shows the main session's context or cost is the bottleneck |
| `collector` | Agent-tool subagent (plugin `agents/`) | the bound MCP server's read tools | keeps JQL payloads out of the main context | P21: a plugin subagent inherits the session's MCP servers (probe); otherwise capture already strips `search*` payloads (14 §3) |
| `plan-judge` | process | Read | AC coverage judgment beyond the mechanical count | a calibrated judge (κ ≥ 0.6 on ≥ 60 labels, best-practices F-3) |

## Interfaces

```ts
interface Workers { propose(id, task, input): Proposal; run(id, task, input): Promise<WorkerResult> }
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| `plan check` finds > 50 bad anchors | lists the first 50 and the count; the route still bounds at 2 rounds |
| schema invalid | `worker-output-invalid`; the route continues inline |

## What changes from v0.4.0

Process runner shared; `plan check`; `workers.approved`; the `worker` step kind.

## Open problems

- P21 Subagent MCP inheritance (for the appendix only).
- P22 Worker cost is additive; nothing in the appendix ships without the plan eval.

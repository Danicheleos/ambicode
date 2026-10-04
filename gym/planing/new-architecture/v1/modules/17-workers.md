# Module: Workers (subagents and helper processes)

## Purpose

Isolate context-heavy or trust-sensitive work from the main session: a read-only scout that builds
the map in its own context and returns a short artifact; a collector that reads tickets with MCP
tools only; a plan checker that verifies a plan mechanically and with a judge. Each runs only when
the human (or a config pre-approval) says so (D3). The isolated reviewer is the existing worker; the
module generalizes its runner.

## Inputs

- A worker definition: `workers/<id>.md` (shipped as a plugin `agents/` entry for Agent-tool
  workers) or a `claude -p` argv template (for process workers), with `tools`, `disallowedTools`,
  `model`, `maxTurns`, `maxBudgetUsd`, `systemPrompt`, `outputSchema`.
- A proposal from the route: what the worker would do, its inputs, its median measured cost.
- The human's answer, or `workers.approved: [...]` in config.

## Outputs

- An artifact under `.ambicode/task/<slug>/workers/<id>-<ts>.{json,md}`, schema-validated.
- Ledger `worker {id, outcome: ran|inline|skipped, costUsd?, ms, artifact}`.
- A one-line summary the route pastes into the next step.

## Workflow

### 1. Two runners

| Runner | Isolation | Has session MCP? | Used for |
|---|---|---|---|
| **process** (`claude -p`, like the reviewer) | full: own cwd (snapshot or repo), allowlisted env, `--tools`, `--strict-mcp-config` where available, `--json-schema` | no | scout, plan checker (code part needs no model at all) |
| **agent** (Claude Code `Agent` tool with a plugin `agents/<id>.md`) | tools restricted by frontmatter; shares the session's MCP servers (unverified: P21) | yes, if P21 holds | collector (needs Jira MCP) |

The route's `worker` step prints the proposal; the model asks the human (⏸ *run* / *do it inline* /
*skip*). On *run*: a process worker is spawned by the CLI (`$A worker run <id> --task <slug>`); an agent
worker is spawned by the model with the Agent tool and the plugin's agent name, and its hand-back is
saved by the model with `$A worker save <id> --task <slug>` (stdin), validated against the schema.

### 2. The workers

| id | Runner | Tools | Input | Output (schema) | Why it exists |
|---|---|---|---|---|---|
| `scout` | process | Read, Grep, Glob, Bash(`$A map/refs/find/relates` only) | the request, the AC list, the pass-2 map | `{files[{path, why, spans[]}], symbols[], conventions[], reuse[], unknowns[]}` ≤ 8 KB | M20: the plan session peaked at 214k context; reading in a scout keeps the main context for judgment. The "субагенты-разведчики" pattern from the harness notes. |
| `collector` | agent | the bound MCP server's read tools only | URLs/keys | the envelope v2 | keeps 28–53 KB JQL payloads out of the main context (real run: 53 KB for one broad query) |
| `plan-checker` | process; the code part runs with no model | code: `plan check`; judge: Read only | the plan text, the AC list, the repository | `{anchors: {checked, bad[]}, acs: {mapped, unmapped[]}, duplicates[], verdict}` | abstract 02 block C for prose results; real-run §8 D |

`plan check` (code, no model): every existing path exists; every `:LINE` ≤ file length; every quoted
identifier occurs within ±3 lines of its anchor (the `anchors2.js` scorer, already written); every
`AC-*` id from `requirements acs` is mapped or listed under Not covered; no new exported name
duplicates an existing one (`$A find`). The judge part (an LLM reading the plan against the ACs) is
optional and calibrated before it gates anything (best-practices F-3).

### 3. Proposal text

```
Worker: scout — reads the 9 mapped files and their importers in its own context and returns a
≤ 8 KB map. Tools: Read, Grep, Glob, ambicode map/refs. Median cost here: $0.21, 48 s (n=5).
Options: run | do it inline | skip (recorded as default-taken: inline)
```

Cost and duration come from this repository's `worker` ledger entries; with fewer than 3 runs the
line says "no history".

## Interfaces

```ts
interface Workers {
  propose(id, task, input): Proposal;
  run(id, task, input): Promise<WorkerResult>;        // process runner
  save(id, task, stdin): Promise<WorkerResult>;       // agent hand-back, validated
}
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| worker exceeds `maxBudgetUsd` / `maxTurns` | result `partial` with what it produced; the route continues inline |
| schema invalid | `worker-output-invalid`; the route continues inline and the report lists it |
| the human declines | `worker {outcome: inline}`; nothing else changes |
| headless | default is *inline* (never spend without a human), recorded as `default-taken` |

## What changes from v0.4.0

- The reviewer runner becomes the process runner. `agents/` directory added. Three worker
  definitions. `worker run|save` commands. A `workers.approved` config list.

## Open problems

- P21 Whether an Agent-tool subagent defined in a plugin inherits the session's MCP servers is not
  documented; the collector depends on it. Probe before building; fallback: the main session fetches,
  and the hook strips `search*` payloads to key + summary (14 §P8).
- P22 Worker cost is additive. The scout is justified only if it lowers the main session's cost or
  raises coverage on the plan eval (33 §4); it is proposed, never run by default.

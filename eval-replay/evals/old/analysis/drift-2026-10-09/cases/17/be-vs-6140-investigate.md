# be-vs-6140-investigate — 17 cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The first helper result is identical (13,745 bytes). Every run names all three truth files, but extras differ, giving precision 0.50/0.60/0.429. R2 has the best F1; R3 expands DTO/backup/helper scope. Later syntactic errors include persistent cd repo after cwd has changed and a path:130:260 span instead of path:130-260.

R1 is cheaper and smaller than R2/R3 but fails the precision floor. R3 takes more requests and returns 40,455 bytes versus 29,392/34,612. The common engine/map is not the origin of the extra final paths; model scope decisions and recoverable shell/operand errors are.

**Proposed intervention:** Carry explicit owner/helper/change roles from read output to the final file list. Print canonical span examples and cwd, and batch controller/helper/spec spans without re-changing directory. Preserve R2 precision while aiming at R1 resources.

These are trace-supported mechanisms and proposed interventions, not a claim of proven counterfactual causation. The first different request below is the first observable model drift; the final path-set differences are the first indisputable quality drift when intermediate evidence is similar.

## Input invariants and engine state

| Served item | Distinct recorded values |
|---|---:|
| promptHashes | 1 |
| contractHashes | 1 |
| stepHashes | 1 |
| mapHashes | 1 |

| Attempt | Model terminal | Engine exit | Engine completed | Map truth hits | Model step deliveries | Artifact errors |
|---|---|---|---|---:|---:|---:|
| [R1 e-eOhY9L](../../attempts/e-eOhY9L.md) | completed | done | true | 3 | 1 | 0 |
| [R2 e-E8D4oE](../../attempts/e-E8D4oE.md) | completed | done | true | 3 | 1 | 0 |
| [R3 e-k3BQtd](../../attempts/e-k3BQtd.md) | completed | done | true | 3 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.5000 | 0.6000 | 0.4286 | R2 = 0.6000 | ≥0.5400 | 0.1714; 28.6% | NO | Q |
| Historical-file F1 | 0.6667 | 0.7500 | 0.6000 | R2 = 0.7500 | ≥0.6750 | 0.1500; 20.0% | NO | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1446 | 0.1618 | 0.1736 | R1 = 0.1446 | ≤0.1591 | 0.0290; 20.0% | NO | B |
| Harness total cost $ | 0.1486 | 0.1658 | 0.1781 | R1 = 0.1486 | ≤0.1635 | 0.0295; 19.9% | NO | B |
| Judging cost $ | 0.0040 | 0.0040 | 0.0045 | 0.0040–0.0045 | — | 0.0006; info | unmeasured / info | B |
| Harness turns | 6 | 6 | 8 | R1, R2 = 6 | ≤6.60 | 2; 33.3% | NO | W |
| Model/API requests | 5 | 6 | 5 | R1, R3 = 5 | ≤5.50 | 1; 20.0% | NO | W |
| Tool calls | 5 | 5 | 7 | R1, R2 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Harness wall seconds | 29 | 27 | 29 | R2 = 27 | ≤29.70 | 2; 7.4% | yes | T |
| Agent duration seconds | 23.76 | 22.19 | 24.38 | R2 = 22.19 | ≤24.41 | 2.18; 9.8% | yes | T |
| API duration seconds | 21.25 | 19.42 | 22.20 | R2 = 19.42 | ≤21.36 | 2.78; 14.3% | NO | T |
| Scaffold/setup seconds | 3.57 | 2.43 | 2.58 | R2 = 2.43 | ≤2.67 | 1.14; 46.8% | NO | T |
| Time to first request seconds | 3.42 | 3.01 | 3.04 | R2 = 3.01 | ≤3.31 | 0.4180; 13.9% | NO | T |
| First context tokens | 18536 | 18538 | 18542 | R1 = 18536 | ≤20389.60 | 6; 0.0% | yes | B |
| Peak context tokens | 32212 | 34775 | 37385 | R1 = 32212 | ≤35433.20 | 5173; 16.1% | NO | B |
| Cache-created tokens | 24934 | 27497 | 30107 | 24934–30107 | — | 5173; info | unmeasured / info | B |
| Cache-read tokens | 107489 | 139481 | 116439 | 107489–139481 | — | 31992; info | unmeasured / info | B |
| Output tokens | 2338 | 2386 | 2988 | 2338–2988 | — | 650; info | unmeasured / info | B |
| Route-ready seconds | 1.09 | 0.8100 | 0.8790 | R2 = 0.8100 | ≤0.8910 | 0.2790; 34.4% | NO | T |
| Map layer ms | 483 | 371 | 412 | R2 = 371 | ≤408.10 | 112; 30.2% | NO | T |
| Tool-result bytes | 29392 | 34612 | 40455 | 29392–40455 | — | 11063; info | unmeasured / info | B |
| Reading request waves | 3 | 4 | 4 | 3–4 | — | 1; info | unmeasured / info | W |
| Single-path read waves | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Inferred read operands | 4 | 8 | 7 | 4–8 | — | 4; info | unmeasured / info | W |
| Distinct inferred requested files | 7 | 8 | 8 | 7–8 | — | 1; info | unmeasured / info | W |
| Truth files requested | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 7861 | 0 | 0–7861 | — | 7861; info | unmeasured / info | B |
| Regex-recognized helper read calls | 3 | 4 | 4 | 3–4 | — | 1; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 27506 | 27364 | 33493 | 27364–33493 | — | 6129; info | unmeasured / info | B |
| Helper operand refusals | 0 | 1 | 3 | R1 = 0 | ≤0 | 3; — | NO | E |
| Failed tool calls | 0 | 1 | 0 | R1, R3 = 0 | ≤0 | 1; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 0 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Final answer bytes | 3748 | 3693 | 4308 | 3693–4308 | — | 615; info | unmeasured / info | Q |
| Correct named files | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 3 | 2 | 4 | 2–4 | — | 2; info | unmeasured / info | Q |
| Delivered-map truth hits | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
| Engine model-step deliveries | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Artifact validation failures | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Harness aggregate score | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Harness passed flag (1=yes) | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Failed paid/deterministic graders | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | E |
| Paid graders skipped (1=yes) | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| AskUserQuestion calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger acceptances | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger declines | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Headless defaults taken | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Policy ledger entries | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Recorded compaction events | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine exit wall budget ms | 23456 | 21946 | 24086 | 21946–24086 | — | 2140; info | unmeasured / info | T |
| Engine reader receipts | 3 | 3 | 4 | 3–4 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 24927 | 27308 | 33493 | 24927–33493 | — | 8566; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 5 | 6 | 7 | 5–7 | — | 2; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-E8D4oE**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R2 e-E8D4oE. Eligible completed route candidates: R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.1446 | R2: 0.1618 | 0.1591 |
| Harness turns | R1, R2: 6 | R2: 6 | 6.60 |
| Model/API requests | R1, R3: 5 | R2: 6 | 5.50 |
| Harness wall seconds | R2: 27 | R2: 27 | 29.70 |
| Peak context tokens | R1: 32212 | R2: 34775 | 35433.20 |

If the eligible minimum exceeds the resource boundary, that joint goal has not been observed. Independent bests are aspiration points, not a synthetic run that already exists. Exact-path membership is an additional stability criterion, even when aggregate scores tie.

## Individual harness graders

The aggregate harness score can combine several judgments; it is not interchangeable with deterministic file F1. The investigation paid grader only requires a true-file hit, so a passing score can coexist with poor recall/precision. The no-peek graders count only inputs matching benchmark/preset/eval paths: "Bash called 0x" means zero matching forbidden calls, not zero total Bash calls. Missing paid judgments in the cost-capped campaign are not counted as passed. All original grader fields remain in each attempt JSON.

| Attempt | Grader | Passed | Score | Recorded explanation |
|---|---|---|---|---|
| R1 | names-a-true-file | true | — | judge votes: PASS PASS PASS |
| R1 | no-code-edit | true | — | Edit called 0x (expected 0..0) |
| R1 | no-code-write | true | — | Write called 0x (expected 0..0) |
| R1 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R1 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R1 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R1 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R2 | names-a-true-file | true | — | judge votes: PASS PASS PASS |
| R2 | no-code-edit | true | — | Edit called 0x (expected 0..0) |
| R2 | no-code-write | true | — | Write called 0x (expected 0..0) |
| R2 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R2 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R2 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R2 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R3 | names-a-true-file | true | — | judge votes: PASS PASS PASS |
| R3 | no-code-edit | true | — | Edit called 0x (expected 0..0) |
| R3 | no-code-write | true | — | Write called 0x (expected 0..0) |
| R3 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R3 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R3 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R3 | no-peek-read | true | — | Read called 0x (expected 0..0) |

## First drift, pair by pair

### R1 vs R2

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-eOhY9L/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read niosh service files"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `src/features/score-types/niosh/services/niosh-backup.service.ts`

Non-truth paths only in R2:

None.

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-eOhY9L/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read niosh service files",
      "dangerouslyDisableSandbox": false
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

None.

Non-truth paths only in R3:

- `src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read niosh service files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read niosh service files",
      "dangerouslyDisableSandbox": false
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

None.

Non-truth paths only in R3:

- `src/features/score-types/niosh/services/niosh-backup.service.ts`
- `src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/features/score-types/niosh/niosh.controller.spec.ts (existing/unspecified) | included; 4; 5 | included; 5; 5 | included; 5; 6 |
| src/features/score-types/niosh/niosh.controller.ts (existing/unspecified) | included; 4; 4 | included; 4; 3 | included; 3; 3 |
| src/features/score-types/niosh/niosh.service.ts (existing/unspecified) | included; 1; 1 | included; 1; 1 | included; 1; 1 |

Offline union of final path sets: R 100.0%, P 42.9%, F1 60.0%. Intersection: R 100.0%, P 60.0%, F1 75.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-eOhY9L](../../attempts/e-eOhY9L.md)
- [R2 e-E8D4oE](../../attempts/e-E8D4oE.md)
- [R3 e-k3BQtd](../../attempts/e-k3BQtd.md)


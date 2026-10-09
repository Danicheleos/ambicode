# be-vs-6140-task — 19 cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The first failure is deterministic and occurs before model editing: taskGround sees every configured check command as absent and exits blocked/no-check. All repetitions have zero patch, file recall, hunk recall and identifier recall. The model then receives an ended route, attempts a final explanation, and is stopped because generated Evidence/Not verified blocks were never delivered.

Resource drift is recovery churn, not productive implementation. Attempts vary between no read, direct stop-check reads, wrong-root reads, Glob/find recovery and ledger/report searches. Each has a stop-block; different tool failures, cache writes and explanatory text change cost/turns. Comparing the cheapest blocked attempt as a successful-task target would reward failure.

**Proposed intervention:** Configure honest runnable checks in the evaluation fixture, or define an explicit user-approved no-check task policy. On every terminal path deliver the generated report and its canonical file path, with one consistent recovery command. Current stop.ts already contains a post-run repair that supplies generated blocks; these traces do not validate that repair. Replay/check the terminal path offline before another task campaign.

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
| [R1 e-DyuEW4](../../attempts/e-DyuEW4.md) | completed | blocked | unset | 0 | 0 | 0 |
| [R2 e-7zFyfO](../../attempts/e-7zFyfO.md) | completed | blocked | unset | 0 | 0 | 0 |
| [R3 e-WnMVxt](../../attempts/e-WnMVxt.md) | completed | blocked | unset | 0 | 0 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Historical-file precision | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Historical-file F1 | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Existing-at-base recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Task identifier recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Agent trace cost $ | 0.0674 | 0.1107 | 0.0836 | R1 = 0.0674 | ≤0.0741 | 0.0433; 64.3% | NO | B |
| Harness total cost $ | 0.0674 | 0.1107 | 0.0836 | R1 = 0.0674 | ≤0.0741 | 0.0433; 64.3% | NO | B |
| Judging cost $ | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Harness turns | 3 | 6 | 6 | R1 = 3 | ≤3.30 | 3; 100.0% | NO | W |
| Model/API requests | 3 | 6 | 6 | R1 = 3 | ≤3.30 | 3; 100.0% | NO | W |
| Tool calls | 1 | 4 | 4 | R1 = 1 | ≤1.10 | 3; 300.0% | NO | W |
| Harness wall seconds | 16 | 19 | 19 | R1 = 16 | ≤17.60 | 3; 18.8% | NO | T |
| Agent duration seconds | 10.76 | 14.23 | 14.19 | R1 = 10.76 | ≤11.84 | 3.47; 32.3% | NO | T |
| API duration seconds | 9.47 | 12.83 | 12.80 | R1 = 9.47 | ≤10.42 | 3.36; 35.5% | NO | T |
| Scaffold/setup seconds | 4.71 | 4.72 | 4.69 | R3 = 4.69 | ≤5.16 | 0.0280; 0.6% | yes | T |
| Time to first request seconds | 2.05 | 4.43 | 2.24 | R1 = 2.05 | ≤2.25 | 2.38; 116.5% | NO | T |
| First context tokens | 18049 | 18052 | 18050 | R1 = 18049 | ≤19853.90 | 3; 0.0% | yes | B |
| Peak context tokens | 19255 | 19659 | 19788 | R1 = 19255 | ≤21180.50 | 533; 2.8% | yes | B |
| Cache-created tokens | 11977 | 20135 | 12510 | 11977–20135 | — | 8158; info | unmeasured / info | B |
| Cache-read tokens | 44091 | 93361 | 101657 | 44091–101657 | — | 57566; info | unmeasured / info | B |
| Output tokens | 1066 | 1148 | 1319 | 1066–1319 | — | 253; info | unmeasured / info | B |
| Route-ready seconds | — | — | — | unmeasured | — | — | unmeasured / info | T |
| Map layer ms | 17 | 17 | 20 | R1, R2 = 17 | ≤18.70 | 3; 17.6% | NO | T |
| Tool-result bytes | 728 | 1035 | 1035 | 728–1035 | — | 307; info | unmeasured / info | B |
| Reading request waves | 1 | 3 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 1 | 3 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 1 | 3 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Distinct inferred requested files | 1 | 2 | 2 | 1–2 | — | 1; info | unmeasured / info | W |
| Truth files requested | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 701 | 701 | 0–701 | — | 701; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 2 | 2 | R1 = 0 | ≤0 | 2; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 1 | 1 | 1 | R1, R2, R3 = 1 | ≤1.10 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Final answer bytes | 1213 | 1101 | 1205 | 1101–1213 | — | 112; info | unmeasured / info | Q |
| Correct named files | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | Q |
| Delivered-map truth hits | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine model-step deliveries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 319 | 318 | 317 | 317–319 | — | 2; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-DyuEW4**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-DyuEW4, R2 e-7zFyfO, R3 e-WnMVxt. Eligible completed route candidates: none. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.0674 | none | 0.0741 |
| Harness turns | R1: 3 | none | 3.30 |
| Model/API requests | R1: 3 | none | 3.30 |
| Harness wall seconds | R1: 16 | none | 17.60 |
| Peak context tokens | R1: 19255 | none | 21180.50 |

If the eligible minimum exceeds the resource boundary, that joint goal has not been observed. Independent bests are aspiration points, not a synthetic run that already exists. Exact-path membership is an additional stability criterion, even when aggregate scores tie.

## Individual harness graders

The aggregate harness score can combine several judgments; it is not interchangeable with deterministic file F1. The investigation paid grader only requires a true-file hit, so a passing score can coexist with poor recall/precision. The no-peek graders count only inputs matching benchmark/preset/eval paths: "Bash called 0x" means zero matching forbidden calls, not zero total Bash calls. Missing paid judgments in the cost-capped campaign are not counted as passed. All original grader fields remain in each attempt JSON.

| Attempt | Grader | Passed | Score | Recorded explanation |
|---|---|---|---|---|
| R1 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R1 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R1 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R1 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R2 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R2 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R2 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R2 | no-peek-read | true | — | Read called 0x (expected 0..0) |
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
    "call": 2,
    "name": "Bash",
    "input": {
      "command": "cat .ambicode/task/NIOSH-12/stop-check.md || cat repo/.ambicode/task/NIOSH-12/stop-check.md",
      "description": "Read stop-check file"
    }
  },
  "b": {
    "call": 2,
    "name": "Bash",
    "input": {
      "command": "cat /private/tmp/e-7zFyfO/home/cwd/.ambicode/task/NIOSH-12/stop-check.md",
      "description": "Read the stop-check file"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

None.

Non-truth paths only in R2:

None.

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 2,
    "name": "Bash",
    "input": {
      "command": "cat .ambicode/task/NIOSH-12/stop-check.md || cat repo/.ambicode/task/NIOSH-12/stop-check.md",
      "description": "Read stop-check file"
    }
  },
  "b": {
    "call": 2,
    "name": "Bash",
    "input": {
      "command": "cat /private/tmp/e-WnMVxt/home/cwd/.ambicode/task/NIOSH-12/stop-check.md"
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

None.

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 2,
    "name": "Bash",
    "input": {
      "command": "cat /private/tmp/e-7zFyfO/home/cwd/.ambicode/task/NIOSH-12/stop-check.md",
      "description": "Read the stop-check file"
    }
  },
  "b": {
    "call": 2,
    "name": "Bash",
    "input": {
      "command": "cat /private/tmp/e-WnMVxt/home/cwd/.ambicode/task/NIOSH-12/stop-check.md"
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

None.

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/features/score-types/niosh/niosh.controller.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/features/score-types/niosh/niosh.controller.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/features/score-types/niosh/niosh.service.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-DyuEW4](../../attempts/e-DyuEW4.md)
- [R2 e-7zFyfO](../../attempts/e-7zFyfO.md)
- [R3 e-WnMVxt](../../attempts/e-WnMVxt.md)


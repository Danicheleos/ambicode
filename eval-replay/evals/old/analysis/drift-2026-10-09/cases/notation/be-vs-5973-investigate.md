# be-vs-5973-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

Frequency propagation spans multiple scoring families. Best-F1 R2 has 23/28 true files; R1 has 21 and R3 22. Relative to R2, R1 loses niosh.controller.ts and lm-carry.controller.spec.ts, while R3 loses the carry spec and adds a push-pull controller extra.

R1 is much cheaper ($0.17060, 27,292 tool bytes) than R2 ($0.28188, 58,078) and R3 ($0.29316, 74,830). R3 makes fewer API calls than R2 but has a larger context, demonstrating that batching/call count alone is an inadequate resource measure.

**Proposed intervention:** Use a deterministic family matrix for DTO/unit/validator/controller/spec obligations, then batch relevant spans. Preserve R2 coverage while seeking R1 resources; do not treat the union of all inferred change paths as an automatically correct answer.

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
| [R1 e-ZOoSSU](../../attempts/e-ZOoSSU.md) | completed | done | true | 5 | 1 | 0 |
| [R2 e-MG0sNP](../../attempts/e-MG0sNP.md) | completed | done | true | 5 | 1 | 0 |
| [R3 e-Jnm86M](../../attempts/e-Jnm86M.md) | completed | done | true | 5 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.7500 | 0.8214 | 0.7857 | R2 = 0.8214 | ≥0.7393 | 0.0714; 8.7% | yes | Q |
| Historical-file precision | 0.9545 | 0.9200 | 0.8800 | R1 = 0.9545 | ≥0.8591 | 0.0745; 7.8% | yes | Q |
| Historical-file F1 | 0.8400 | 0.8679 | 0.8302 | R2 = 0.8679 | ≥0.7811 | 0.0377; 4.3% | yes | Q |
| Existing-at-base recall | 0.7500 | 0.8214 | 0.7857 | R2 = 0.8214 | ≥0.7393 | 0.0714; 8.7% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1706 | 0.2819 | 0.2932 | R1 = 0.1706 | ≤0.1877 | 0.1226; 71.8% | NO | B |
| Harness total cost $ | 0.1779 | 0.2926 | 0.3020 | R1 = 0.1779 | ≤0.1957 | 0.1241; 69.7% | NO | B |
| Judging cost $ | 0.0073 | 0.0107 | 0.0088 | 0.0073–0.0107 | — | 0.0034; info | unmeasured / info | B |
| Harness turns | 6 | 10 | 10 | R1 = 6 | ≤6.60 | 4; 66.7% | NO | W |
| Model/API requests | 6 | 9 | 7 | R1 = 6 | ≤6.60 | 3; 50.0% | NO | W |
| Tool calls | 5 | 9 | 9 | R1 = 5 | ≤5.50 | 4; 80.0% | NO | W |
| Harness wall seconds | 40 | 53 | 52 | R1 = 40 | ≤44 | 13; 32.5% | NO | T |
| Agent duration seconds | 34.97 | 47.90 | 46.80 | R1 = 34.97 | ≤38.47 | 12.93; 37.0% | NO | T |
| API duration seconds | 29.20 | 41.78 | 41.11 | R1 = 29.20 | ≤32.12 | 12.59; 43.1% | NO | T |
| Scaffold/setup seconds | 3.21 | 3.05 | 3.04 | R3 = 3.04 | ≤3.34 | 0.1730; 5.7% | yes | T |
| Time to first request seconds | 3.09 | 2.77 | 2.96 | R2 = 2.77 | ≤3.04 | 0.3270; 11.8% | NO | T |
| First context tokens | 19492 | 19422 | 19424 | R2 = 19422 | ≤21364.20 | 70; 0.4% | yes | B |
| Peak context tokens | 34040 | 49485 | 56568 | R1 = 34040 | ≤37444 | 22528; 66.2% | NO | B |
| Cache-created tokens | 26762 | 42207 | 49290 | 26762–49290 | — | 22528; info | unmeasured / info | B |
| Cache-read tokens | 131143 | 260171 | 224196 | 131143–260171 | — | 129028; info | unmeasured / info | B |
| Output tokens | 3730 | 6098 | 5113 | 3730–6098 | — | 2368; info | unmeasured / info | B |
| Route-ready seconds | 1.27 | 1.26 | 0.9220 | R3 = 0.9220 | ≤1.01 | 0.3450; 37.4% | NO | T |
| Map layer ms | 631 | 562 | 491 | R3 = 491 | ≤540.10 | 140; 28.5% | NO | T |
| Tool-result bytes | 27292 | 58078 | 74830 | 27292–74830 | — | 47538; info | unmeasured / info | B |
| Reading request waves | 4 | 6 | 3 | 3–6 | — | 3; info | unmeasured / info | W |
| Single-path read waves | 2 | 1 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 8 | 18 | 20 | 8–20 | — | 12; info | unmeasured / info | W |
| Distinct inferred requested files | 21 | 25 | 19 | 19–25 | — | 6; info | unmeasured / info | W |
| Truth files requested | 14 | 13 | 11 | 11–14 | — | 3; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 52128 | 0–52128 | — | 52128; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 1 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 4516 | 8089 | 5967 | 4516–8089 | — | 3573; info | unmeasured / info | Q |
| Correct named files | 21 | 23 | 22 | 21–23 | — | 2; info | unmeasured / info | Q |
| Non-truth named files | 1 | 2 | 3 | 1–3 | — | 2; info | unmeasured / info | Q |
| Delivered-map truth hits | 5 | 5 | 5 | 5–5 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 34652 | 47410 | 46544 | 34652–47410 | — | 12758; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 55625 | 0–55625 | — | 55625; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 5 | 0–5 | — | 5; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 24 | 0–24 | — | 24; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-MG0sNP**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-ZOoSSU, R2 e-MG0sNP, R3 e-Jnm86M. Eligible completed route candidates: R1, R2, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.1706 | R1: 0.1706 | 0.1877 |
| Harness turns | R1: 6 | R1: 6 | 6.60 |
| Model/API requests | R1: 6 | R1: 6 | 6.60 |
| Harness wall seconds | R1: 40 | R1: 40 | 44 |
| Peak context tokens | R1: 34040 | R1: 34040 | 37444 |

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
      "command": "cd /private/tmp/e-ZOoSSU/home/cwd/repo && git ls-files | head -50; grep -rniE \"perminute|per_minute|frequencyUnit|frequency_unit\" --include=*.ts --include=*.tsx --include=*.json --include=*.sql -l . --exclude-dir=node_modules | head -60"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-MG0sNP/home/cwd/repo 2>/dev/null && pwd && git ls-files | wc -l && ls && grep -rli \"frequency\" src --include=*.ts | head -80"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

- `src/features/score-types/niosh/niosh.controller.ts`
- `src/features/score-types/lm-carry/lm-carry.controller.spec.ts`

Non-truth paths only in R1:

None.

Non-truth paths only in R2:

- `src/utils/ReportHelper.spec.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-ZOoSSU/home/cwd/repo && git ls-files | head -50; grep -rniE \"perminute|per_minute|frequencyUnit|frequency_unit\" --include=*.ts --include=*.tsx --include=*.json --include=*.sql -l . --exclude-dir=node_modules | head -60"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-Jnm86M/home/cwd/repo && ls && git ls-files | head -50 && git ls-files | wc -l",
      "description": "List repository files"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

- `src/features/score-types/niosh/niosh.controller.ts`

Non-truth paths only in R1:

None.

Non-truth paths only in R3:

- `src/utils/ReportHelper.spec.ts`
- `src/features/score-types/lm-push-pull/lm-push-pull.controller.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-MG0sNP/home/cwd/repo 2>/dev/null && pwd && git ls-files | wc -l && ls && grep -rli \"frequency\" src --include=*.ts | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-Jnm86M/home/cwd/repo && ls && git ls-files | head -50 && git ls-files | wc -l",
      "description": "List repository files"
    }
  }
}
```

Correct paths only in R2:

- `src/features/score-types/lm-carry/lm-carry.controller.spec.ts`

Correct paths only in R3:

None.

Non-truth paths only in R2:

None.

Non-truth paths only in R3:

- `src/features/score-types/lm-push-pull/lm-push-pull.controller.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/api/validators/ReportValidators.ts (existing/unspecified) | included; 2; 5 | included; 2; 5 | included; 2; 5 |
| src/features/score-types/est/services/est-niosh.service.spec.ts (existing/unspecified) | omitted; 2; — | omitted; 2; — | omitted; —; — |
| src/features/score-types/est/services/est-niosh.service.ts (existing/unspecified) | omitted; 2; 3 | omitted; 2; — | omitted; 2; 3 |
| src/features/score-types/lm-carry/lm-carry.controller.spec.ts (existing/unspecified) | omitted; —; — | included; 2; — | omitted; 6; — |
| src/features/score-types/lm-carry/mocks/lm-carry.mocks.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| src/features/score-types/lm-carry/models/dto/lm-carry-data.dto.ts (existing/unspecified) | included; 2; 4 | included; 2; — | included; 2; — |
| src/features/score-types/lm-carry/validators/lm-carry.validators.ts (existing/unspecified) | included; 2; 4 | included; 2; 8 | included; 2; — |
| src/features/score-types/lm-lift/lm-lift.controller.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/features/score-types/lm-lift/mocks/lm-lift.mocks.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| src/features/score-types/lm-lift/models/dto/lm-lift-data.dto.ts (existing/unspecified) | included; 2; 3 | included; 2; — | included; 2; — |
| src/features/score-types/lm-lift/validators/lm-lift.validators.ts (existing/unspecified) | included; 2; 3 | included; 2; 5 | included; 2; — |
| src/features/score-types/lm-lower/lm-lower.controller.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/features/score-types/lm-lower/mocks/lm-lower.mocks.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| src/features/score-types/lm-lower/models/dto/lm-lower-data.dto.ts (existing/unspecified) | included; 2; 5 | included; 2; — | included; 2; — |
| src/features/score-types/lm-lower/validators/lm-lower.validators.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| src/features/score-types/lm-push-pull/lm-push-pull.controller.spec.ts (existing/unspecified) | included; —; — | included; 2; — | included; 6; — |
| src/features/score-types/lm-push-pull/mocks/lm-push-pull.mocks.ts (existing/unspecified) | included; —; — | included; 2; — | included; 6; — |
| src/features/score-types/lm-push-pull/models/dto/lm-push-pull-data.dto.ts (existing/unspecified) | included; 2; 3 | included; 2; 5 | included; 3; 3 |
| src/features/score-types/lm-push-pull/validators/lm-push-pull.validators.ts (existing/unspecified) | included; 4; 4 | included; 2; 5 | included; 3; 3 |
| src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts (existing/unspecified) | included; 2; 3 | included; 2; 4 | included; 2; 3 |
| src/features/score-types/niosh/niosh.controller.spec.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| src/features/score-types/niosh/niosh.controller.ts (existing/unspecified) | omitted; 3; — | included; 2; 4 | included; 4; 5 |
| src/features/score-types/niosh/niosh.service.ts (existing/unspecified) | omitted; 3; — | omitted; 6; 8 | omitted; —; — |
| src/features/score-types/niosh/validators/niosh.validators.ts (existing/unspecified) | included; 2; 3 | included; 2; 4 | included; 2; 3 |
| src/features/vlm/models/dto/vlm-data.dto.ts (existing/unspecified) | included; 2; 3 | included; 2; 4 | included; 6; 9 |
| src/features/vlm/schemas/vlm-data.schema.ts (existing/unspecified) | included; 2; 3 | included; 2; 4 | included; 6; 9 |
| src/models/Scoring.ts (existing/unspecified) | included; 2; 4 | included; 2; 3 | included; 2; 3 |
| src/models/UnitOfMeasure.ts (existing/unspecified) | included; 2; — | included; 2; 3 | included; 2; 3 |

Offline union of final path sets: R 82.1%, P 88.5%, F1 85.2%. Intersection: R 75.0%, P 95.5%, F1 84.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-ZOoSSU](../../attempts/e-ZOoSSU.md)
- [R2 e-MG0sNP](../../attempts/e-MG0sNP.md)
- [R3 e-Jnm86M](../../attempts/e-Jnm86M.md)


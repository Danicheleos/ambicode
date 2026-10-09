# be-vs-4835-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

Recall/precision/F1 are identical (0.60/1.00/0.75), but the correct-file membership changes. R3 includes ReportController.ts that R1/R2 omit; the per-pair set differences below show the offsetting change. Constant aggregate metrics conceal an unstable implementation surface.

The initial git ls-files/head catalogue is around 18 KB in the larger attempts. R3 returns 65,094 total tool bytes versus 80,408/78,827, with seven rather than eight API calls. The route/map are identical; the catalogue and downstream reads differ.

**Proposed intervention:** Replace the broad catalogue with a small owner/integration inventory. Gate completion on requirement coverage, and track exact-path Jaccard/set changes as well as recall. All runs still miss 40% of historical paths, so stable numbers are not the quality goal.

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
| [R1 e-mIZgpy](../../attempts/e-mIZgpy.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-4b9DRy](../../attempts/e-4b9DRy.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-DLLL4O](../../attempts/e-DLLL4O.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.6000 | 0.6000 | 0.6000 | R1, R2, R3 = 0.6000 | ≥0.5400 | 0; 0.0% | yes | Q |
| Historical-file precision | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Historical-file F1 | 0.7500 | 0.7500 | 0.7500 | R1, R2, R3 = 0.7500 | ≥0.6750 | 0; 0.0% | yes | Q |
| Existing-at-base recall | 0.2727 | 0.2727 | 0.3636 | R3 = 0.3636 | ≥0.3273 | 0.0909; 25.0% | NO | Q |
| Created-file recall | 1 | 1 | 0.8889 | R1, R2 = 1 | ≥0.9000 | 0.1111; 11.1% | NO | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.3115 | 0.3009 | 0.2711 | R3 = 0.2711 | ≤0.2982 | 0.0404; 14.9% | NO | B |
| Harness total cost $ | 0.3265 | 0.3126 | 0.2796 | R3 = 0.2796 | ≤0.3075 | 0.0469; 16.8% | NO | B |
| Judging cost $ | 0.0150 | 0.0117 | 0.0085 | 0.0085–0.0150 | — | 0.0065; info | unmeasured / info | B |
| Harness turns | 8 | 10 | 10 | R1 = 8 | ≤8.80 | 2; 25.0% | NO | W |
| Model/API requests | 8 | 8 | 7 | R3 = 7 | ≤7.70 | 1; 14.3% | NO | W |
| Tool calls | 7 | 9 | 9 | R1 = 7 | ≤7.70 | 2; 28.6% | NO | W |
| Harness wall seconds | 50 | 56 | 53 | R1 = 50 | ≤55.00 | 6; 12.0% | NO | T |
| Agent duration seconds | 44.69 | 49.07 | 46.95 | R1 = 44.69 | ≤49.16 | 4.38; 9.8% | yes | T |
| API duration seconds | 33.06 | 37.17 | 36.76 | R1 = 33.06 | ≤36.37 | 4.11; 12.4% | NO | T |
| Scaffold/setup seconds | 3.61 | 5.09 | 3.49 | R3 = 3.49 | ≤3.83 | 1.60; 45.9% | NO | T |
| Time to first request seconds | 3.42 | 3.31 | 3.92 | R2 = 3.31 | ≤3.64 | 0.6170; 18.7% | NO | T |
| First context tokens | 20457 | 20456 | 20456 | R2, R3 = 20456 | ≤22501.60 | 1; 0.0% | yes | B |
| Peak context tokens | 59376 | 56996 | 51657 | R3 = 51657 | ≤56822.70 | 7719; 14.9% | NO | B |
| Cache-created tokens | 52098 | 49718 | 44379 | 44379–52098 | — | 7719; info | unmeasured / info | B |
| Cache-read tokens | 283811 | 273997 | 213399 | 213399–283811 | — | 70412; info | unmeasured / info | B |
| Output tokens | 4629 | 4720 | 5085 | 4629–5085 | — | 456; info | unmeasured / info | B |
| Route-ready seconds | 1.79 | 1.38 | 2.07 | R2 = 1.38 | ≤1.51 | 0.6920; 50.3% | NO | T |
| Map layer ms | 962 | 564 | 889 | R2 = 564 | ≤620.40 | 398; 70.6% | NO | T |
| Tool-result bytes | 80408 | 78827 | 65094 | 65094–80408 | — | 15314; info | unmeasured / info | B |
| Reading request waves | 4 | 4 | 3 | 3–4 | — | 1; info | unmeasured / info | W |
| Single-path read waves | 1 | 0 | 0 | 0–1 | — | 1; info | unmeasured / info | W |
| Inferred read operands | 15 | 16 | 14 | 14–16 | — | 2; info | unmeasured / info | W |
| Distinct inferred requested files | 19 | 15 | 11 | 11–19 | — | 8; info | unmeasured / info | W |
| Truth files requested | 6 | 6 | 3 | 3–6 | — | 3; info | unmeasured / info | W |
| Path-revisit bytes proxy | 18606 | 6086 | 0 | 0–18606 | — | 18606; info | unmeasured / info | B |
| Regex-recognized helper read calls | 2 | 0 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 35662 | 0 | 0 | 0–35662 | — | 35662; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 2 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 4911 | 5467 | 6527 | 4911–6527 | — | 1616; info | unmeasured / info | Q |
| Correct named files | 12 | 12 | 12 | 12–12 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | Q |
| Delivered-map truth hits | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 44263 | 48577 | 46437 | 44263–48577 | — | 4314; info | unmeasured / info | T |
| Engine reader receipts | 2 | 0 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Engine reader served bytes | 35134 | 0 | 0 | 0–35134 | — | 35134; info | unmeasured / info | B |
| Engine truncated reader operands | 4 | 0 | 0 | 0–4 | — | 4; info | unmeasured / info | W |
| Engine served file/span entries | 15 | 0 | 0 | 0–15 | — | 15; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R3 e-DLLL4O**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-mIZgpy, R2 e-4b9DRy, R3 e-DLLL4O. Eligible completed route candidates: R1, R2, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R3: 0.2711 | R3: 0.2711 | 0.2982 |
| Harness turns | R1: 8 | R1: 8 | 8.80 |
| Model/API requests | R3: 7 | R3: 7 | 7.70 |
| Harness wall seconds | R1: 50 | R1: 50 | 55.00 |
| Peak context tokens | R3: 51657 | R3: 51657 | 56822.70 |

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
      "command": "cd /private/tmp/e-mIZgpy/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -300 && git ls-files | wc -l",
      "description": "List repository files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-4b9DRy/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -300 && git ls-files | wc -l"
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
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-mIZgpy/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -300 && git ls-files | wc -l",
      "description": "List repository files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-DLLL4O/home/cwd/repo && git ls-files | head -300 && git ls-files | wc -l"
    }
  }
}
```

Correct paths only in R1:

- `src/features/score-types/lm-lower/services/lm-lower-backup.service.spec.ts`

Correct paths only in R3:

- `src/controllers/ReportController.ts`

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
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-4b9DRy/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -300 && git ls-files | wc -l"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-DLLL4O/home/cwd/repo && git ls-files | head -300 && git ls-files | wc -l"
    }
  }
}
```

Correct paths only in R2:

- `src/features/score-types/lm-lower/services/lm-lower-backup.service.spec.ts`

Correct paths only in R3:

- `src/controllers/ReportController.ts`

Non-truth paths only in R2:

None.

Non-truth paths only in R3:

None.

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/api/Report.ts (existing/unspecified) | included; 1; 6 | included; 1; 7 | included; 1; — |
| src/api/validators/ReportValidators.ts (existing/unspecified) | omitted; 1; 6 | omitted; 1; 8 | omitted; 1; — |
| src/controllers/ReportController.ts (existing/unspecified) | omitted; 1; 6 | omitted; 1; 8 | included; 1; 8 |
| src/features/score-types/lm-lift/lm-lift.controller.spec.ts (existing/unspecified) | omitted; 1; 7 | omitted; 1; 9 | omitted; 1; — |
| src/features/score-types/lm-lift/services/lm-lift-backup.service.spec.ts (existing/unspecified) | omitted; 1; — | omitted; 1; — | omitted; 1; — |
| src/features/score-types/lm-lower/lm-lower.controller.spec.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/lm-lower.controller.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/lm-lower.router.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/mocks/lm-lower.mocks.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/models/dto/lm-lower-data.dto.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/services/lm-lower-backup.service.spec.ts (created) | included; —; — | included; —; — | omitted; —; — |
| src/features/score-types/lm-lower/services/lm-lower-backup.service.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/services/lm-lower-manual-override.service.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-lower/validators/lm-lower.validators.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/reba-rula/reba/reba.controller.spec.ts (existing/unspecified) | omitted; 1; — | omitted; 1; — | omitted; 1; — |
| src/features/score-types/reba-rula/reba/services/reba-backup.service.spec.ts (existing/unspecified) | omitted; 1; — | omitted; 1; — | omitted; 1; — |
| src/features/score-types/reba-rula/rula/rula.controller.spec.ts (existing/unspecified) | omitted; 1; — | omitted; 1; — | omitted; 1; — |
| src/features/score-types/reba-rula/rula/services/rula-backup.service.spec.ts (existing/unspecified) | omitted; 1; — | omitted; 1; — | omitted; 1; — |
| src/models/Scoring.ts (existing/unspecified) | included; 2; 4 | included; 2; 6 | included; 2; 8 |
| src/utils/MlPipelineHelper.ts (existing/unspecified) | included; 2; 4 | included; 2; 6 | included; 2; 9 |

Offline union of final path sets: R 65.0%, P 100.0%, F1 78.8%. Intersection: R 55.0%, P 100.0%, F1 71.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-mIZgpy](../../attempts/e-mIZgpy.md)
- [R2 e-4b9DRy](../../attempts/e-4b9DRy.md)
- [R3 e-DLLL4O](../../attempts/e-DLLL4O.md)


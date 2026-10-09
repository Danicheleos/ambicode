# be-vs-4606-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The first searches choose different scoring/HAL/manual-override versus push-pull neighbourhoods. R2 later omits ReportController.ts, despite investigating report integration. R1 and R3 recover all 12 truth paths. The quality loss becomes observable in the final file set; the first search difference alone does not prove its cause.

R3 preserves the best F1 with 39,960 result bytes versus 61,675/64,124 in R1/R2. Its agent cost is $0.20525 versus $0.26351/$0.29467. Wider analog-feature reads add context without improving the scored file set.

**Proposed intervention:** Deliver a bounded owner/integration/analogue batch for a new scoring family. Keep the existing report integration obligation visible until the final answer; name proposed files separately from existing files. Use R3 as the quality-qualified cost/context witness.

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
| [R1 e-eLKH9I](../../attempts/e-eLKH9I.md) | completed | done | true | 2 | 1 | 0 |
| [R2 e-6sy6RK](../../attempts/e-6sy6RK.md) | completed | done | true | 2 | 1 | 0 |
| [R3 e-29oKNu](../../attempts/e-29oKNu.md) | completed | done | true | 2 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 1 | 0.9167 | 1 | R1, R3 = 1 | ≥0.9000 | 0.0833; 8.3% | yes | Q |
| Historical-file precision | 0.9231 | 0.9167 | 0.9231 | R1, R3 = 0.9231 | ≥0.8308 | 0.0064; 0.7% | yes | Q |
| Historical-file F1 | 0.9600 | 0.9167 | 0.9600 | R1, R3 = 0.9600 | ≥0.8640 | 0.0433; 4.5% | yes | Q |
| Existing-at-base recall | 1 | 0.7500 | 1 | R1, R3 = 1 | ≥0.9000 | 0.2500; 25.0% | NO | Q |
| Created-file recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2635 | 0.2947 | 0.2052 | R3 = 0.2052 | ≤0.2258 | 0.0894; 43.6% | NO | B |
| Harness total cost $ | 0.2762 | 0.3040 | 0.2121 | R3 = 0.2121 | ≤0.2334 | 0.0919; 43.3% | NO | B |
| Judging cost $ | 0.0127 | 0.0093 | 0.0069 | 0.0069–0.0127 | — | 0.0058; info | unmeasured / info | B |
| Harness turns | 9 | 11 | 8 | R3 = 8 | ≤8.80 | 3; 37.5% | NO | W |
| Model/API requests | 8 | 10 | 7 | R3 = 7 | ≤7.70 | 3; 42.9% | NO | W |
| Tool calls | 8 | 10 | 7 | R3 = 7 | ≤7.70 | 3; 42.9% | NO | W |
| Harness wall seconds | 50 | 52 | 42 | R3 = 42 | ≤46.20 | 10; 23.8% | NO | T |
| Agent duration seconds | 44.43 | 46.05 | 36.14 | R3 = 36.14 | ≤39.76 | 9.90; 27.4% | NO | T |
| API duration seconds | 35.47 | 38.58 | 29.66 | R3 = 29.66 | ≤32.63 | 8.92; 30.1% | NO | T |
| Scaffold/setup seconds | 3.58 | 3.75 | 3.60 | R1 = 3.58 | ≤3.94 | 0.1680; 4.7% | yes | T |
| Time to first request seconds | 3.79 | 3.44 | 4.11 | R2 = 3.44 | ≤3.78 | 0.6740; 19.6% | NO | T |
| First context tokens | 20801 | 20803 | 20737 | R3 = 20737 | ≤22810.70 | 66; 0.3% | yes | B |
| Peak context tokens | 49670 | 51884 | 40044 | R3 = 40044 | ≤44048.40 | 11840; 29.6% | NO | B |
| Cache-created tokens | 42392 | 44606 | 32766 | 32766–44606 | — | 11840; info | unmeasured / info | B |
| Cache-read tokens | 228337 | 306523 | 173221 | 173221–306523 | — | 133302; info | unmeasured / info | B |
| Output tokens | 4824 | 5490 | 3951 | 3951–5490 | — | 1539; info | unmeasured / info | B |
| Route-ready seconds | 1.88 | 1.78 | 1.84 | R2 = 1.78 | ≤1.95 | 0.1030; 5.8% | yes | T |
| Map layer ms | 1132 | 1072 | 1076 | R2 = 1072 | ≤1179.20 | 60; 5.6% | yes | T |
| Tool-result bytes | 61675 | 64124 | 39960 | 39960–64124 | — | 24164; info | unmeasured / info | B |
| Reading request waves | 4 | 6 | 4 | 4–6 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 0 | 1 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 15 | 19 | 10 | 10–19 | — | 9; info | unmeasured / info | W |
| Distinct inferred requested files | 13 | 19 | 18 | 13–19 | — | 6; info | unmeasured / info | W |
| Truth files requested | 4 | 4 | 4 | 4–4 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 3480 | 0 | 0 | 0–3480 | — | 3480; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Final answer bytes | 6687 | 5476 | 5384 | 5384–6687 | — | 1303; info | unmeasured / info | Q |
| Correct named files | 12 | 11 | 12 | 11–12 | — | 1; info | unmeasured / info | Q |
| Non-truth named files | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | Q |
| Delivered-map truth hits | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 44007 | 45679 | 35769 | 35769–45679 | — | 9910; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R3 e-29oKNu**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-eLKH9I, R2 e-6sy6RK, R3 e-29oKNu. Eligible completed route candidates: R1, R2, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R3: 0.2052 | R3: 0.2052 | 0.2258 |
| Harness turns | R3: 8 | R3: 8 | 8.80 |
| Model/API requests | R3: 7 | R3: 7 | 7.70 |
| Harness wall seconds | R3: 42 | R3: 42 | 46.20 |
| Peak context tokens | R3: 40044 | R3: 40044 | 44048.40 |

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
      "command": "cd /private/tmp/e-eLKH9I/home/cwd/repo && git ls-files | grep -i -E \"scoring|hal|override\" | head -100; ls"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-6sy6RK/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -5; ls; grep -rilE \"manuallyOverridden|pushpull|push_pull\" src | head -50"
    }
  }
}
```

Correct paths only in R1:

- `src/controllers/ReportController.ts`

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
      "command": "cd /private/tmp/e-eLKH9I/home/cwd/repo && git ls-files | grep -i -E \"scoring|hal|override\" | head -100; ls"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-29oKNu/home/cwd/repo && ls && git ls-files | grep -i -E \"scoring|override|lmpushpull|push-pull|pushpull|lm\" | head -150"
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
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-6sy6RK/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -5; ls; grep -rilE \"manuallyOverridden|pushpull|push_pull\" src | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-29oKNu/home/cwd/repo && ls && git ls-files | grep -i -E \"scoring|override|lmpushpull|push-pull|pushpull|lm\" | head -150"
    }
  }
}
```

Correct paths only in R2:

None.

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
| src/api/Report.ts (existing/unspecified) | included; 4; 6 | included; 1; 3 | included; 2; 3 |
| src/controllers/ReportController.ts (existing/unspecified) | included; 4; 6 | omitted; 1; 3 | included; 4; 6 |
| src/features/score-types/lm-push-pull/lm-push-pull.controller.spec.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/lm-push-pull.controller.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/lm-push-pull.router.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/mocks/lm-push-pull.mocks.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/models/dto/lm-push-pull-data.dto.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/services/lm-push-pull-backup.service.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/services/lm-push-pull-manual-override.service.ts (created) | included; —; — | included; —; — | included; —; — |
| src/features/score-types/lm-push-pull/validators/lm-push-pull.validators.ts (created) | included; —; — | included; —; — | included; —; — |
| src/models/Scoring.ts (existing/unspecified) | included; 1; 6 | included; 1; 3 | included; 1; 3 |
| src/utils/MlPipelineHelper.ts (existing/unspecified) | included; 4; 6 | included; 1; 3 | included; 2; 3 |

Offline union of final path sets: R 100.0%, P 92.3%, F1 96.0%. Intersection: R 91.7%, P 91.7%, F1 91.7%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-eLKH9I](../../attempts/e-eLKH9I.md)
- [R2 e-6sy6RK](../../attempts/e-6sy6RK.md)
- [R3 e-29oKNu](../../attempts/e-29oKNu.md)


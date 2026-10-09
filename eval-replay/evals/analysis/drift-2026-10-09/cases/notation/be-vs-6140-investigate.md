# be-vs-6140-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

All three runs start by receiving the same 13,745-byte service/manual-override/DTO batch and name all three true files. Precision diverges later: R1 lists only the three required controller/service/spec files; R2/R3 add ReportHelper, its spec and additional service/router paths. The first meaningful quality loss is unsupported final-scope expansion, not a different initial engine result.

R3 is cheaper and uses fewer API calls than R1, but precision is only 0.429 versus 1.00. It is an invalid quality-qualified cost target. R2 retains more helper/context output without gaining true files.

**Proposed intervention:** Record whether a file is a change owner, reused helper, or contextual evidence. Reuse the existing proposal-mirroring routine while verifying its controller entry points. Only R1 meets the joint quality floor.

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
| [R1 e-VhEGk1](../../attempts/e-VhEGk1.md) | completed | done | true | 3 | 1 | 0 |
| [R2 e-BK5z69](../../attempts/e-BK5z69.md) | completed | done | true | 3 | 1 | 0 |
| [R3 e-OXdoVc](../../attempts/e-OXdoVc.md) | completed | done | true | 3 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Historical-file precision | 1 | 0.5000 | 0.4286 | R1 = 1 | ≥0.9000 | 0.5714; 57.1% | NO | Q |
| Historical-file F1 | 1 | 0.6667 | 0.6000 | R1 = 1 | ≥0.9000 | 0.4000; 40.0% | NO | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1768 | 0.1950 | 0.1569 | R3 = 0.1569 | ≤0.1726 | 0.0381; 24.3% | NO | B |
| Harness total cost $ | 0.1815 | 0.1994 | 0.1608 | R3 = 0.1608 | ≤0.1769 | 0.0385; 24.0% | NO | B |
| Judging cost $ | 0.0047 | 0.0043 | 0.0039 | 0.0039–0.0047 | — | 0.0008; info | unmeasured / info | B |
| Harness turns | 7 | 9 | 5 | R3 = 5 | ≤5.50 | 4; 80.0% | NO | W |
| Model/API requests | 7 | 7 | 5 | R3 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Tool calls | 6 | 8 | 4 | R3 = 4 | ≤4.40 | 4; 100.0% | NO | W |
| Harness wall seconds | 34 | 34 | 27 | R3 = 27 | ≤29.70 | 7; 25.9% | NO | T |
| Agent duration seconds | 29.29 | 28.71 | 21.70 | R3 = 21.70 | ≤23.87 | 7.59; 35.0% | NO | T |
| API duration seconds | 26.27 | 25.38 | 18.06 | R3 = 18.06 | ≤19.87 | 8.21; 45.5% | NO | T |
| Scaffold/setup seconds | 2.76 | 3.81 | 2.67 | R3 = 2.67 | ≤2.93 | 1.14; 42.8% | NO | T |
| Time to first request seconds | 3.96 | 3.41 | 3.38 | R3 = 3.38 | ≤3.72 | 0.5810; 17.2% | NO | T |
| First context tokens | 18795 | 18728 | 18798 | R2 = 18728 | ≤20600.80 | 70; 0.4% | yes | B |
| Peak context tokens | 35530 | 40427 | 35162 | R3 = 35162 | ≤38678.20 | 5265; 15.0% | NO | B |
| Cache-created tokens | 28252 | 33149 | 27884 | 27884–33149 | — | 5265; info | unmeasured / info | B |
| Cache-read tokens | 164894 | 160922 | 111660 | 111660–164894 | — | 53234; info | unmeasured / info | B |
| Output tokens | 3075 | 3021 | 2305 | 2305–3075 | — | 770; info | unmeasured / info | B |
| Route-ready seconds | 1.26 | 0.9990 | 1.20 | R2 = 0.9990 | ≤1.10 | 0.2570; 25.7% | NO | T |
| Map layer ms | 588 | 383 | 612 | R2 = 383 | ≤421.30 | 229; 59.8% | NO | T |
| Tool-result bytes | 36110 | 46458 | 35161 | 35161–46458 | — | 11297; info | unmeasured / info | B |
| Reading request waves | 3 | 4 | 3 | 3–4 | — | 1; info | unmeasured / info | W |
| Single-path read waves | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Inferred read operands | 6 | 6 | 6 | 6–6 | — | 0; info | unmeasured / info | W |
| Distinct inferred requested files | 9 | 7 | 7 | 7–9 | — | 2; info | unmeasured / info | W |
| Truth files requested | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 1 | 2 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 13745 | 15965 | 29059 | 13745–29059 | — | 15314; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 1 | 0 | 0 | R2, R3 = 0 | ≤0 | 1; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 2 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Final answer bytes | 4664 | 4010 | 3751 | 3751–4664 | — | 913; info | unmeasured / info | Q |
| Correct named files | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 0 | 3 | 4 | 0–4 | — | 4; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 28949 | 28285 | 21341 | 21341–28949 | — | 7608; info | unmeasured / info | T |
| Engine reader receipts | 1 | 2 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Engine reader served bytes | 13745 | 21555 | 28286 | 13745–28286 | — | 14541; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 3 | 4 | 6 | 3–6 | — | 3; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-VhEGk1**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-VhEGk1. Eligible completed route candidates: R1. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R3: 0.1569 | R1: 0.1768 | 0.1726 |
| Harness turns | R3: 5 | R1: 7 | 5.50 |
| Model/API requests | R3: 5 | R1: 7 | 5.50 |
| Harness wall seconds | R3: 27 | R1: 34 | 29.70 |
| Peak context tokens | R3: 35162 | R1: 35530 | 38678.20 |

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
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read NIOSH service files",
      "dangerouslyDisableSandbox": false
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-BK5z69/home/cwd/repo 2>/dev/null && pwd && wc -l src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/est/services/est-niosh.service.ts src/features/score-types/niosh/niosh.controller.ts"
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

- `src/features/score-types/niosh/niosh.service.spec.ts`
- `src/utils/ReportHelper.ts`
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
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read NIOSH service files",
      "dangerouslyDisableSandbox": false
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-OXdoVc/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read NIOSH service files"
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

- `src/features/score-types/niosh/services/niosh-backup.service.ts`
- `src/utils/ReportHelper.ts`
- `src/utils/ReportHelper.spec.ts`
- `src/features/score-types/niosh/niosh.router.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-BK5z69/home/cwd/repo 2>/dev/null && pwd && wc -l src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/est/services/est-niosh.service.ts src/features/score-types/niosh/niosh.controller.ts"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-OXdoVc/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task NIOSH-12 src/features/score-types/niosh/niosh.service.ts src/features/score-types/niosh/services/niosh-manual-override.service.ts src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts",
      "description": "Read NIOSH service files"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `src/features/score-types/niosh/niosh.service.spec.ts`

Non-truth paths only in R3:

- `src/features/score-types/niosh/services/niosh-backup.service.ts`
- `src/features/score-types/niosh/niosh.router.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/features/score-types/niosh/niosh.controller.spec.ts (existing/unspecified) | included; 5; 6 | included; 6; 8 | included; 4; 4 |
| src/features/score-types/niosh/niosh.controller.ts (existing/unspecified) | included; 5; 5 | included; 1; 4 | included; 2; 2 |
| src/features/score-types/niosh/niosh.service.ts (existing/unspecified) | included; 1; 1 | included; 1; 2 | included; 1; 1 |

Offline union of final path sets: R 100.0%, P 37.5%, F1 54.5%. Intersection: R 100.0%, P 100.0%, F1 100.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-VhEGk1](../../attempts/e-VhEGk1.md)
- [R2 e-BK5z69](../../attempts/e-BK5z69.md)
- [R3 e-OXdoVc](../../attempts/e-OXdoVc.md)


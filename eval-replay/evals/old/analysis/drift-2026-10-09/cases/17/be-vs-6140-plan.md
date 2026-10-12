# be-vs-6140-plan — 17 cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R1/R2 name exactly the three historic controller/service/spec files, whereas R3 includes three additional DTO/backup-service/spec paths. R2 performs substantially more single-file discovery than R1. All three plan checks fail: respectively 5/9, 4/9 and 11/13 anchors are bad, while zero acceptance units are measured.

R1 has best file quality and lower cost/context than R2; R3 has fewer harness turns but precision 0.50. Plan check flags identifier-not-near and missing shorthand paths; some findings can be anchor-parser association errors, so inspect the preserved checker output rather than calling every anchor false. Explicit Accept preanswers promote the failed drafts without revision, as requested by this eval.

**Proposed intervention:** Batch the existing controller/service/spec and mirroring-helper spans once. Emit canonical structured anchors with path, range and identifier so the checker does not infer cross-bullet bindings. Keep accepted-with-failures separate from verified-valid; validate acceptance extraction for the inline ticket before treating zero unmapped units as completeness.

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
| [R1 e-28ntYR](../../attempts/e-28ntYR.md) | completed | done | true | 0 | 2 | 0 |
| [R2 e-fDJ5Iq](../../attempts/e-fDJ5Iq.md) | completed | done | true | 0 | 2 | 0 |
| [R3 e-KkKPkJ](../../attempts/e-KkKPkJ.md) | completed | done | true | 0 | 2 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Historical-file precision | 1 | 1 | 0.5000 | R1, R2 = 1 | ≥0.9000 | 0.5000; 50.0% | NO | Q |
| Historical-file F1 | 1 | 1 | 0.6667 | R1, R2 = 1 | ≥0.9000 | 0.3333; 33.3% | NO | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.3238 | 0.5047 | 0.3729 | R1 = 0.3238 | ≤0.3562 | 0.1809; 55.9% | NO | B |
| Harness total cost $ | 0.3272 | 0.5087 | 0.3764 | R1 = 0.3272 | ≤0.3599 | 0.1816; 55.5% | NO | B |
| Judging cost $ | 0.0033 | 0.0040 | 0.0035 | 0.0033–0.0040 | — | 0.0007; info | unmeasured / info | B |
| Harness turns | 20 | 30 | 17 | R3 = 17 | ≤18.70 | 13; 76.5% | NO | W |
| Model/API requests | 10 | 15 | 11 | R1 = 10 | ≤11 | 5; 50.0% | NO | W |
| Tool calls | 19 | 29 | 16 | R3 = 16 | ≤17.60 | 13; 81.3% | NO | W |
| Harness wall seconds | 65 | 93 | 74 | R1 = 65 | ≤71.50 | 28; 43.1% | NO | T |
| Agent duration seconds | 60.50 | 88.14 | 69.83 | R1 = 60.50 | ≤66.55 | 27.64; 45.7% | NO | T |
| API duration seconds | 55.50 | 79.54 | 59.95 | R1 = 55.50 | ≤61.05 | 24.04; 43.3% | NO | T |
| Scaffold/setup seconds | 3.06 | 2.96 | 2.39 | R3 = 2.39 | ≤2.63 | 0.6650; 27.8% | NO | T |
| Time to first request seconds | 1.45 | 1.89 | 1.36 | R3 = 1.36 | ≤1.50 | 0.5230; 38.3% | NO | T |
| First context tokens | 19824 | 20029 | 19962 | R1 = 19824 | ≤21806.40 | 205; 1.0% | yes | B |
| Peak context tokens | 53344 | 72667 | 58789 | R1 = 53344 | ≤58678.40 | 19323; 36.2% | NO | B |
| Cache-created tokens | 46066 | 65389 | 51511 | 46066–65389 | — | 19323; info | unmeasured / info | B |
| Cache-read tokens | 337030 | 675811 | 444458 | 337030–675811 | — | 338781; info | unmeasured / info | B |
| Output tokens | 7210 | 10790 | 7788 | 7210–10790 | — | 3580; info | unmeasured / info | B |
| Route-ready seconds | 0.4220 | 0.4140 | 0.3950 | R3 = 0.3950 | ≤0.4345 | 0.0270; 6.8% | yes | T |
| Map layer ms | 15 | 14 | 16 | R2 = 14 | ≤15.40 | 2; 14.3% | NO | T |
| Tool-result bytes | 61817 | 95994 | 74878 | 61817–95994 | — | 34177; info | unmeasured / info | B |
| Reading request waves | 6 | 10 | 7 | 6–10 | — | 4; info | unmeasured / info | W |
| Single-path read waves | 4 | 6 | 4 | 4–6 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 8 | 15 | 13 | 8–15 | — | 7; info | unmeasured / info | W |
| Distinct inferred requested files | 8 | 14 | 14 | 8–14 | — | 6; info | unmeasured / info | W |
| Truth files requested | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 2911 | 5270 | 0–5270 | — | 5270; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 7 | 10 | 4 | 4–10 | — | 6; info | unmeasured / info | W |
| Final answer bytes | 2978 | 3895 | 3230 | 2978–3895 | — | 917; info | unmeasured / info | Q |
| Correct named files | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 0 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | Q |
| Delivered-map truth hits | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine model-step deliveries | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Artifact validation failures | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Harness aggregate score | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Harness passed flag (1=yes) | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Failed paid/deterministic graders | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | E |
| Paid graders skipped (1=yes) | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| AskUserQuestion calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger acceptances | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Ledger declines | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Headless defaults taken | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Policy ledger entries | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Recorded compaction events | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine exit wall budget ms | 52819 | 75780 | 59480 | 52819–75780 | — | 22961; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-28ntYR**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-28ntYR, R2 e-fDJ5Iq. Eligible completed route candidates: R1, R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.3238 | R1: 0.3238 | 0.3562 |
| Harness turns | R3: 17 | R1: 20 | 18.70 |
| Model/API requests | R1: 10 | R1: 10 | 11 |
| Harness wall seconds | R1: 65 | R1: 65 | 71.50 |
| Peak context tokens | R1: 53344 | R1: 53344 | 58678.40 |

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
      "command": "cd /private/tmp/e-28ntYR/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -100; ls"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-fDJ5Iq/home/cwd/repo && git ls-files | head -100 && git ls-files | wc -l",
      "description": "List repository files"
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
      "command": "cd /private/tmp/e-28ntYR/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -100; ls"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-KkKPkJ/home/cwd/repo && git ls-files | head -200 && git ls-files | wc -l"
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
- `src/features/score-types/niosh/services/niosh-backup.service.ts`
- `src/features/score-types/niosh/services/niosh-backup.service.spec.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-fDJ5Iq/home/cwd/repo && git ls-files | head -100 && git ls-files | wc -l",
      "description": "List repository files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-KkKPkJ/home/cwd/repo && git ls-files | head -200 && git ls-files | wc -l"
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

- `src/features/score-types/niosh/models/dto/niosh-manual-override.dto.ts`
- `src/features/score-types/niosh/services/niosh-backup.service.ts`
- `src/features/score-types/niosh/services/niosh-backup.service.spec.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/features/score-types/niosh/niosh.controller.spec.ts (existing/unspecified) | included; 2; 15 | included; 4; 15 | included; 2; 9 |
| src/features/score-types/niosh/niosh.controller.ts (existing/unspecified) | included; 2; 7 | included; 4; 10 | included; 2; 3 |
| src/features/score-types/niosh/niosh.service.ts (existing/unspecified) | included; 2; 5 | included; 3; 5 | included; 2; 3 |

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-28ntYR](../../attempts/e-28ntYR.md)
- [R2 e-fDJ5Iq](../../attempts/e-fDJ5Iq.md)
- [R3 e-KkKPkJ](../../attempts/e-KkKPkJ.md)


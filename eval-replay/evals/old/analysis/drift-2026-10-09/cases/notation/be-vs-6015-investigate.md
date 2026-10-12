# be-vs-6015-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The identifier-poor ticket yields the same two true paths in all runs. R2 initially searches only task-name spellings, gets an empty result, then restarts with cataloguing and adds HeaderDecodeHelper. R1/R3 name four extras, R2 five. R3 additionally uses two malformed repo/src span operands.

R2 returns 60,449 tool bytes versus 39,515/41,852 in R1/R3; agent cost rises from $0.20190 to $0.23760. R3 spends another API request on recovery without a recall gain. These are observed dead ends; poor map coverage remains a separate shared limitation.

**Proposed intervention:** Normalize the ticket into behaviour/endpoint/data terms rather than inventing an identifier. Bound an empty-query retry, deliver valid operands, and require file-by-file change reasons. Use R1 as the best-F1 witness, but address the shared recall ceiling of 0.50.

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
| [R1 e-3rVMSl](../../attempts/e-3rVMSl.md) | completed | done | true | 1 | 1 | 0 |
| [R2 e-797LaN](../../attempts/e-797LaN.md) | completed | done | true | 1 | 1 | 0 |
| [R3 e-zYapeX](../../attempts/e-zYapeX.md) | completed | done | true | 1 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.5000 | 0.5000 | 0.5000 | R1, R2, R3 = 0.5000 | ≥0.4500 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.3333 | 0.2857 | 0.3333 | R1, R3 = 0.3333 | ≥0.3000 | 0.0476; 14.3% | NO | Q |
| Historical-file F1 | 0.4000 | 0.3636 | 0.4000 | R1, R3 = 0.4000 | ≥0.3600 | 0.0364; 9.1% | yes | Q |
| Existing-at-base recall | 0.5000 | 0.5000 | 0.5000 | R1, R2, R3 = 0.5000 | ≥0.4500 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2019 | 0.2376 | 0.2050 | R1 = 0.2019 | ≤0.2221 | 0.0357; 17.7% | NO | B |
| Harness total cost $ | 0.2063 | 0.2415 | 0.2084 | R1 = 0.2063 | ≤0.2269 | 0.0352; 17.1% | NO | B |
| Judging cost $ | 0.0044 | 0.0039 | 0.0034 | 0.0034–0.0044 | — | 0.0010; info | unmeasured / info | B |
| Harness turns | 15 | 10 | 11 | R2 = 10 | ≤11 | 5; 50.0% | NO | W |
| Model/API requests | 8 | 8 | 9 | R1, R2 = 8 | ≤8.80 | 1; 12.5% | NO | W |
| Tool calls | 14 | 9 | 10 | R2 = 9 | ≤9.90 | 5; 55.6% | NO | W |
| Harness wall seconds | 35 | 41 | 37 | R1 = 35 | ≤38.50 | 6; 17.1% | NO | T |
| Agent duration seconds | 30.28 | 36.12 | 31.70 | R1 = 30.28 | ≤33.31 | 5.84; 19.3% | NO | T |
| API duration seconds | 28.86 | 30.55 | 27.90 | R3 = 27.90 | ≤30.69 | 2.65; 9.5% | yes | T |
| Scaffold/setup seconds | 2.49 | 2.65 | 3.79 | R1 = 2.49 | ≤2.73 | 1.30; 52.5% | NO | T |
| Time to first request seconds | 2.15 | 2.45 | 2.28 | R1 = 2.15 | ≤2.37 | 0.3030; 14.1% | NO | T |
| First context tokens | 18586 | 18453 | 18517 | R2 = 18453 | ≤20298.30 | 133; 0.7% | yes | B |
| Peak context tokens | 37933 | 46694 | 37952 | R1 = 37933 | ≤41726.30 | 8761; 23.1% | NO | B |
| Cache-created tokens | 30655 | 39416 | 30674 | 30655–39416 | — | 8761; info | unmeasured / info | B |
| Cache-read tokens | 202386 | 207295 | 233272 | 202386–233272 | — | 30886; info | unmeasured / info | B |
| Output tokens | 3877 | 3844 | 3565 | 3565–3877 | — | 312; info | unmeasured / info | B |
| Route-ready seconds | 0.8210 | 0.9800 | 0.8710 | R1 = 0.8210 | ≤0.9031 | 0.1590; 19.4% | NO | T |
| Map layer ms | 360 | 496 | 358 | R3 = 358 | ≤393.80 | 138; 38.5% | NO | T |
| Tool-result bytes | 39515 | 60449 | 41852 | 39515–60449 | — | 20934; info | unmeasured / info | B |
| Reading request waves | 5 | 3 | 5 | 3–5 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 3 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Inferred read operands | 7 | 12 | 8 | 7–12 | — | 5; info | unmeasured / info | W |
| Distinct inferred requested files | 7 | 13 | 9 | 7–13 | — | 6; info | unmeasured / info | W |
| Truth files requested | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 12445 | 0–12445 | — | 12445; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 3 | 2 | 0–3 | — | 3; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 42688 | 12575 | 0–42688 | — | 42688; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 2 | R1, R2 = 0 | ≤0 | 2; — | NO | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 5 | 2 | 2 | 2–5 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 4257 | 3707 | 3115 | 3115–4257 | — | 1142; info | unmeasured / info | Q |
| Correct named files | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 4 | 5 | 4 | 4–5 | — | 1; info | unmeasured / info | Q |
| Delivered-map truth hits | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 30032 | 35859 | 31440 | 30032–35859 | — | 5827; info | unmeasured / info | T |
| Engine reader receipts | 0 | 3 | 2 | 0–3 | — | 3; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 42064 | 12575 | 0–42064 | — | 42064; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 2 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 15 | 2 | 0–15 | — | 15; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-3rVMSl**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-3rVMSl, R3 e-zYapeX. Eligible completed route candidates: R1, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.2019 | R1: 0.2019 | 0.2221 |
| Harness turns | R2: 10 | R3: 11 | 11 |
| Model/API requests | R1, R2: 8 | R1: 8 | 8.80 |
| Harness wall seconds | R1: 35 | R1: 35 | 38.50 |
| Peak context tokens | R1: 37933 | R1: 37933 | 41726.30 |

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
    "name": "Grep",
    "input": {
      "pattern": "task.?name|taskName|upload",
      "path": "/private/tmp/e-3rVMSl/home/cwd/repo",
      "-i": true,
      "output_mode": "count",
      "glob": "!node_modules"
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "task.?name|taskName",
      "path": "/private/tmp/e-797LaN/home/cwd/repo",
      "-i": true,
      "output_mode": "files_with_matches",
      "glob": "!node_modules"
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

- `src/utils/HeaderDecodeHelper.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "task.?name|taskName|upload",
      "path": "/private/tmp/e-3rVMSl/home/cwd/repo",
      "-i": true,
      "output_mode": "count",
      "glob": "!node_modules"
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "task[_ ]?name|taskName",
      "path": "/private/tmp/e-zYapeX/home/cwd/repo",
      "-i": true,
      "output_mode": "count",
      "glob": "!node_modules"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `src/api/ReportApi.spec.ts`

Non-truth paths only in R3:

- `src/api/middleware/sanitizers/sanitize.middleware.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "task.?name|taskName",
      "path": "/private/tmp/e-797LaN/home/cwd/repo",
      "-i": true,
      "output_mode": "files_with_matches",
      "glob": "!node_modules"
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "task[_ ]?name|taskName",
      "path": "/private/tmp/e-zYapeX/home/cwd/repo",
      "-i": true,
      "output_mode": "count",
      "glob": "!node_modules"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `src/api/ReportApi.spec.ts`
- `src/utils/HeaderDecodeHelper.ts`

Non-truth paths only in R3:

- `src/api/middleware/sanitizers/sanitize.middleware.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/api/Report.ts (existing/unspecified) | omitted; 5; 8 | omitted; 3; 7 | omitted; 6; 8 |
| src/api/validators/ReportValidators.ts (existing/unspecified) | included; 5; 7 | included; 3; 7 | included; 6; 8 |
| src/controllers/ReportController.ts (existing/unspecified) | included; 1; 4 | included; 3; 7 | included; 2; 4 |
| src/utils/ReportHelper.ts (existing/unspecified) | omitted; —; — | omitted; 6; — | omitted; —; — |

Offline union of final path sets: R 50.0%, P 25.0%, F1 33.3%. Intersection: R 50.0%, P 40.0%, F1 44.4%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-3rVMSl](../../attempts/e-3rVMSl.md)
- [R2 e-797LaN](../../attempts/e-797LaN.md)
- [R3 e-zYapeX](../../attempts/e-zYapeX.md)


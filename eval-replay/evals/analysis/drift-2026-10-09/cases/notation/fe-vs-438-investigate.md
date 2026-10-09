# fe-vs-438-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R1/R2 have an identical first helper command and 11,726-byte result. They first differ at tool 2; at tool 4 their translation-key searches expose four versus eight named locale paths. R2 lists six additional truth locales (de, ja, zh-CN, sk, pt, el). R3 receives a larger first helper result and later sees locale paths but still leaves those six out. Discovery and final expansion both drift.

R2 reaches recall 0.857 versus 0.429 in R1/R3 while returning fewer bytes (27,785 versus 32,714/37,246). Its extra call is productive. R3 batches more content without recovering the locale family in the answer.

**Proposed intervention:** After identifying a changed translation key, enumerate its matching locale files deterministically and retain that family in the final inventory. Read a representative value plus relevant component spans; avoid reading whole locale bodies. Preserve R2 quality with a bounded family receipt.

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
| [R1 e-nFOCKi](../../attempts/e-nFOCKi.md) | completed | done | true | 3 | 1 | 0 |
| [R2 e-yCneFb](../../attempts/e-yCneFb.md) | completed | done | true | 3 | 1 | 0 |
| [R3 e-dcQsDu](../../attempts/e-dcQsDu.md) | completed | done | true | 3 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.4286 | 0.8571 | 0.4286 | R2 = 0.8571 | ≥0.7714 | 0.4286; 50.0% | NO | Q |
| Historical-file precision | 0.5455 | 0.8000 | 0.5455 | R2 = 0.8000 | ≥0.7200 | 0.2545; 31.8% | NO | Q |
| Historical-file F1 | 0.4800 | 0.8276 | 0.4800 | R2 = 0.8276 | ≥0.7448 | 0.3476; 42.0% | NO | Q |
| Existing-at-base recall | 0.4286 | 0.8571 | 0.4286 | R2 = 0.8571 | ≥0.7714 | 0.4286; 50.0% | NO | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1642 | 0.1809 | 0.1659 | R1 = 0.1642 | ≤0.1806 | 0.0167; 10.2% | NO | B |
| Harness total cost $ | 0.1688 | 0.1852 | 0.1705 | R1 = 0.1688 | ≤0.1856 | 0.0164; 9.7% | yes | B |
| Judging cost $ | 0.0046 | 0.0043 | 0.0046 | 0.0043–0.0046 | — | 0.0003; info | unmeasured / info | B |
| Harness turns | 7 | 8 | 6 | R3 = 6 | ≤6.60 | 2; 33.3% | NO | W |
| Model/API requests | 6 | 7 | 5 | R3 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Tool calls | 6 | 6 | 5 | R3 = 5 | ≤5.50 | 1; 20.0% | NO | W |
| Harness wall seconds | 43 | 47 | 40 | R3 = 40 | ≤44 | 7; 17.5% | NO | T |
| Agent duration seconds | 33.26 | 37.59 | 31.11 | R3 = 31.11 | ≤34.22 | 6.48; 20.8% | NO | T |
| API duration seconds | 25.44 | 31.30 | 19.76 | R3 = 19.76 | ≤21.73 | 11.54; 58.4% | NO | T |
| Scaffold/setup seconds | 8.21 | 7.43 | 6.98 | R3 = 6.98 | ≤7.68 | 1.23; 17.7% | NO | T |
| Time to first request seconds | 5.80 | 4.33 | 4.40 | R2 = 4.33 | ≤4.76 | 1.48; 34.2% | NO | T |
| First context tokens | 18868 | 18794 | 18769 | R3 = 18769 | ≤20645.90 | 99; 0.5% | yes | B |
| Peak context tokens | 33960 | 33770 | 35958 | R2 = 33770 | ≤37147 | 2188; 6.5% | yes | B |
| Cache-created tokens | 26682 | 26492 | 28680 | 26492–28680 | — | 2188; info | unmeasured / info | B |
| Cache-read tokens | 139763 | 171284 | 123883 | 123883–171284 | — | 47401; info | unmeasured / info | B |
| Output tokens | 2945 | 4064 | 2634 | 2634–4064 | — | 1430; info | unmeasured / info | B |
| Route-ready seconds | 2.47 | 2.12 | 2.37 | R2 = 2.12 | ≤2.33 | 0.3510; 16.6% | NO | T |
| Map layer ms | 1805 | 1579 | 1817 | R2 = 1579 | ≤1736.90 | 238; 15.1% | NO | T |
| Tool-result bytes | 32714 | 27785 | 37246 | 27785–37246 | — | 9461; info | unmeasured / info | B |
| Reading request waves | 5 | 3 | 2 | 2–5 | — | 3; info | unmeasured / info | W |
| Single-path read waves | 3 | 1 | 0 | 0–3 | — | 3; info | unmeasured / info | W |
| Inferred read operands | 9 | 7 | 7 | 7–9 | — | 2; info | unmeasured / info | W |
| Distinct inferred requested files | 11 | 8 | 8 | 8–11 | — | 3; info | unmeasured / info | W |
| Truth files requested | 5 | 4 | 4 | 4–5 | — | 1; info | unmeasured / info | W |
| Path-revisit bytes proxy | 11774 | 7006 | 0 | 0–11774 | — | 11774; info | unmeasured / info | B |
| Regex-recognized helper read calls | 1 | 1 | 2 | 1–2 | — | 1; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 11726 | 11726 | 31723 | 11726–31723 | — | 19997; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 1 | 0 | R1, R3 = 0 | ≤0 | 1; — | NO | E |
| Parallel tool request waves | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Final answer bytes | 4037 | 3527 | 4140 | 3527–4140 | — | 613; info | unmeasured / info | Q |
| Correct named files | 6 | 12 | 6 | 6–12 | — | 6; info | unmeasured / info | Q |
| Non-truth named files | 5 | 3 | 5 | 3–5 | — | 2; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 32925 | 37321 | 30811 | 30811–37321 | — | 6510; info | unmeasured / info | T |
| Engine reader receipts | 1 | 1 | 2 | 1–2 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 11726 | 11726 | 31116 | 11726–31116 | — | 19390; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Engine served file/span entries | 4 | 4 | 8 | 4–8 | — | 4; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-yCneFb**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R2 e-yCneFb. Eligible completed route candidates: R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.1642 | R2: 0.1809 | 0.1806 |
| Harness turns | R3: 6 | R2: 8 | 6.60 |
| Model/API requests | R3: 5 | R2: 7 | 5.50 |
| Harness wall seconds | R3: 40 | R2: 47 | 44 |
| Peak context tokens | R2: 33770 | R2: 33770 | 37147 |

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

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 1; first different tool ordinal **2**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 2,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "ls; ls repo 2>/dev/null | head; ls repo/main/components/inputs/employee-select 2>/dev/null",
      "description": "List repo layout"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "ls /private/tmp/e-yCneFb/home/cwd/repo/main/components/inputs/employee-select/ /private/tmp/e-yCneFb/home/cwd/repo/main/components/inputs/employee-select/*/ 2>&1 | head -50",
      "description": "List employee-select directory"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

- `main/assets/i18n/de.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/el.json`

Non-truth paths only in R1:

- `main/components/inputs/employee-select/employee-select.component.stories.ts`
- `main/components/dialogs/employee-dialog/employee-dialog.component.spec.ts`

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
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/components/inputs/employee-select/directives/create-employee-button.directive.ts main/components/inputs/employee-select/employee-select.component.ts main/components/inputs/employee-select/employee-select.module.ts main/components/inputs/employee-select/mocks/mock-create-employee-button.directive.ts",
      "description": "Read employee-select files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/components/inputs/employee-select/directives/create-employee-button.directive.ts main/components/inputs/employee-select/mocks/mock-create-employee-button.directive.ts main/components/inputs/employee-select/employee-select.component.ts main/components/inputs/employee-select/employee-select.module.ts main/components/dialogs/employee-dialog/employee-dialog.component.ts",
      "description": "Read relevant employee-select files"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `main/components/dialogs/employee-dialog/employee-dialog.component.spec.ts`

Non-truth paths only in R3:

- `main/components/dialogs/employee-dialog/employee-dialog.component.html`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/components/inputs/employee-select/directives/create-employee-button.directive.ts main/components/inputs/employee-select/employee-select.component.ts main/components/inputs/employee-select/employee-select.module.ts main/components/inputs/employee-select/mocks/mock-create-employee-button.directive.ts",
      "description": "Read employee-select files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/components/inputs/employee-select/directives/create-employee-button.directive.ts main/components/inputs/employee-select/mocks/mock-create-employee-button.directive.ts main/components/inputs/employee-select/employee-select.component.ts main/components/inputs/employee-select/employee-select.module.ts main/components/dialogs/employee-dialog/employee-dialog.component.ts",
      "description": "Read relevant employee-select files"
    }
  }
}
```

Correct paths only in R2:

- `main/assets/i18n/de.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/el.json`

Correct paths only in R3:

None.

Non-truth paths only in R2:

None.

Non-truth paths only in R3:

- `main/components/inputs/employee-select/employee-select.component.stories.ts`
- `main/components/dialogs/employee-dialog/employee-dialog.component.html`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/i18n/de.json (existing/unspecified) | omitted; 4; — | included; 4; — | omitted; 4; — |
| main/assets/i18n/el.json (existing/unspecified) | omitted; —; — | included; 4; — | omitted; 4; — |
| main/assets/i18n/en.json (existing/unspecified) | included; —; — | included; 4; — | included; 4; — |
| main/assets/i18n/en.original.json (existing/unspecified) | included; 4; 5 | included; 4; — | included; 4; — |
| main/assets/i18n/es.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/ja.json (existing/unspecified) | omitted; 4; — | included; 4; — | omitted; 4; — |
| main/assets/i18n/pt.json (existing/unspecified) | omitted; —; — | included; 4; — | omitted; 4; — |
| main/assets/i18n/sk.json (existing/unspecified) | omitted; —; — | included; 4; — | omitted; 4; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | omitted; 4; — | included; 4; — | omitted; 4; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; 4; — |
| main/components/dialogs/employee-dialog/employee-dialog.component.ts (existing/unspecified) | included; —; 3 | included; —; 3 | included; 1; 1 |
| main/components/inputs/employee-select/employee-select.component.html (existing/unspecified) | included; 1; 3 | included; 1; 3 | included; 1; 3 |
| main/components/inputs/employee-select/employee-select.component.spec.ts (existing/unspecified) | included; —; 4 | included; —; 4 | included; 2; 3 |
| main/components/inputs/employee-select/employee-select.component.ts (existing/unspecified) | included; 1; 1 | included; 1; 1 | included; 1; 1 |

Offline union of final path sets: R 85.7%, P 66.7%, F1 75.0%. Intersection: R 42.9%, P 66.7%, F1 52.2%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-nFOCKi](../../attempts/e-nFOCKi.md)
- [R2 e-yCneFb](../../attempts/e-yCneFb.md)
- [R3 e-dcQsDu](../../attempts/e-dcQsDu.md)


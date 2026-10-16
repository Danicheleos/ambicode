# fe-vs-5164-investigate — 17 cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

All attempts name the same existing wizard truth file (recall 0.25); new backup paths remain model proposals rather than readable base files. R3 reads three delivered lead files first and names fewer extras, with precision 0.143 versus 0.10 in R1/R2. This is an observed association, not an isolated wording test.

R3 uses six harness turns versus eight and has the best F1, but R2 is cheaper and has smaller context. R3 still returns 56,475 tool bytes. The three attempts trade source coverage and answer proposal breadth rather than converging on one efficient best result.

**Proposed intervention:** Use one lifecycle/storage/server-precedence batch and a stable capability-oriented proposal schema. Keep a change inventory distinct from supporting DTO/facade/router evidence; compare new-capability quality alongside exact historic filenames.

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
| [R1 e-yUEGbO](../../attempts/e-yUEGbO.md) | completed | done | true | 1 | 1 | 0 |
| [R2 e-Gjo5tL](../../attempts/e-Gjo5tL.md) | completed | done | true | 1 | 1 | 0 |
| [R3 e-90gHWH](../../attempts/e-90gHWH.md) | completed | done | true | 1 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.2500 | 0.2500 | 0.2500 | R1, R2, R3 = 0.2500 | ≥0.2250 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.1000 | 0.1000 | 0.1429 | R3 = 0.1429 | ≥0.1286 | 0.0429; 30.0% | NO | Q |
| Historical-file F1 | 0.1429 | 0.1429 | 0.1818 | R3 = 0.1818 | ≥0.1636 | 0.0390; 21.4% | NO | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2465 | 0.2015 | 0.2257 | R2 = 0.2015 | ≤0.2217 | 0.0449; 22.3% | NO | B |
| Harness total cost $ | 0.2534 | 0.2065 | 0.2310 | R2 = 0.2065 | ≤0.2271 | 0.0469; 22.7% | NO | B |
| Judging cost $ | 0.0069 | 0.0050 | 0.0053 | 0.0050–0.0069 | — | 0.0020; info | unmeasured / info | B |
| Harness turns | 8 | 8 | 6 | R3 = 6 | ≤6.60 | 2; 33.3% | NO | W |
| Model/API requests | 8 | 7 | 5 | R3 = 5 | ≤5.50 | 3; 60.0% | NO | W |
| Tool calls | 7 | 7 | 5 | R3 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Harness wall seconds | 55 | 45 | 45 | R2, R3 = 45 | ≤49.50 | 10; 22.2% | NO | T |
| Agent duration seconds | 46.43 | 36.20 | 34.91 | R3 = 34.91 | ≤38.40 | 11.52; 33.0% | NO | T |
| API duration seconds | 32.06 | 26.01 | 26.59 | R2 = 26.01 | ≤28.61 | 6.05; 23.3% | NO | T |
| Scaffold/setup seconds | 6.85 | 7.05 | 7.50 | R1 = 6.85 | ≤7.54 | 0.6530; 9.5% | yes | T |
| Time to first request seconds | 4.73 | 4.22 | 5.23 | R2 = 4.22 | ≤4.64 | 1.01; 23.9% | NO | T |
| First context tokens | 19423 | 19494 | 19354 | R3 = 19354 | ≤21289.40 | 140; 0.7% | yes | B |
| Peak context tokens | 45996 | 40372 | 47634 | R2 = 40372 | ≤44409.20 | 7262; 18.0% | NO | B |
| Cache-created tokens | 38718 | 33094 | 40356 | 33094–40356 | — | 7262; info | unmeasured / info | B |
| Cache-read tokens | 236957 | 179420 | 140249 | 140249–236957 | — | 96708; info | unmeasured / info | B |
| Output tokens | 4416 | 3323 | 3620 | 3323–4416 | — | 1093; info | unmeasured / info | B |
| Route-ready seconds | 2.30 | 2.37 | 2.80 | R1 = 2.30 | ≤2.53 | 0.5050; 22.0% | NO | T |
| Map layer ms | 1607 | 1628 | 1805 | R1 = 1607 | ≤1767.70 | 198; 12.3% | NO | T |
| Tool-result bytes | 52663 | 41512 | 56475 | 41512–56475 | — | 14963; info | unmeasured / info | B |
| Reading request waves | 1 | 4 | 4 | 1–4 | — | 3; info | unmeasured / info | W |
| Single-path read waves | 0 | 3 | 0 | 0–3 | — | 3; info | unmeasured / info | W |
| Inferred read operands | 3 | 7 | 10 | 3–10 | — | 7; info | unmeasured / info | W |
| Distinct inferred requested files | 3 | 11 | 13 | 3–13 | — | 10; info | unmeasured / info | W |
| Truth files requested | 0 | 1 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 52012 | 0–52012 | — | 52012; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 1 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Final answer bytes | 6516 | 4654 | 5024 | 4654–6516 | — | 1862; info | unmeasured / info | Q |
| Correct named files | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 9 | 9 | 6 | 6–9 | — | 3; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 46186 | 35909 | 34462 | 34462–46186 | — | 11724; info | unmeasured / info | T |
| Engine reader receipts | 3 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Engine reader served bytes | 44746 | 0 | 49174 | 0–49174 | — | 49174; info | unmeasured / info | B |
| Engine truncated reader operands | 2 | 0 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Engine served file/span entries | 8 | 0 | 9 | 0–9 | — | 9; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R3 e-90gHWH**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R3 e-90gHWH. Eligible completed route candidates: R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.2015 | R3: 0.2257 | 0.2217 |
| Harness turns | R3: 6 | R3: 6 | 6.60 |
| Model/API requests | R3: 5 | R3: 5 | 5.50 |
| Harness wall seconds | R2, R3: 45 | R3: 45 | 49.50 |
| Peak context tokens | R2: 40372 | R3: 47634 | 44409.20 |

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
      "command": "cd /private/tmp/e-yUEGbO/home/cwd/repo && git ls-files | grep -i -E \"ge-adv|score-types/shared\" | head -80; grep -rniE \"indexeddb|idb|dexie|beforeunload|canDeactivate\" --include=*.ts --include=package.json . -l --exclude-dir=node_modules | head -20"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd repo && ls && git ls-files | grep -i -E \"ge-adv|wizard|score-types/shared\" | head -100"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `main/features/score-types/ge-adv/providers/ge-adv.provider.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `main/utils/forms/form-backup.ts`
- `main/guards/wizard-backup.guard.ts`

Non-truth paths only in R2:

- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts`
- `main/features/score-types/shared/directives/unsaved-changes.directive.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-yUEGbO/home/cwd/repo && git ls-files | grep -i -E \"ge-adv|score-types/shared\" | head -80; grep -rniE \"indexeddb|idb|dexie|beforeunload|canDeactivate\" --include=*.ts --include=package.json . -l --exclude-dir=node_modules | head -20"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-90gHWH/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/features/score-types/shared/services/wizard-auto-launch.service.ts main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts",
      "description": "Read lead files"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `main/features/score-types/ge-adv/providers/ge-adv.provider.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/utils/forms/form-backup.ts`
- `main/guards/wizard-backup.guard.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`

Non-truth paths only in R3:

- `main/features/score-types/shared/services/form-backup.service.ts`
- `main/features/score-types/shared/services/form-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form-backup.service.ts`
- `main/features/score-types/shared/guards/unsaved-form-changes.guard.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd repo && ls && git ls-files | grep -i -E \"ge-adv|wizard|score-types/shared\" | head -100"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-90gHWH/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/features/score-types/shared/services/wizard-auto-launch.service.ts main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts",
      "description": "Read lead files"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts`
- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts`
- `main/features/score-types/shared/directives/unsaved-changes.directive.ts`

Non-truth paths only in R3:

- `main/features/score-types/shared/services/form-backup.service.ts`
- `main/features/score-types/shared/services/form-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form-backup.service.ts`
- `main/features/score-types/shared/guards/unsaved-form-changes.guard.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing/unspecified) | included; 3; — | included; 2; 4 | included; 1; 1 |
| main/features/score-types/ge-adv/services/ge-adv-wizard-progress-saving.service.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/services/form-progress-saving.service.spec.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/services/form-progress-saving.service.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |

Offline union of final path sets: R 25.0%, P 5.6%, F1 9.1%. Intersection: R 25.0%, P 33.3%, F1 28.6%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-yUEGbO](../../attempts/e-yUEGbO.md)
- [R2 e-Gjo5tL](../../attempts/e-Gjo5tL.md)
- [R3 e-90gHWH](../../attempts/e-90gHWH.md)


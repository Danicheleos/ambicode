# fe-vs-5164-plan — 17 cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

All plans find only one of four historic paths. They invent different generic storage/backup module layouts, which the exact-new-path oracle penalizes. R1/R2 tie the best F1; R3 adds another non-truth file. All checks fail: 5/7, 14/21 and 13/15 bad anchors, with zero acceptance units measured. Explicit Accept closes and promotes drafts without revision.

R2 spends $0.71700, 171 wall seconds and 145,267 tool bytes versus R1 $0.33399, 85 seconds and 59,057 bytes, with no scored quality gain. Peak context grows from 54,451 to 102,308. R3 lies between them. Broader storage/design/source exploration and larger payloads are directly observed; their precise contribution to API cost versus caching is not a controlled intervention.

**Proposed intervention:** Start from a bounded wizard lifecycle/storage-precedent/server-input batch, use a concise decision and obligation schema, and generate canonical anchors. Assess new files by capability as well as exact path. Preserve acceptance semantics while returning a distinct accepted-with-failed-validation outcome.

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
| [R1 e-TTdy5z](../../attempts/e-TTdy5z.md) | completed | done | true | 0 | 2 | 0 |
| [R2 e-pFn1Sd](../../attempts/e-pFn1Sd.md) | completed | done | true | 0 | 2 | 0 |
| [R3 e-IReliw](../../attempts/e-IReliw.md) | completed | done | true | 0 | 2 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.2500 | 0.2500 | 0.2500 | R1, R2, R3 = 0.2500 | ≥0.2250 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.1111 | 0.1111 | 0.1000 | R1, R2 = 0.1111 | ≥0.1000 | 0.0111; 10.0% | yes | Q |
| Historical-file F1 | 0.1538 | 0.1538 | 0.1429 | R1, R2 = 0.1538 | ≥0.1385 | 0.0110; 7.1% | yes | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.3340 | 0.7170 | 0.5188 | R1 = 0.3340 | ≤0.3674 | 0.3830; 114.7% | NO | B |
| Harness total cost $ | 0.3378 | 0.7218 | 0.5231 | R1 = 0.3378 | ≤0.3716 | 0.3840; 113.7% | NO | B |
| Judging cost $ | 0.0038 | 0.0048 | 0.0043 | 0.0038–0.0048 | — | 0.0010; info | unmeasured / info | B |
| Harness turns | 14 | 21 | 21 | R1 = 14 | ≤15.40 | 7; 50.0% | NO | W |
| Model/API requests | 10 | 13 | 16 | R1 = 10 | ≤11 | 6; 60.0% | NO | W |
| Tool calls | 13 | 20 | 20 | R1 = 13 | ≤14.30 | 7; 53.8% | NO | W |
| Harness wall seconds | 85 | 171 | 112 | R1 = 85 | ≤93.50 | 86; 101.2% | NO | T |
| Agent duration seconds | 74.49 | 162.07 | 102.98 | R1 = 74.49 | ≤81.94 | 87.58; 117.6% | NO | T |
| API duration seconds | 56.89 | 132.03 | 82.13 | R1 = 56.89 | ≤62.58 | 75.14; 132.1% | NO | T |
| Scaffold/setup seconds | 9.04 | 6.62 | 7.18 | R2 = 6.62 | ≤7.28 | 2.42; 36.6% | NO | T |
| Time to first request seconds | 2.77 | 3.66 | 2.78 | R1 = 2.77 | ≤3.04 | 0.8960; 32.4% | NO | T |
| First context tokens | 20951 | 21021 | 20812 | R3 = 20812 | ≤22893.20 | 209; 1.0% | yes | B |
| Peak context tokens | 54451 | 102308 | 73645 | R1 = 54451 | ≤59896.10 | 47857; 87.9% | NO | B |
| Cache-created tokens | 47173 | 95030 | 66367 | 47173–95030 | — | 47857; info | unmeasured / info | B |
| Cache-read tokens | 347989 | 775166 | 748693 | 347989–775166 | — | 427177; info | unmeasured / info | B |
| Output tokens | 7566 | 18179 | 10349 | 7566–18179 | — | 10613; info | unmeasured / info | B |
| Route-ready seconds | 1.06 | 2.18 | 1.37 | R1 = 1.06 | ≤1.17 | 1.12; 105.8% | NO | T |
| Map layer ms | 689 | 1768 | 793 | R1 = 689 | ≤757.90 | 1079; 156.6% | NO | T |
| Tool-result bytes | 59057 | 145267 | 96516 | 59057–145267 | — | 86210; info | unmeasured / info | B |
| Reading request waves | 6 | 8 | 9 | 6–9 | — | 3; info | unmeasured / info | W |
| Single-path read waves | 3 | 2 | 2 | 2–3 | — | 1; info | unmeasured / info | W |
| Inferred read operands | 13 | 22 | 21 | 13–22 | — | 9; info | unmeasured / info | W |
| Distinct inferred requested files | 16 | 26 | 23 | 16–26 | — | 10; info | unmeasured / info | W |
| Truth files requested | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 13476 | 0–13476 | — | 13476; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 3 | 6 | 4 | 3–6 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 3378 | 4553 | 3759 | 3378–4553 | — | 1175; info | unmeasured / info | Q |
| Correct named files | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 8 | 8 | 9 | 8–9 | — | 1; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 65907 | 147520 | 90464 | 65907–147520 | — | 81613; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-TTdy5z**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-TTdy5z, R2 e-pFn1Sd, R3 e-IReliw. Eligible completed route candidates: R1, R2, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.3340 | R1: 0.3340 | 0.3674 |
| Harness turns | R1: 14 | R1: 14 | 15.40 |
| Model/API requests | R1: 10 | R1: 10 | 11 |
| Harness wall seconds | R1: 85 | R1: 85 | 93.50 |
| Peak context tokens | R1: 54451 | R1: 54451 | 59896.10 |

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
      "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-pFn1Sd/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l",
      "description": "List repo files"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/shared/services/wizard-backup-session.ts`
- `main/features/score-types/shared/services/wizard-backup-session.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts`
- `main/screens/report/report-routing.module.ts`

Non-truth paths only in R2:

- `main/features/form-backup/services/form-backup.service.ts`
- `main/features/form-backup/services/form-backup.service.spec.ts`
- `main/features/form-backup/services/form-backup-storage.service.ts`
- `main/features/form-backup/services/form-backup-storage.service.spec.ts`
- `main/features/form-backup/models/form-backup-record.model.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form-backup.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form-backup.service.spec.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-IReliw/home/cwd/repo && git ls-files | head -5; ls; grep -rIl -i \"indexeddb\\|idb\\|localforage\\|dexie\\|beforeunload\\|CanDeactivate\\|canDeactivate\" --include=*.ts --include=*.json . --exclude-dir=node_modules | head -30"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/shared/services/wizard-backup-session.ts`
- `main/features/score-types/shared/services/wizard-backup-session.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts`
- `main/screens/report/report-routing.module.ts`

Non-truth paths only in R3:

- `main/features/score-types/shared/services/form-backup.service.ts`
- `main/features/score-types/shared/services/form-backup.service.spec.ts`
- `main/features/score-types/shared/models/form-backup.model.ts`
- `main/features/score-types/shared/utils/before-unload.util.ts`
- `main/features/score-types/shared/utils/before-unload.util.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form-backup.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form-backup.service.spec.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-pFn1Sd/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l",
      "description": "List repo files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-IReliw/home/cwd/repo && git ls-files | head -5; ls; grep -rIl -i \"indexeddb\\|idb\\|localforage\\|dexie\\|beforeunload\\|CanDeactivate\\|canDeactivate\" --include=*.ts --include=*.json . --exclude-dir=node_modules | head -30"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `main/features/form-backup/services/form-backup.service.ts`
- `main/features/form-backup/services/form-backup.service.spec.ts`
- `main/features/form-backup/services/form-backup-storage.service.ts`
- `main/features/form-backup/services/form-backup-storage.service.spec.ts`
- `main/features/form-backup/models/form-backup-record.model.ts`

Non-truth paths only in R3:

- `main/features/score-types/shared/services/form-backup.service.ts`
- `main/features/score-types/shared/services/form-backup.service.spec.ts`
- `main/features/score-types/shared/models/form-backup.model.ts`
- `main/features/score-types/shared/utils/before-unload.util.ts`
- `main/features/score-types/shared/utils/before-unload.util.spec.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing/unspecified) | included; 6; 7 | included; 7; 9 | included; 8; 9 |
| main/features/score-types/ge-adv/services/ge-adv-wizard-progress-saving.service.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/services/form-progress-saving.service.spec.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/services/form-progress-saving.service.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-TTdy5z](../../attempts/e-TTdy5z.md)
- [R2 e-pFn1Sd](../../attempts/e-pFn1Sd.md)
- [R3 e-IReliw](../../attempts/e-IReliw.md)


# fe-vs-5164-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

Every investigation run names only the existing wizard truth file (recall 0.25). The three future truth paths cannot be opened at the base revision; proposed backup-module/service names differ instead. Extras grow from eight to nine to eleven. Exact historical new-file naming is partly a metric limitation, not evidence that each alternative design is wrong.

R1 is the cheapest and best-F1 witness; R2/R3 search storage/library/mapper/form neighbourhoods and return 59,308/54,892 bytes versus 29,502. More exploration does not recover historical proposed filenames.

**Proposed intervention:** Standardize a small proposal schema with existing owner and new capability roles. Batch wizard lifecycle, storage precedent and server-precedence evidence. Score behavioural coverage/roles alongside exact new-path recall; do not inject historical filenames into runtime prompts.

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
| [R1 e-RVGfZZ](../../attempts/e-RVGfZZ.md) | completed | done | true | 1 | 1 | 0 |
| [R2 e-rBKKhb](../../attempts/e-rBKKhb.md) | completed | done | true | 1 | 1 | 0 |
| [R3 e-Hm179U](../../attempts/e-Hm179U.md) | completed | done | true | 1 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.2500 | 0.2500 | 0.2500 | R1, R2, R3 = 0.2500 | ≥0.2250 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.1111 | 0.1000 | 0.0833 | R1 = 0.1111 | ≥0.1000 | 0.0278; 25.0% | NO | Q |
| Historical-file F1 | 0.1538 | 0.1429 | 0.1250 | R1 = 0.1538 | ≥0.1385 | 0.0288; 18.7% | NO | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1784 | 0.2816 | 0.2544 | R1 = 0.1784 | ≤0.1962 | 0.1032; 57.9% | NO | B |
| Harness total cost $ | 0.1846 | 0.2873 | 0.2616 | R1 = 0.1846 | ≤0.2030 | 0.1028; 55.7% | NO | B |
| Judging cost $ | 0.0062 | 0.0058 | 0.0073 | 0.0058–0.0073 | — | 0.0015; info | unmeasured / info | B |
| Harness turns | 7 | 11 | 8 | R1 = 7 | ≤7.70 | 4; 57.1% | NO | W |
| Model/API requests | 6 | 10 | 8 | R1 = 6 | ≤6.60 | 4; 66.7% | NO | W |
| Tool calls | 6 | 10 | 7 | R1 = 6 | ≤6.60 | 4; 66.7% | NO | W |
| Harness wall seconds | 59 | 61 | 69 | R1 = 59 | ≤64.90 | 10; 16.9% | NO | T |
| Agent duration seconds | 48.27 | 50.77 | 59.13 | R1 = 48.27 | ≤53.10 | 10.85; 22.5% | NO | T |
| API duration seconds | 40.65 | 35.15 | 47.75 | R2 = 35.15 | ≤38.67 | 12.60; 35.8% | NO | T |
| Scaffold/setup seconds | 8.82 | 8.08 | 7.58 | R3 = 7.58 | ≤8.34 | 1.24; 16.3% | NO | T |
| Time to first request seconds | 9.06 | 4.77 | 6.18 | R2 = 4.77 | ≤5.24 | 4.29; 90.1% | NO | T |
| First context tokens | 19751 | 19679 | 19614 | R3 = 19614 | ≤21575.40 | 137; 0.7% | yes | B |
| Peak context tokens | 35153 | 49100 | 47169 | R1 = 35153 | ≤38668.30 | 13947; 39.7% | NO | B |
| Cache-created tokens | 27875 | 41822 | 39891 | 27875–41822 | — | 13947; info | unmeasured / info | B |
| Cache-read tokens | 138618 | 347871 | 238342 | 138618–347871 | — | 209253; info | unmeasured / info | B |
| Output tokens | 3913 | 4468 | 4713 | 3913–4713 | — | 800; info | unmeasured / info | B |
| Route-ready seconds | 2.48 | 2.54 | 3.20 | R1 = 2.48 | ≤2.73 | 0.7210; 29.0% | NO | T |
| Map layer ms | 1696 | 1743 | 2392 | R1 = 1696 | ≤1865.60 | 696; 41.0% | NO | T |
| Tool-result bytes | 29502 | 59308 | 54892 | 29502–59308 | — | 29806; info | unmeasured / info | B |
| Reading request waves | 3 | 5 | 5 | 3–5 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 1 | 2 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 6 | 6 | 8 | 6–8 | — | 2; info | unmeasured / info | W |
| Distinct inferred requested files | 7 | 8 | 13 | 7–13 | — | 6; info | unmeasured / info | W |
| Truth files requested | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 1 | 0 | 0–1 | — | 1; info | unmeasured / info | W |
| Final answer bytes | 6078 | 5357 | 6951 | 5357–6951 | — | 1594; info | unmeasured / info | Q |
| Correct named files | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 8 | 9 | 11 | 8–11 | — | 3; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 48010 | 50478 | 58861 | 48010–58861 | — | 10851; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-RVGfZZ**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-RVGfZZ, R2 e-rBKKhb. Eligible completed route candidates: R1, R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.1784 | R1: 0.1784 | 0.1962 |
| Harness turns | R1: 7 | R1: 7 | 7.70 |
| Model/API requests | R1: 6 | R1: 6 | 6.60 |
| Harness wall seconds | R1: 59 | R1: 59 | 64.90 |
| Peak context tokens | R1: 35153 | R1: 35153 | 38668.30 |

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
      "command": "cd /private/tmp/e-RVGfZZ/home/cwd/repo && ls && ls main/features/score-types/ge-adv main/features/score-types/ge-adv/* main/features/score-types/shared main/features/score-types/shared/* | head -150"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-rBKKhb/home/cwd/repo && git ls-files | grep -i -E \"ge-adv|wizard\" | head -80; grep -rIl -i \"indexeddb\\|dexie\\|localforage\\|beforeunload\\|canDeactivate\" --exclude-dir=node_modules . | head -20"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `main/features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts`
- `main/features/score-types/shared/services/wizard-form-backup.service.ts`
- `main/features/score-types/shared/services/wizard-form-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-form-backup.service.ts`
- `main/features/score-types/shared/utils/wizard-unsaved-changes.util.ts`

Non-truth paths only in R2:

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.html`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts`
- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/shared/utils/debounced-form-backup.ts`
- `main/features/score-types/ge-adv/guards/ge-adv-wizard-unsaved-changes.guard.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-RVGfZZ/home/cwd/repo && ls && ls main/features/score-types/ge-adv main/features/score-types/ge-adv/* main/features/score-types/shared main/features/score-types/shared/* | head -150"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-Hm179U/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -i -E \"ge-adv|score-types/shared\" | head -100"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts`
- `main/features/score-types/shared/services/wizard-form-backup.service.ts`
- `main/features/score-types/shared/services/wizard-form-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-form-backup.service.ts`
- `main/features/score-types/shared/utils/wizard-unsaved-changes.util.ts`

Non-truth paths only in R3:

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `main/features/score-types/ge-adv/models/mappers/ge-adv.mapper.ts`
- `main/features/score-types/ge-adv/state/ge-adv.facade.ts`
- `main/features/score-types/shared/services/wizard-auto-launch.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-rBKKhb/home/cwd/repo && git ls-files | grep -i -E \"ge-adv|wizard\" | head -80; grep -rIl -i \"indexeddb\\|dexie\\|localforage\\|beforeunload\\|canDeactivate\" --exclude-dir=node_modules . | head -20"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-Hm179U/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -i -E \"ge-adv|score-types/shared\" | head -100"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.html`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts`
- `main/features/score-types/shared/utils/debounced-form-backup.ts`
- `main/features/score-types/ge-adv/guards/ge-adv-wizard-unsaved-changes.guard.ts`

Non-truth paths only in R3:

- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts`
- `main/features/score-types/ge-adv/models/mappers/ge-adv.mapper.ts`
- `main/features/score-types/ge-adv/state/ge-adv.facade.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `main/features/score-types/shared/services/wizard-auto-launch.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing/unspecified) | included; 2; 3 | included; 3; 4 | included; 3; 3 |
| main/features/score-types/ge-adv/services/ge-adv-wizard-progress-saving.service.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/services/form-progress-saving.service.spec.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/services/form-progress-saving.service.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |

Offline union of final path sets: R 25.0%, P 4.8%, F1 8.0%. Intersection: R 25.0%, P 50.0%, F1 33.3%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-RVGfZZ](../../attempts/e-RVGfZZ.md)
- [R2 e-rBKKhb](../../attempts/e-rBKKhb.md)
- [R3 e-Hm179U](../../attempts/e-Hm179U.md)


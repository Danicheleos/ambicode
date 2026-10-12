# fe-vs-6406-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R1 names five of 21 truth paths, including location-select HTML/TS/spec; R2/R3 name only registered-users HTML/SCSS. R2 discovers the owner by Glob and R3 reads it in a helper batch, then excludes it from the final list. The model is making a change-boundary judgment rather than failing to find the owner.

R2 is cheapest and uses less context but fails the recall floor. R3 adds an extra SCSS path. R1 expends more source work to include the owner family; none of the three has strong absolute recall.

**Proposed intervention:** Verify the owner-versus-consumer boundary against the ticket before finalizing and report excluded surfaces with reasons. Historical incidental owner/spec edits can overstate needed production changes; keep exact-file scores plus a behavioural criterion rather than forcing unnecessary edits to match truth.

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
| [R1 e-IdspwN](../../attempts/e-IdspwN.md) | completed | done | true | 1 | 1 | 0 |
| [R2 e-4YUrcy](../../attempts/e-4YUrcy.md) | completed | done | true | 1 | 1 | 0 |
| [R3 e-WU4jXY](../../attempts/e-WU4jXY.md) | completed | done | true | 1 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.2381 | 0.0952 | 0.0952 | R1 = 0.2381 | ≥0.2143 | 0.1429; 60.0% | NO | Q |
| Historical-file precision | 1 | 1 | 0.6667 | R1, R2 = 1 | ≥0.9000 | 0.3333; 33.3% | NO | Q |
| Historical-file F1 | 0.3846 | 0.1739 | 0.1667 | R1 = 0.3846 | ≥0.3462 | 0.2179; 56.7% | NO | Q |
| Existing-at-base recall | 0.2381 | 0.0952 | 0.0952 | R1 = 0.2381 | ≥0.2143 | 0.1429; 60.0% | NO | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1333 | 0.1059 | 0.1194 | R2 = 0.1059 | ≤0.1165 | 0.0274; 25.9% | NO | B |
| Harness total cost $ | 0.1380 | 0.1099 | 0.1238 | R2 = 0.1099 | ≤0.1208 | 0.0282; 25.7% | NO | B |
| Judging cost $ | 0.0047 | 0.0039 | 0.0045 | 0.0039–0.0047 | — | 0.0008; info | unmeasured / info | B |
| Harness turns | 7 | 6 | 5 | R3 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Model/API requests | 7 | 5 | 5 | R2, R3 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Tool calls | 6 | 5 | 4 | R3 = 4 | ≤4.40 | 2; 50.0% | NO | W |
| Harness wall seconds | 33 | 29 | 32 | R2 = 29 | ≤31.90 | 4; 13.8% | NO | T |
| Agent duration seconds | 24.50 | 20.38 | 21.25 | R2 = 20.38 | ≤22.42 | 4.11; 20.2% | NO | T |
| API duration seconds | 18.48 | 14.64 | 15.85 | R2 = 14.64 | ≤16.11 | 3.83; 26.2% | NO | T |
| Scaffold/setup seconds | 6.87 | 7.14 | 9.01 | R1 = 6.87 | ≤7.56 | 2.14; 31.1% | NO | T |
| Time to first request seconds | 4.11 | 5.25 | 4.45 | R1 = 4.11 | ≤4.52 | 1.14; 27.8% | NO | T |
| First context tokens | 18635 | 18698 | 18702 | R1 = 18635 | ≤20498.50 | 67; 0.4% | yes | B |
| Peak context tokens | 28039 | 25135 | 28056 | R2 = 25135 | ≤27648.50 | 2921; 11.6% | NO | B |
| Cache-created tokens | 20761 | 17857 | 20778 | 17857–20778 | — | 2921; info | unmeasured / info | B |
| Cache-read tokens | 151812 | 89634 | 91874 | 89634–151812 | — | 62178; info | unmeasured / info | B |
| Output tokens | 1988 | 1655 | 1786 | 1655–1988 | — | 333; info | unmeasured / info | B |
| Route-ready seconds | 2.45 | 2.66 | 2.20 | R3 = 2.20 | ≤2.42 | 0.4580; 20.8% | NO | T |
| Map layer ms | 1957 | 1975 | 1725 | R3 = 1725 | ≤1897.50 | 250; 14.5% | NO | T |
| Tool-result bytes | 20945 | 13023 | 19925 | 13023–20945 | — | 7922; info | unmeasured / info | B |
| Reading request waves | 3 | 1 | 1 | 1–3 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 1 | 0 | 0 | 0–1 | — | 1; info | unmeasured / info | W |
| Inferred read operands | 6 | 5 | 0 | 0–6 | — | 6; info | unmeasured / info | W |
| Distinct inferred requested files | 9 | 5 | 0 | 0–9 | — | 9; info | unmeasured / info | W |
| Truth files requested | 6 | 3 | 0 | 0–6 | — | 6; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 1 | 0 | 0–1 | — | 1; info | unmeasured / info | W |
| Final answer bytes | 3189 | 2181 | 2872 | 2181–3189 | — | 1008; info | unmeasured / info | Q |
| Correct named files | 5 | 2 | 2 | 2–5 | — | 3; info | unmeasured / info | Q |
| Non-truth named files | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 24244 | 19952 | 20991 | 19952–24244 | — | 4292; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 17071 | 0–17071 | — | 17071; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 5 | 0–5 | — | 5; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-IdspwN**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-IdspwN. Eligible completed route candidates: R1. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.1059 | R1: 0.1333 | 0.1165 |
| Harness turns | R3: 5 | R1: 7 | 5.50 |
| Model/API requests | R2, R3: 5 | R1: 7 | 5.50 |
| Harness wall seconds | R2: 29 | R1: 33 | 31.90 |
| Peak context tokens | R2: 25135 | R1: 28039 | 27648.50 |

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
      "command": "cd /private/tmp/e-IdspwN/home/cwd/repo && grep -rIl \"app-location-select\\|LocationSelect\" --exclude-dir=node_modules --exclude-dir=.git . | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-4YUrcy/home/cwd/repo 2>/dev/null && pwd; grep -rn \"app-location-select\" --include=*.ts --include=*.html . --exclude-dir=node_modules | head -30"
    }
  }
}
```

Correct paths only in R1:

- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.spec.ts`

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
      "command": "cd /private/tmp/e-IdspwN/home/cwd/repo && grep -rIl \"app-location-select\\|LocationSelect\" --exclude-dir=node_modules --exclude-dir=.git . | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-WU4jXY/home/cwd/repo 2>/dev/null && pwd; ls main/components/inputs/location-select; grep -rn \"app-location-select\" --include=* . -l --exclude-dir=node_modules | head -20"
    }
  }
}
```

Correct paths only in R1:

- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.spec.ts`

Correct paths only in R3:

None.

Non-truth paths only in R1:

None.

Non-truth paths only in R3:

- `main/components/inputs/location-select/location-select.component.scss`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-4YUrcy/home/cwd/repo 2>/dev/null && pwd; grep -rn \"app-location-select\" --include=*.ts --include=*.html . --exclude-dir=node_modules | head -30"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-WU4jXY/home/cwd/repo 2>/dev/null && pwd; ls main/components/inputs/location-select; grep -rn \"app-location-select\" --include=* . -l --exclude-dir=node_modules | head -20"
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

- `main/components/inputs/location-select/location-select.component.scss`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/components/dialogs/ConfirmationDialog/ConfirmationDialog.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/dialogs/ConfirmationDialog/ConfirmationDialog.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/dialogs/ConfirmationDialog/ConfirmationDialog.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/dialogs/LocationSelectDialog/LocationSelectDialog.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/dialogs/LocationSelectDialog/LocationSelectDialog.component.ts (existing/unspecified) | omitted; 1; — | omitted; —; — | omitted; —; — |
| main/components/dialogs/new-users-dialog/new-users-dialog.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/dialogs/new-users-dialog/new-users-dialog.component.ts (existing/unspecified) | omitted; 1; — | omitted; —; — | omitted; —; — |
| main/components/inputs/location-select/directives/select-location-button.directive.spec.ts (existing/unspecified) | omitted; 1; — | omitted; 3; — | omitted; —; — |
| main/components/inputs/location-select/directives/select-location-button.directive.ts (existing/unspecified) | omitted; 1; 2 | omitted; 3; — | omitted; —; — |
| main/components/inputs/location-select/location-select.component.html (existing/unspecified) | included; 2; 3 | omitted; 3; 4 | omitted; 3; — |
| main/components/inputs/location-select/location-select.component.spec.ts (existing/unspecified) | included; 1; 6 | omitted; 3; — | omitted; 4; — |
| main/components/inputs/location-select/location-select.component.ts (existing/unspecified) | included; 1; 2 | omitted; 2; 4 | omitted; 2; — |
| main/components/inputs/readonly-input/readonly-input.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/inputs/readonly-input/readonly-input.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/inputs/readonly-input/readonly-input.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.html (existing/unspecified) | omitted; 1; — | omitted; 2; — | omitted; 2; — |
| main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/screens/org-admin/registered-users/registered-users.component.html (existing/unspecified) | included; 1; 2 | included; 2; 4 | included; 2; — |
| main/screens/org-admin/registered-users/registered-users.component.scss (existing/unspecified) | included; —; 3 | included; 5; — | included; —; — |
| main/screens/org-admin/registered-users/registered-users.component.ts (existing/unspecified) | omitted; 1; — | omitted; —; — | omitted; —; — |

Offline union of final path sets: R 23.8%, P 83.3%, F1 37.0%. Intersection: R 9.5%, P 100.0%, F1 17.4%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-IdspwN](../../attempts/e-IdspwN.md)
- [R2 e-4YUrcy](../../attempts/e-4YUrcy.md)
- [R3 e-WU4jXY](../../attempts/e-WU4jXY.md)


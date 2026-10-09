# fe-vs-5967-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Only one observed attempt: extrema are single observations; stability is unmeasured.

## Observed divergence and explanation

Only one attempt exists, so there is no between-repetition drift estimate. It finds six of 36 historic paths, including two proposed NOM telemetry service files. Nine extra paths concern Amplitude, exports, story files and state. This is an absolute quality gap, not a demonstrated stability gap.

The one attempt makes nine API calls, returns 66,144 tool bytes and peaks at 51,813 context tokens. These are a witnessed sample, not a stable best-resource target.

**Proposed intervention:** Build a telemetry event/consumer matrix and read the existing analogue plus NOM owner spans together. Additional repetitions are needed to evaluate drift; no paid run was started for this report.

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
| [R1 e-Bj9KZ3](../../attempts/e-Bj9KZ3.md) | completed | done | true | 6 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---|---:|---|---|---|
| Historical-file recall | 0.1667 | R1 = 0.1667 | ≥0.1500 | 0; 0.0% | unmeasured / info | Q |
| Historical-file precision | 0.4000 | R1 = 0.4000 | ≥0.3600 | 0; 0.0% | unmeasured / info | Q |
| Historical-file F1 | 0.2353 | R1 = 0.2353 | ≥0.2118 | 0; 0.0% | unmeasured / info | Q |
| Existing-at-base recall | 0.1290 | R1 = 0.1290 | ≥0.1161 | 0; 0.0% | unmeasured / info | Q |
| Created-file recall | 0.4000 | R1 = 0.4000 | ≥0.3600 | 0; 0.0% | unmeasured / info | Q |
| Deleted-file recall | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2854 | R1 = 0.2854 | ≤0.3140 | 0; 0.0% | unmeasured / info | B |
| Harness total cost $ | 0.2854 | R1 = 0.2854 | ≤0.3140 | 0; 0.0% | unmeasured / info | B |
| Judging cost $ | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Harness turns | 10 | R1 = 10 | ≤11 | 0; 0.0% | unmeasured / info | W |
| Model/API requests | 9 | R1 = 9 | ≤9.90 | 0; 0.0% | unmeasured / info | W |
| Tool calls | 9 | R1 = 9 | ≤9.90 | 0; 0.0% | unmeasured / info | W |
| Harness wall seconds | 52 | R1 = 52 | ≤57.20 | 0; 0.0% | unmeasured / info | T |
| Agent duration seconds | 45.32 | R1 = 45.32 | ≤49.85 | 0; 0.0% | unmeasured / info | T |
| API duration seconds | 36.40 | R1 = 36.40 | ≤40.04 | 0; 0.0% | unmeasured / info | T |
| Scaffold/setup seconds | 6.87 | R1 = 6.87 | ≤7.55 | 0; 0.0% | unmeasured / info | T |
| Time to first request seconds | 3.57 | R1 = 3.57 | ≤3.93 | 0; 0.0% | unmeasured / info | T |
| First context tokens | 18974 | R1 = 18974 | ≤20871.40 | 0; 0.0% | unmeasured / info | B |
| Peak context tokens | 51813 | R1 = 51813 | ≤56994.30 | 0; 0.0% | unmeasured / info | B |
| Cache-created tokens | 44535 | 44535–44535 | — | 0; info | unmeasured / info | B |
| Cache-read tokens | 284649 | 284649–284649 | — | 0; info | unmeasured / info | B |
| Output tokens | 5032 | 5032–5032 | — | 0; info | unmeasured / info | B |
| Route-ready seconds | 2.04 | R1 = 2.04 | ≤2.24 | 0; 0.0% | unmeasured / info | T |
| Map layer ms | 1302 | R1 = 1302 | ≤1432.20 | 0; 0.0% | unmeasured / info | T |
| Tool-result bytes | 66144 | 66144–66144 | — | 0; info | unmeasured / info | B |
| Reading request waves | 4 | 4–4 | — | 0; info | unmeasured / info | W |
| Single-path read waves | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Inferred read operands | 8 | 8–8 | — | 0; info | unmeasured / info | W |
| Distinct inferred requested files | 12 | 12–12 | — | 0; info | unmeasured / info | W |
| Truth files requested | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | R1 = 0 | ≤0 | 0; 0.0% | unmeasured / info | E |
| Failed tool calls | 0 | R1 = 0 | ≤0 | 0; 0.0% | unmeasured / info | E |
| Permission denials | 0 | R1 = 0 | ≤0 | 0; 0.0% | unmeasured / info | E |
| Stop blocks | 0 | R1 = 0 | ≤0 | 0; 0.0% | unmeasured / info | E |
| Parallel tool request waves | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Final answer bytes | 6102 | 6102–6102 | — | 0; info | unmeasured / info | Q |
| Correct named files | 6 | 6–6 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 9 | 9–9 | — | 0; info | unmeasured / info | Q |
| Delivered-map truth hits | 6 | 6–6 | — | 0; info | unmeasured / info | W |
| Engine model-step deliveries | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Artifact validation failures | 0 | R1 = 0 | ≤0 | 0; 0.0% | unmeasured / info | E |
| Harness aggregate score | 0.6667 | 0.6667–0.6667 | — | 0; info | unmeasured / info | W |
| Harness passed flag (1=yes) | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Failed paid/deterministic graders | 1 | 1–1 | — | 0; info | unmeasured / info | E |
| Paid graders skipped (1=yes) | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| AskUserQuestion calls | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger acceptances | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger declines | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Headless defaults taken | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Policy ledger entries | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Recorded compaction events | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine exit wall budget ms | 45049 | 45049–45049 | — | 0; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-Bj9KZ3**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-Bj9KZ3. Eligible completed route candidates: R1. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.2854 | R1: 0.2854 | 0.3140 |
| Harness turns | R1: 10 | R1: 10 | 11 |
| Model/API requests | R1: 9 | R1: 9 | 9.90 |
| Harness wall seconds | R1: 52 | R1: 52 | 57.20 |
| Peak context tokens | R1: 51813 | R1: 51813 | 56994.30 |

If the eligible minimum exceeds the resource boundary, that joint goal has not been observed. Independent bests are aspiration points, not a synthetic run that already exists. Exact-path membership is an additional stability criterion, even when aggregate scores tie.

## Individual harness graders

The aggregate harness score can combine several judgments; it is not interchangeable with deterministic file F1. The investigation paid grader only requires a true-file hit, so a passing score can coexist with poor recall/precision. The no-peek graders count only inputs matching benchmark/preset/eval paths: "Bash called 0x" means zero matching forbidden calls, not zero total Bash calls. Missing paid judgments in the cost-capped campaign are not counted as passed. All original grader fields remain in each attempt JSON.

| Attempt | Grader | Passed | Score | Recorded explanation |
|---|---|---|---|---|
| R1 | names-a-true-file | false | — | skipped: cost ceiling |
| R1 | no-code-edit | true | — | Edit called 0x (expected 0..0) |
| R1 | no-code-write | true | — | Write called 0x (expected 0..0) |
| R1 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R1 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R1 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R1 | no-peek-read | true | — | Read called 0x (expected 0..0) |

## First drift, pair by pair

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand |
|---|---|
| main/features/score-types/ge-adv/components/score-card/detail/ge-adv-score-detail.component.ts (existing/unspecified) | omitted; 2; — |
| main/features/score-types/nom/components/score-card/components/carry/nom-carry-detail.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/carry/nom-carry-detail.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/carry/nom-carry-detail.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/lift/nom-lift-detail.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/lift/nom-lift-detail.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/lift/nom-lift-detail.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/push-pull/nom-push-pull-detail.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/push-pull/nom-push-pull-detail.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/push-pull/nom-push-pull-detail.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/team/nom-team-detail.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/team/nom-team-detail.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/components/team/nom-team-detail.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/nom-score-card.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/components/score-card/nom-score-card.component.spec.ts (existing/unspecified) | included; —; — |
| main/features/score-types/nom/components/score-card/nom-score-card.component.ts (existing/unspecified) | included; 4; 7 |
| main/features/score-types/nom/mocks/nom-telemetry.service.mock.ts (created) | omitted; —; — |
| main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.spec.ts (existing/unspecified) | included; —; — |
| main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts (existing/unspecified) | included; 4; 6 |
| main/features/score-types/nom/providers/nom.provider.ts (created) | omitted; —; — |
| main/features/score-types/nom/services/nom-telemetry.service.spec.ts (created) | included; —; — |
| main/features/score-types/nom/services/nom-telemetry.service.ts (created) | included; —; — |
| main/features/score-types/nom/shared/constants/nom-wizard-step-names.constants.ts (created) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-carry/components/nom-carry-wizard/nom-carry-wizard.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-carry/components/nom-carry-wizard/nom-carry-wizard.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-lift/components/nom-lift-wizard/nom-lift-wizard.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-lift/components/nom-lift-wizard/nom-lift-wizard.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-push-pull/components/nom-push-pull-wizard/nom-push-pull-wizard.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-push-pull/components/nom-push-pull-wizard/nom-push-pull-wizard.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-team/components/nom-team-wizard/nom-team-wizard.component.spec.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/nom/shared/wizards/nom-team/components/nom-team-wizard/nom-team-wizard.component.ts (existing/unspecified) | omitted; —; — |
| main/features/score-types/shared/providers/score-types.provider.ts (existing/unspecified) | omitted; —; — |

Offline union of final path sets: R 16.7%, P 40.0%, F1 23.5%. Intersection: R 16.7%, P 40.0%, F1 23.5%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-Bj9KZ3](../../attempts/e-Bj9KZ3.md)


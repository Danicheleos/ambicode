# fe-vs-5948-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R1 has 14/29 truth files, R2/R3 six. Eight locale files account for the difference (de, el, es, ja, pt, sk, zh-CN, zh-TW). The initial requirement-string search versus general catalogue changes the exploration path; the decisive measured loss is the final translation-family omission.

The lower-quality attempts are also more expensive: $0.41081/$0.43699/$0.52424 agent cost and 88,996/110,276/129,517 tool bytes. They retain more score-display/strategy/test neighbourhood data without preserving R1 locale coverage.

**Proposed intervention:** Use an explicit key-to-locale inventory and a bounded score-display consumer batch. Retain a completion receipt for each requirement instead of continuing broad code reads. R1 is a witnessed improvement in both quality and context/cost.

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
| [R1 e-iq5BqM](../../attempts/e-iq5BqM.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-3oNv5m](../../attempts/e-3oNv5m.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-7evXFs](../../attempts/e-7evXFs.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.4828 | 0.2069 | 0.2069 | R1 = 0.4828 | ≥0.4345 | 0.2759; 57.1% | NO | Q |
| Historical-file precision | 0.5833 | 0.4286 | 0.3529 | R1 = 0.5833 | ≥0.5250 | 0.2304; 39.5% | NO | Q |
| Historical-file F1 | 0.5283 | 0.2791 | 0.2609 | R1 = 0.5283 | ≥0.4755 | 0.2674; 50.6% | NO | Q |
| Existing-at-base recall | 0.8125 | 0.3125 | 0.3125 | R1 = 0.8125 | ≥0.7313 | 0.5000; 61.5% | NO | Q |
| Created-file recall | 0.0769 | 0.0769 | 0.0769 | R1, R2, R3 = 0.0769 | ≥0.0692 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.4108 | 0.4370 | 0.5242 | R1 = 0.4108 | ≤0.4519 | 0.1134; 27.6% | NO | B |
| Harness total cost $ | 0.4108 | 0.4370 | 0.5242 | R1 = 0.4108 | ≤0.4519 | 0.1134; 27.6% | NO | B |
| Judging cost $ | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Harness turns | 22 | 24 | 29 | R1 = 22 | ≤24.20 | 7; 31.8% | NO | W |
| Model/API requests | 16 | 15 | 17 | R2 = 15 | ≤16.50 | 2; 13.3% | NO | W |
| Tool calls | 21 | 23 | 28 | R1 = 21 | ≤23.10 | 7; 33.3% | NO | W |
| Harness wall seconds | 84 | 83 | 106 | R2 = 83 | ≤91.30 | 23; 27.7% | NO | T |
| Agent duration seconds | 75.25 | 74.86 | 98.29 | R2 = 74.86 | ≤82.35 | 23.43; 31.3% | NO | T |
| API duration seconds | 60.65 | 63.31 | 86.25 | R1 = 60.65 | ≤66.71 | 25.60; 42.2% | NO | T |
| Scaffold/setup seconds | 8.84 | 8.19 | 6.84 | R3 = 6.84 | ≤7.53 | 2.00; 29.2% | NO | T |
| Time to first request seconds | 5.35 | 4.83 | 9.68 | R2 = 4.83 | ≤5.32 | 4.85; 100.3% | NO | T |
| First context tokens | 19444 | 19449 | 19382 | R3 = 19382 | ≤21320.20 | 67; 0.3% | yes | B |
| Peak context tokens | 61882 | 70826 | 80249 | R1 = 61882 | ≤68070.20 | 18367; 29.7% | NO | B |
| Cache-created tokens | 54604 | 63548 | 72971 | 54604–72971 | — | 18367; info | unmeasured / info | B |
| Cache-read tokens | 565730 | 520981 | 757756 | 520981–757756 | — | 236775; info | unmeasured / info | B |
| Output tokens | 7918 | 7854 | 8074 | 7854–8074 | — | 220; info | unmeasured / info | B |
| Route-ready seconds | 3.00 | 2.99 | 2.99 | R2 = 2.99 | ≤3.29 | 0.0110; 0.4% | yes | T |
| Map layer ms | 2185 | 2209 | 2242 | R1 = 2185 | ≤2403.50 | 57; 2.6% | yes | T |
| Tool-result bytes | 88996 | 110276 | 129517 | 88996–129517 | — | 40521; info | unmeasured / info | B |
| Reading request waves | 9 | 8 | 11 | 8–11 | — | 3; info | unmeasured / info | W |
| Single-path read waves | 2 | 1 | 4 | 1–4 | — | 3; info | unmeasured / info | W |
| Inferred read operands | 18 | 28 | 34 | 18–34 | — | 16; info | unmeasured / info | W |
| Distinct inferred requested files | 20 | 36 | 32 | 20–36 | — | 16; info | unmeasured / info | W |
| Truth files requested | 3 | 6 | 4 | 3–6 | — | 3; info | unmeasured / info | W |
| Path-revisit bytes proxy | 1985 | 0 | 0 | 0–1985 | — | 1985; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 6 | 9 | 9 | 6–9 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 7905 | 7975 | 6512 | 6512–7975 | — | 1463; info | unmeasured / info | Q |
| Correct named files | 14 | 6 | 6 | 6–14 | — | 8; info | unmeasured / info | Q |
| Non-truth named files | 10 | 8 | 11 | 8–11 | — | 3; info | unmeasured / info | Q |
| Delivered-map truth hits | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine model-step deliveries | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Artifact validation failures | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Harness aggregate score | 0.6667 | 0.6667 | 0.6667 | 0.6667–0.6667 | — | 0; info | unmeasured / info | W |
| Harness passed flag (1=yes) | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Failed paid/deterministic graders | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | E |
| Paid graders skipped (1=yes) | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| AskUserQuestion calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger acceptances | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger declines | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Headless defaults taken | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Policy ledger entries | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Recorded compaction events | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine exit wall budget ms | 74933 | 74557 | 98026 | 74557–98026 | — | 23469; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-iq5BqM**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-iq5BqM. Eligible completed route candidates: R1. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.4108 | R1: 0.4108 | 0.4519 |
| Harness turns | R1: 22 | R1: 22 | 24.20 |
| Model/API requests | R2: 15 | R1: 16 | 16.50 |
| Harness wall seconds | R2: 83 | R1: 84 | 91.30 |
| Peak context tokens | R1: 61882 | R1: 61882 | 68070.20 |

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
| R2 | names-a-true-file | false | — | skipped: cost ceiling |
| R2 | no-code-edit | true | — | Edit called 0x (expected 0..0) |
| R2 | no-code-write | true | — | Write called 0x (expected 0..0) |
| R2 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R2 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R2 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R2 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R3 | names-a-true-file | false | — | skipped: cost ceiling |
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
      "command": "cd /private/tmp/e-iq5BqM/home/cwd/repo 2>/dev/null && pwd && ls; grep -rli \"all-assessments\\|assessments-table\\|AllAssessments\" --include=*.ts --include=*.html --include=*.json . --exclude-dir=node_modules | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-3oNv5m/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"all-assessments|assessments-table|assessment-list|assessments-list\" | head -50"
    }
  }
}
```

Correct paths only in R1:

- `main/assets/i18n/de.json`
- `main/assets/i18n/el.json`
- `main/assets/i18n/es.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/zh-TW.json`

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `main/components/tables/report-table/score-display/score-display.module.ts`
- `main/features/score-types/nom/score-display-strategy/nom-riskiest-effort-column-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-risk-counts-column-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-accumulated-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/components/result-cell/nom-riskiest-effort-cell.component.ts`
- `main/features/score-types/nom/components/result-cell/nom-risk-counts-cell.component.ts`
- `main/features/score-types/nom/components/result-cell/nom-warning-cell.component.ts`

Non-truth paths only in R2:

- `main/services/scoring.service.ts`
- `main/services/scoring.service.spec.ts`
- `main/features/score-types/nom/score-display-strategy/nom-column-display-strategy-base.ts`
- `main/features/score-types/nom/services/nom-scoring.service.spec.ts`
- `main/features/score-types/nom/components/nom-risk-count-cell/nom-risk-count-cell.component.ts`
- `main/features/score-types/nom/components/nom-warning-cell/nom-warning-cell.component.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-iq5BqM/home/cwd/repo 2>/dev/null && pwd && ls; grep -rli \"all-assessments\\|assessments-table\\|AllAssessments\" --include=*.ts --include=*.html --include=*.json . --exclude-dir=node_modules | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-7evXFs/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"all-assessments|assessments-table|assessment-list\" | head -50; git ls-files | grep -ic nom"
    }
  }
}
```

Correct paths only in R1:

- `main/assets/i18n/de.json`
- `main/assets/i18n/el.json`
- `main/assets/i18n/es.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/zh-TW.json`

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `main/components/tables/report-table/score-display/score-display.module.ts`
- `main/features/score-types/nom/score-display-strategy/nom-score-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-riskiest-effort-column-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-risk-counts-column-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-accumulated-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/components/result-cell/nom-riskiest-effort-cell.component.ts`
- `main/features/score-types/nom/components/result-cell/nom-risk-counts-cell.component.ts`
- `main/features/score-types/nom/components/result-cell/nom-warning-cell.component.ts`

Non-truth paths only in R3:

- `main/services/scoring.service.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-score-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-column-display-strategy-base.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-riskiest-effort-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-risk-counts-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-handled-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-accumulated-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/nom-risk-counts-cell/nom-risk-counts-cell.component.ts`
- `main/features/score-types/nom/components/report-table/nom-warning-cell/nom-warning-cell.component.ts`
- `main/features/score-types/nom/services/nom-scoring.service.spec.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-3oNv5m/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"all-assessments|assessments-table|assessment-list|assessments-list\" | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-7evXFs/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"all-assessments|assessments-table|assessment-list\" | head -50; git ls-files | grep -ic nom"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `main/services/scoring.service.spec.ts`
- `main/features/score-types/nom/score-display-strategy/nom-score-display-strategy.ts`
- `main/features/score-types/nom/score-display-strategy/nom-column-display-strategy-base.ts`
- `main/features/score-types/nom/components/nom-risk-count-cell/nom-risk-count-cell.component.ts`
- `main/features/score-types/nom/components/nom-warning-cell/nom-warning-cell.component.ts`

Non-truth paths only in R3:

- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-score-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-column-display-strategy-base.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-riskiest-effort-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-risk-counts-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-handled-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/score-display-strategy/nom-accumulated-weight-warning-column-display-strategy.ts`
- `main/features/score-types/nom/components/report-table/nom-risk-counts-cell/nom-risk-counts-cell.component.ts`
- `main/features/score-types/nom/components/report-table/nom-warning-cell/nom-warning-cell.component.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/i18n/de.json (existing/unspecified) | included; 16; 21 | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/el.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/en.json (existing/unspecified) | included; 16; 18 | included; 7; 22 | included; 3; 28 |
| main/assets/i18n/en.original.json (existing/unspecified) | included; 16; — | included; 7; 22 | included; 3; — |
| main/assets/i18n/es.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/ja.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/pt.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/sk.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | included; 16; — | omitted; 7; — | omitted; 3; — |
| main/components/ReportComponent/NewAssessmentTypeDialog/NewAssessmentTypeDialog.component.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/components/ReportComponent/Report.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/tables/report-table/score-display/score-display-strategy/score-display-strategy-factory.ts (existing/unspecified) | included; 11; — | included; 14; 15 | included; 17; 18 |
| main/features/score-types/nom/components/score-card/nom-score-card.component.html (existing/unspecified) | omitted; —; — | omitted; 16; 23 | omitted; 24; — |
| main/features/score-types/nom/components/score-display-strategy/cells/nom-risk-count-cell/nom-risk-count-cell.component.html (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/cells/nom-risk-count-cell/nom-risk-count-cell.component.scss (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/cells/nom-risk-count-cell/nom-risk-count-cell.component.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/cells/nom-warning-cell/nom-warning-cell.component.html (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/cells/nom-warning-cell/nom-warning-cell.component.scss (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/cells/nom-warning-cell/nom-warning-cell.component.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/nom-awl-column-display-strategy.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/nom-column-display-strategy-base.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/nom-risk-count-column-display-strategy.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/nom-riskiest-score-column-display-strategy.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/nom-sal-column-display-strategy.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/components/score-display-strategy/nom-score-display-strategy.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/nom/services/nom-scoring.service.ts (created) | included; —; — | included; —; — | included; —; — |
| main/models/Report.ts (existing/unspecified) | included; —; — | included; 14; 17 | included; 12; 17 |
| main/models/Scoring.ts (existing/unspecified) | included; 19; 15 | included; 12; 19 | included; 20; 21 |

Offline union of final path sets: R 48.3%, P 36.8%, F1 41.8%. Intersection: R 20.7%, P 85.7%, F1 33.3%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-iq5BqM](../../attempts/e-iq5BqM.md)
- [R2 e-3oNv5m](../../attempts/e-3oNv5m.md)
- [R3 e-7evXFs](../../attempts/e-7evXFs.md)


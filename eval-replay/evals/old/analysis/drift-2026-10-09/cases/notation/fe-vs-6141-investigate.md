# fe-vs-6141-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

Best F1 and best precision are R1 (39 true, six extras); best recall is R3 (45 true, 18 extras). No observed run simultaneously meets 90% of the best recall, precision and F1. R2 loses display-card TS and five REBA wizard HTML files relative to R1; R3 expands a wider indicator/template family.

All attempts retain 95–105 KB of output and peak at 68–72 KB tokens, with $0.50–0.54 agent spend. The resource drift is smaller than some cases, but the recall/precision trade-off prevents constructing a real combined winner from different rows.

**Proposed intervention:** Enumerate template/indicator and locale obligations, then verify which consumers actually require change. Seek R3 true-file coverage with R1 exclusion discipline. A new run is required to demonstrate simultaneous feasibility; selecting a scalar F1 winner cannot resolve this trade-off.

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
| [R1 e-5JrIo4](../../attempts/e-5JrIo4.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-JNaUjT](../../attempts/e-JNaUjT.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-gEvsR7](../../attempts/e-gEvsR7.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.5821 | 0.5672 | 0.6716 | R3 = 0.6716 | ≥0.6045 | 0.1045; 15.6% | NO | Q |
| Historical-file precision | 0.8667 | 0.7917 | 0.7143 | R1 = 0.8667 | ≥0.7800 | 0.1524; 17.6% | NO | Q |
| Historical-file F1 | 0.6964 | 0.6609 | 0.6923 | R1 = 0.6964 | ≥0.6268 | 0.0356; 5.1% | yes | Q |
| Existing-at-base recall | 0.5821 | 0.5672 | 0.6716 | R3 = 0.6716 | ≥0.6045 | 0.1045; 15.6% | NO | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | 0.3333 | 0.1667 | 0.5000 | R3 = 0.5000 | ≥0.4500 | 0.3333; 66.7% | NO | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.4994 | 0.5328 | 0.5424 | R1 = 0.4994 | ≤0.5494 | 0.0429; 8.6% | yes | B |
| Harness total cost $ | 0.5187 | 0.5492 | 0.5636 | R1 = 0.5187 | ≤0.5706 | 0.0448; 8.6% | yes | B |
| Judging cost $ | 0.0193 | 0.0164 | 0.0212 | 0.0164–0.0212 | — | 0.0047; info | unmeasured / info | B |
| Harness turns | 24 | 24 | 22 | R3 = 22 | ≤24.20 | 2; 9.1% | yes | W |
| Model/API requests | 17 | 19 | 19 | R1 = 17 | ≤18.70 | 2; 11.8% | NO | W |
| Tool calls | 23 | 23 | 21 | R3 = 21 | ≤23.10 | 2; 9.5% | yes | W |
| Harness wall seconds | 110 | 93 | 106 | R2 = 93 | ≤102.30 | 17; 18.3% | NO | T |
| Agent duration seconds | 95.93 | 83.82 | 95.43 | R2 = 83.82 | ≤92.20 | 12.11; 14.4% | NO | T |
| API duration seconds | 82.93 | 71.25 | 83.92 | R2 = 71.25 | ≤78.38 | 12.67; 17.8% | NO | T |
| Scaffold/setup seconds | 11.78 | 6.82 | 8.26 | R2 = 6.82 | ≤7.50 | 4.97; 72.9% | NO | T |
| Time to first request seconds | 8.65 | 4.66 | 4.32 | R3 = 4.32 | ≤4.76 | 4.32; 100.0% | NO | T |
| First context tokens | 20693 | 20691 | 20691 | R2, R3 = 20691 | ≤22760.10 | 2; 0.0% | yes | B |
| Peak context tokens | 68361 | 70896 | 72391 | R1 = 68361 | ≤75197.10 | 4030; 5.9% | yes | B |
| Cache-created tokens | 61083 | 63618 | 65113 | 61083–65113 | — | 4030; info | unmeasured / info | B |
| Cache-read tokens | 717609 | 890713 | 818974 | 717609–890713 | — | 173104; info | unmeasured / info | B |
| Output tokens | 11152 | 10009 | 11805 | 10009–11805 | — | 1796; info | unmeasured / info | B |
| Route-ready seconds | 6.53 | 3.14 | 2.78 | R3 = 2.78 | ≤3.06 | 3.75; 135.0% | NO | T |
| Map layer ms | 5592 | 2350 | 2055 | R3 = 2055 | ≤2260.50 | 3537; 172.1% | NO | T |
| Tool-result bytes | 95722 | 101544 | 105137 | 95722–105137 | — | 9415; info | unmeasured / info | B |
| Reading request waves | 5 | 5 | 7 | 5–7 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 2 | 0 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 14 | 11 | 20 | 11–20 | — | 9; info | unmeasured / info | W |
| Distinct inferred requested files | 14 | 13 | 22 | 13–22 | — | 9; info | unmeasured / info | W |
| Truth files requested | 9 | 8 | 15 | 8–15 | — | 7; info | unmeasured / info | W |
| Path-revisit bytes proxy | 7207 | 0 | 0 | 0–7207 | — | 7207; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 2 | 0 | 0 | R2, R3 = 0 | ≤0 | 2; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 6 | 5 | 3 | 3–6 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 11443 | 8792 | 13502 | 8792–13502 | — | 4710; info | unmeasured / info | Q |
| Correct named files | 39 | 38 | 45 | 38–45 | — | 7; info | unmeasured / info | Q |
| Non-truth named files | 6 | 10 | 18 | 6–18 | — | 12; info | unmeasured / info | Q |
| Delivered-map truth hits | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 95527 | 83523 | 95092 | 83523–95527 | — | 12004; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-5JrIo4**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: none. Eligible completed route candidates: none. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.4994 | none | 0.5494 |
| Harness turns | R3: 22 | none | 24.20 |
| Model/API requests | R1: 17 | none | 18.70 |
| Harness wall seconds | R2: 93 | none | 102.30 |
| Peak context tokens | R1: 68361 | none | 75197.10 |

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
      "command": "cd /private/tmp/e-5JrIo4/home/cwd/repo && git rev-parse --show-toplevel && grep -rlEi \"input_type|inputType|InputType|'Vision'|\\\"Vision\\\"|input_indicator\" --include=*.ts --include=*.html --include=*.json . --exclude-dir=node_modules 2>/dev/null | head -100",
      "description": "Find input type label usages in repo"
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "input_type|input_indicator|InputType\\b|Vision|\"CV\"|'CV'",
      "path": "/private/tmp/e-JNaUjT/home/cwd/repo",
      "output_mode": "count",
      "head_limit": 80
    }
  }
}
```

Correct paths only in R1:

- `main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.ts`
- `main/features/score-types/rula-reba/reba/components/manual-override-wizard/lower-arm/reba-lower-arm.component.html`
- `main/features/score-types/rula-reba/reba/components/shared/wrist/reba-wrist.component.html`
- `main/features/score-types/rula-reba/reba/components/shared/leg-position/reba-leg-position.component.html`
- `main/features/score-types/rula-reba/reba/components/shared/upper-arm/reba-upper-arm.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/leg-detail/reba-leg-detail.component.html`

Correct paths only in R2:

- `main/components/ui/tagged-metric/tagged-metric.component.stories.ts`
- `main/components/ui/card-button/card-button.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/wrist-detail/reba-wrist-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/lower-arm-detail/rula-lower-arm-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/wrist-position-detail/rula-wrist-position-detail.component.html`

Non-truth paths only in R1:

- `main/components/ui/effort-title-content/effort-title-content.component.html`
- `main/features/score-types/est/components/wizard/material-handling/lift-task-length-input/est-lift-task-length-input.component.html`
- `main/features/score-types/est/components/score-card/score-detail/hands/hand-repetition/est-hand-repetition-detail.component.html`
- `main/features/score-types/shared/utils/input-type-label.ts`
- `main/services/report.service.ts`
- `main/models/shared-report.model.ts`

Non-truth paths only in R2:

- `main/components/ui/tagged-metric/tagged-metric.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/activity-detail/reba-activity-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/force-load-detail/reba-force-load-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/coupling-detail/reba-coupling-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/wrist-twist-detail/rula-wrist-twist-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/muscle-use-upper-detail/rula-muscle-use-upper-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/muscle-use-lower-detail/rula-muscle-use-lower-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/force-load-upper-detail/rula-force-load-upper-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/force-load-lower-detail/rula-force-load-lower-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/legs-detail/rula-legs-detail.component.html`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-5JrIo4/home/cwd/repo && git rev-parse --show-toplevel && grep -rlEi \"input_type|inputType|InputType|'Vision'|\\\"Vision\\\"|input_indicator\" --include=*.ts --include=*.html --include=*.json . --exclude-dir=node_modules 2>/dev/null | head -100",
      "description": "Find input type label usages in repo"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-gEvsR7/home/cwd/repo 2>/dev/null && pwd && ls && git ls-files | wc -l; grep -rliE \"input_type|inputType|InputType\" --include=*.ts --include=*.html --include=*.json . 2>/dev/null | grep -v node_modules | head -80"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

- `main/components/ui/card-button/card-button.component.html`
- `main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/lower-arm-detail/reba-lower-arm-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/wrist-detail/reba-wrist-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/lower-arm-detail/rula-lower-arm-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/wrist-position-detail/rula-wrist-position-detail.component.html`

Non-truth paths only in R1:

- `main/components/ui/effort-title-content/effort-title-content.component.html`
- `main/features/score-types/est/components/wizard/material-handling/lift-task-length-input/est-lift-task-length-input.component.html`
- `main/features/score-types/shared/utils/input-type-label.ts`
- `main/services/report.service.ts`
- `main/models/shared-report.model.ts`

Non-truth paths only in R3:

- `main/components/inputs/cv-backed-form-field/cv-backed-form-field.component.ts`
- `main/features/score-types/rula-reba/reba/utils/reba-is-cv-checked.ts`
- `main/features/score-types/rula-reba/rula/utils/rula-is-cv-checked.ts`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/force-load-detail/reba-force-load-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/coupling-detail/reba-coupling-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/activity-detail/reba-activity-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/wrist-twist-detail/rula-wrist-twist-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/legs-detail/rula-legs-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/muscle-use-upper-detail/rula-muscle-use-upper-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/muscle-use-lower-detail/rula-muscle-use-lower-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/force-load-upper-detail/rula-force-load-upper-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/force-load-lower-detail/rula-force-load-lower-detail.component.html`
- `main/features/score-types/est/components/score-card/shared/cv-backed-metric/est-cv-backed-metric.component.ts`
- `main/features/score-types/est/components/score-card/score-detail/material-handling/lift-task-dimension/est-lift-task-dimension-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/reba-effort-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/rula-effort-detail.component.html`
- `main/features/score-types/est/components/score-card/score-detail/est-score-detail.component.html`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "input_type|input_indicator|InputType\\b|Vision|\"CV\"|'CV'",
      "path": "/private/tmp/e-JNaUjT/home/cwd/repo",
      "output_mode": "count",
      "head_limit": 80
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-gEvsR7/home/cwd/repo 2>/dev/null && pwd && ls && git ls-files | wc -l; grep -rliE \"input_type|inputType|InputType\" --include=*.ts --include=*.html --include=*.json . 2>/dev/null | grep -v node_modules | head -80"
    }
  }
}
```

Correct paths only in R2:

- `main/components/ui/tagged-metric/tagged-metric.component.stories.ts`

Correct paths only in R3:

- `main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.ts`
- `main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.html`
- `main/features/score-types/rula-reba/reba/components/manual-override-wizard/lower-arm/reba-lower-arm.component.html`
- `main/features/score-types/rula-reba/reba/components/shared/upper-arm/reba-upper-arm.component.html`
- `main/features/score-types/rula-reba/reba/components/shared/wrist/reba-wrist.component.html`
- `main/features/score-types/rula-reba/reba/components/shared/leg-position/reba-leg-position.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/leg-detail/reba-leg-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/lower-arm-detail/reba-lower-arm-detail.component.html`

Non-truth paths only in R2:

- `main/components/ui/tagged-metric/tagged-metric.component.html`

Non-truth paths only in R3:

- `main/components/inputs/cv-backed-form-field/cv-backed-form-field.component.ts`
- `main/features/score-types/rula-reba/reba/utils/reba-is-cv-checked.ts`
- `main/features/score-types/rula-reba/rula/utils/rula-is-cv-checked.ts`
- `main/features/score-types/est/components/score-card/shared/cv-backed-metric/est-cv-backed-metric.component.ts`
- `main/features/score-types/est/components/score-card/score-detail/hands/hand-repetition/est-hand-repetition-detail.component.html`
- `main/features/score-types/est/components/score-card/score-detail/material-handling/lift-task-dimension/est-lift-task-dimension-detail.component.html`
- `main/features/score-types/rula-reba/reba/components/score-card/effort-detail/reba-effort-detail.component.html`
- `main/features/score-types/rula-reba/rula/components/score-card/effort-detail/rula-effort-detail.component.html`
- `main/features/score-types/est/components/score-card/score-detail/est-score-detail.component.html`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/i18n/de.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/el.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/en.json (existing/unspecified) | included; 2; 14 | included; 1; 10 | included; 2; 11 |
| main/assets/i18n/en.original.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/es.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/ja.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/pt.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/sk.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | included; 2; — | included; 1; — | included; 2; — |
| main/components/inputs/cv-backed-form-field/cv-backed-form-field.component.html (existing/unspecified) | included; 2; 11 | included; 12; 14 | included; 2; 13 |
| main/components/inputs/cv-backed-form-field/cv-backed-form-field.component.scss (existing/unspecified) | omitted; 13; — | omitted; 14; — | omitted; —; — |
| main/components/ui/card-button/card-button.component.html (existing/unspecified) | omitted; 9; 11 | included; 22; — | included; 13; 13 |
| main/components/ui/card-button/card-button.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; 13; — |
| main/components/ui/card-button/card-button.component.spec.ts (existing/unspecified) | included; 2; — | included; 23; — | included; 2; — |
| main/components/ui/card-button/card-button.component.stories.ts (existing/unspecified) | omitted; 2; — | omitted; 23; — | omitted; 2; — |
| main/components/ui/card-button/card-button.component.ts (existing/unspecified) | included; 2; 11 | included; 22; — | included; 2; 13 |
| main/components/ui/tag/tag.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; 13; — |
| main/components/ui/tagged-metric/tagged-metric.component.stories.ts (existing/unspecified) | omitted; 9; — | included; 9; — | omitted; —; — |
| main/components/ui/tagged-metric/tagged-metric.component.ts (existing/unspecified) | included; 9; 11 | included; 9; 10 | included; 7; 9 |
| main/features/score-types/est/components/score-card/shared/cv-backed-metric/est-cv-backed-metric.component.html (existing/unspecified) | included; 9; 12 | included; 7; 10 | included; 10; — |
| main/features/score-types/est/components/score-card/shared/posture-scale-display/est-posture-scale-display.component.html (existing/unspecified) | included; 9; — | included; 20; — | included; 14; — |
| main/features/score-types/est/components/wizard/hands/hand-activity-level-input/est-hand-activity-level-input.component.html (existing/unspecified) | included; 2; — | included; 16; — | included; 2; 20 |
| main/features/score-types/est/components/wizard/hands/hand-repetition/est-hand-repetition.component.html (existing/unspecified) | included; 2; 12 | included; 9; 14 | included; 2; 19 |
| main/features/score-types/est/components/wizard/material-handling/lift-task-dimension/est-lift-task-dimension.component.scss (existing/unspecified) | omitted; —; — | omitted; 7; — | omitted; —; — |
| main/features/score-types/est/components/wizard/material-handling/lift-task-general-data/est-lift-task-general-data.component.html (existing/unspecified) | omitted; 2; — | omitted; —; — | omitted; 2; — |
| main/features/score-types/est/components/wizard/material-handling/lift-task-length-input/est-lift-task-length-input.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/est/components/wizard/shared/posture-scale-input/est-posture-scale-input.component.html (existing/unspecified) | included; 9; — | included; 20; — | included; 14; 20 |
| main/features/score-types/ge-adv/components/score-card/detail/shared/card-set-display/ge-adv-card-set-display.component.html (existing/unspecified) | omitted; 16; — | omitted; 21; — | omitted; 7; — |
| main/features/score-types/ge-adv/components/score-card/detail/shared/expandable-card-display/ge-adv-expandable-card-display.component.html (existing/unspecified) | omitted; 16; — | omitted; 21; — | omitted; 7; — |
| main/features/score-types/ge-adv/components/wizard/shared/card-checkbox-set/ge-adv-card-checkbox-set.component.html (existing/unspecified) | omitted; 16; — | omitted; 21; — | omitted; 7; — |
| main/features/score-types/ge-adv/components/wizard/shared/card-radio-button/ge-adv-card-radio-button.component.html (existing/unspecified) | omitted; 16; — | omitted; 21; — | omitted; 7; — |
| main/features/score-types/ge-adv/components/wizard/shared/expandable-card-checkbox/ge-adv-expandable-card-checkbox.component.html (existing/unspecified) | omitted; 16; — | omitted; 21; — | omitted; 7; — |
| main/features/score-types/lm-carry/components/manual-override-wizard/effort/lm-carry-manual-override-effort.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/lm-lift/components/manual-override-wizard/effort/lm-lift-manual-override-effort.component.html (existing/unspecified) | omitted; 2; — | omitted; 14; — | omitted; 2; — |
| main/features/score-types/lm-lift/components/manual-override-wizard/effort/lm-lift-manual-override-effort.component.scss (existing/unspecified) | omitted; —; — | omitted; 8; — | omitted; —; — |
| main/features/score-types/lm-lower/components/manual-override-wizard/effort/lm-lower-manual-override-effort.component.scss (existing/unspecified) | omitted; —; — | omitted; 8; — | omitted; —; — |
| main/features/score-types/rsi/components/manual-override-wizard/effort/rsi-manual-override-effort.component.html (existing/unspecified) | omitted; 2; — | omitted; 12; — | omitted; 2; — |
| main/features/score-types/rsi/components/manual-override-wizard/effort/rsi-manual-override-effort.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/reba/components/manual-override-wizard/lower-arm/reba-lower-arm.component.html (existing/unspecified) | included; 5; — | omitted; —; — | included; 11; — |
| main/features/score-types/rula-reba/reba/components/manual-override-wizard/neck/reba-neck.component.html (existing/unspecified) | included; 5; — | included; 9; 14 | included; 7; 12 |
| main/features/score-types/rula-reba/reba/components/manual-override-wizard/trunk/reba-trunk.component.html (existing/unspecified) | included; 5; — | included; 6; — | included; 7; — |
| main/features/score-types/rula-reba/reba/components/score-card/effort-detail/leg-detail/reba-leg-detail.component.html (existing/unspecified) | included; 16; — | omitted; —; — | included; 11; 19 |
| main/features/score-types/rula-reba/reba/components/score-card/effort-detail/lower-arm-detail/reba-lower-arm-detail.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | included; 14; — |
| main/features/score-types/rula-reba/reba/components/score-card/effort-detail/neck-detail/reba-neck-detail.component.html (existing/unspecified) | included; 5; — | included; 6; — | included; 10; — |
| main/features/score-types/rula-reba/reba/components/score-card/effort-detail/trunk-detail/reba-trunk-detail.component.html (existing/unspecified) | included; 5; — | included; 6; — | included; 10; — |
| main/features/score-types/rula-reba/reba/components/score-card/effort-detail/upper-arm-detail/reba-upper-arm-detail.component.html (existing/unspecified) | included; 16; — | included; 8; — | included; 10; 12 |
| main/features/score-types/rula-reba/reba/components/score-card/effort-detail/wrist-detail/reba-wrist-detail.component.html (existing/unspecified) | omitted; 20; — | included; 9; — | included; 10; — |
| main/features/score-types/rula-reba/reba/components/shared/leg-position/reba-leg-position.component.html (existing/unspecified) | included; 5; — | omitted; —; — | included; 11; — |
| main/features/score-types/rula-reba/reba/components/shared/upper-arm/reba-upper-arm.component.html (existing/unspecified) | included; 5; — | omitted; —; — | included; 11; — |
| main/features/score-types/rula-reba/reba/components/shared/wrist/reba-wrist.component.html (existing/unspecified) | included; 5; — | omitted; —; — | included; 11; — |
| main/features/score-types/rula-reba/rula/components/manual-override-wizard/lower-arm-position/rula-lower-arm-position.component.html (existing/unspecified) | included; 4; — | included; 21; — | included; 8; — |
| main/features/score-types/rula-reba/rula/components/manual-override-wizard/neck/rula-neck.component.html (existing/unspecified) | included; 4; — | included; 9; — | included; 7; — |
| main/features/score-types/rula-reba/rula/components/manual-override-wizard/trunk/rula-trunk.component.html (existing/unspecified) | included; 4; — | included; 9; — | included; 7; — |
| main/features/score-types/rula-reba/rula/components/manual-override-wizard/wrist-position/rula-wrist-position.component.html (existing/unspecified) | included; 4; — | included; 21; — | included; 8; — |
| main/features/score-types/rula-reba/rula/components/score-card/effort-detail/lower-arm-detail/rula-lower-arm-detail.component.html (existing/unspecified) | omitted; 4; — | included; 9; — | included; 8; — |
| main/features/score-types/rula-reba/rula/components/score-card/effort-detail/neck-detail/rula-neck-detail.component.html (existing/unspecified) | included; 4; — | included; 9; — | included; 8; — |
| main/features/score-types/rula-reba/rula/components/score-card/effort-detail/trunk-detail/rula-trunk-detail.component.html (existing/unspecified) | included; 4; — | included; 9; — | included; 8; — |
| main/features/score-types/rula-reba/rula/components/score-card/effort-detail/upper-arm-detail/rula-upper-arm-detail.component.html (existing/unspecified) | included; 4; — | included; 9; — | included; 8; — |
| main/features/score-types/rula-reba/rula/components/score-card/effort-detail/wrist-position-detail/rula-wrist-position-detail.component.html (existing/unspecified) | omitted; 4; — | included; 9; — | included; 8; — |
| main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.html (deleted) | omitted; —; — | omitted; —; — | included; 8; 20 |
| main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.scss (deleted) | omitted; —; — | omitted; —; — | omitted; 8; — |
| main/features/score-types/rula-reba/shared/components/display-card/rula-reba-display-card.component.ts (deleted) | included; 20; — | omitted; —; — | included; 8; — |
| main/features/score-types/rula-reba/shared/components/dotted-row/rula-reba-dotted-row.component.html (deleted) | omitted; 17; 23 | omitted; 10; — | omitted; 8; 12 |
| main/features/score-types/rula-reba/shared/components/dotted-row/rula-reba-dotted-row.component.scss (deleted) | omitted; 17; — | omitted; 10; — | omitted; 8; — |
| main/features/score-types/rula-reba/shared/components/dotted-row/rula-reba-dotted-row.component.ts (deleted) | included; 16; 17 | included; 9; 10 | included; 7; 9 |
| main/features/score-types/rula-reba/shared/models/rula-reba.model.ts (existing/unspecified) | included; 4; — | included; 6; 10 | included; 8; 12 |

Offline union of final path sets: R 68.7%, P 65.7%, F1 67.2%. Intersection: R 49.3%, P 100.0%, F1 66.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-5JrIo4](../../attempts/e-5JrIo4.md)
- [R2 e-JNaUjT](../../attempts/e-JNaUjT.md)
- [R3 e-gEvsR7](../../attempts/e-gEvsR7.md)


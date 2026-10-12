# fe-vs-6292-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R2 starts with the exact display text Cycle Time and later explicitly globs all locale JSON files. R1/R3 start with broader capped expressions and spend more work on scoring-family internals. Both weaker attempts nevertheless see locale paths (R1 tool 9 exposes 15; R3 lists the directory later), then omit 14 locale truth files from their final inventory. The loss is not explained solely by search truncation.

R2 is the strongest F1 witness and is substantially cheaper, with 40,205 tool bytes versus 68,357/70,198. R3 performs repeated family/validator/source exploration, then discusses translation-sync details without preserving the locale set in the scored answer.

**Proposed intervention:** Persist a translation-family receipt from key discovery through finalization. Read representative values and affected input templates in a batch; distinguish localisation files from code constants. Use R2 quality/resource behaviour as the reference.

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
| [R1 e-JN27oK](../../attempts/e-JN27oK.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-BaeT08](../../attempts/e-BaeT08.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-R3hQDX](../../attempts/e-R3hQDX.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.1591 | 0.4773 | 0.1591 | R2 = 0.4773 | ≥0.4295 | 0.3182; 66.7% | NO | Q |
| Historical-file precision | 0.7000 | 0.9545 | 0.6364 | R2 = 0.9545 | ≥0.8591 | 0.3182; 33.3% | NO | Q |
| Historical-file F1 | 0.2593 | 0.6364 | 0.2545 | R2 = 0.6364 | ≥0.5727 | 0.3818; 60.0% | NO | Q |
| Existing-at-base recall | 0.1842 | 0.5526 | 0.1842 | R2 = 0.5526 | ≥0.4974 | 0.3684; 66.7% | NO | Q |
| Created-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2760 | 0.2043 | 0.3503 | R2 = 0.2043 | ≤0.2247 | 0.1460; 71.4% | NO | B |
| Harness total cost $ | 0.2851 | 0.2141 | 0.3616 | R2 = 0.2141 | ≤0.2355 | 0.1475; 68.9% | NO | B |
| Judging cost $ | 0.0092 | 0.0098 | 0.0113 | 0.0092–0.0113 | — | 0.0021; info | unmeasured / info | B |
| Harness turns | 10 | 12 | 16 | R1 = 10 | ≤11 | 6; 60.0% | NO | W |
| Model/API requests | 9 | 6 | 12 | R2 = 6 | ≤6.60 | 6; 100.0% | NO | W |
| Tool calls | 9 | 11 | 15 | R1 = 9 | ≤9.90 | 6; 66.7% | NO | W |
| Harness wall seconds | 49 | 41 | 71 | R2 = 41 | ≤45.10 | 30; 73.2% | NO | T |
| Agent duration seconds | 39.20 | 32.91 | 62.34 | R2 = 32.91 | ≤36.20 | 29.43; 89.4% | NO | T |
| API duration seconds | 34.40 | 29.72 | 55.01 | R2 = 29.72 | ≤32.70 | 25.29; 85.1% | NO | T |
| Scaffold/setup seconds | 7.90 | 6.49 | 6.75 | R2 = 6.49 | ≤7.14 | 1.41; 21.7% | NO | T |
| Time to first request seconds | 3.61 | 4.10 | 3.94 | R1 = 3.61 | ≤3.97 | 0.4880; 13.5% | NO | T |
| First context tokens | 18613 | 18609 | 18675 | R2 = 18609 | ≤20469.90 | 66; 0.4% | yes | B |
| Peak context tokens | 51476 | 39404 | 54840 | R2 = 39404 | ≤43344.40 | 15436; 39.2% | NO | B |
| Cache-created tokens | 44198 | 32126 | 47562 | 32126–47562 | — | 15436; info | unmeasured / info | B |
| Cache-read tokens | 271820 | 152095 | 442219 | 152095–442219 | — | 290124; info | unmeasured / info | B |
| Output tokens | 4477 | 4537 | 7156 | 4477–7156 | — | 2679; info | unmeasured / info | B |
| Route-ready seconds | 2.41 | 2.46 | 2.44 | R1 = 2.41 | ≤2.65 | 0.0520; 2.2% | yes | T |
| Map layer ms | 1699 | 1715 | 1663 | R3 = 1663 | ≤1829.30 | 52; 3.1% | yes | T |
| Tool-result bytes | 68357 | 40205 | 70198 | 40205–70198 | — | 29993; info | unmeasured / info | B |
| Reading request waves | 3 | 2 | 7 | 2–7 | — | 5; info | unmeasured / info | W |
| Single-path read waves | 0 | 1 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Inferred read operands | 7 | 3 | 24 | 3–24 | — | 21; info | unmeasured / info | W |
| Distinct inferred requested files | 7 | 3 | 27 | 3–27 | — | 24; info | unmeasured / info | W |
| Truth files requested | 3 | 3 | 6 | 3–6 | — | 3; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 14367 | 0–14367 | — | 14367; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 5 | 4 | 1–5 | — | 4; info | unmeasured / info | W |
| Final answer bytes | 4843 | 5214 | 5255 | 4843–5255 | — | 412; info | unmeasured / info | Q |
| Correct named files | 7 | 21 | 7 | 7–21 | — | 14; info | unmeasured / info | Q |
| Non-truth named files | 3 | 1 | 4 | 1–4 | — | 3; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 38917 | 32641 | 62078 | 32641–62078 | — | 29437; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 14367 | 0–14367 | — | 14367; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 6 | 0–6 | — | 6; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-BaeT08**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R2 e-BaeT08. Eligible completed route candidates: R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.2043 | R2: 0.2043 | 0.2247 |
| Harness turns | R1: 10 | R2: 12 | 11 |
| Model/API requests | R2: 6 | R2: 6 | 6.60 |
| Harness wall seconds | R2: 41 | R2: 41 | 45.10 |
| Peak context tokens | R2: 39404 | R2: 39404 | 43344.40 |

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
      "pattern": "Cycle Time|cycleTime|cycle_time|CycleTime",
      "path": "/private/tmp/e-JN27oK/home/cwd/repo",
      "output_mode": "content",
      "-i": true,
      "head_limit": 60
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "Cycle Time",
      "path": "/private/tmp/e-BaeT08/home/cwd/repo",
      "output_mode": "content",
      "-i": true
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

- `main/assets/i18n/en.original.json`
- `main/assets/i18n/nb.json`
- `main/assets/i18n/es.json`
- `main/assets/i18n/cs.json`
- `main/assets/i18n/zh-TW.json`
- `main/assets/i18n/ko.json`
- `main/assets/i18n/el.json`
- `main/assets/i18n/fr.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/de.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/nl.json`

Non-truth paths only in R1:

- `features/score-types/niosh/services/niosh-manual-override-form.service.ts`
- `features/score-types/niosh/components/niosh-wizard/niosh-wizard.component.ts`
- `validators/scoring.validators.spec.ts`

Non-truth paths only in R2:

- `main/validators/scoring.validators.spec.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "Cycle Time|cycleTime|cycle_time|CycleTime",
      "path": "/private/tmp/e-JN27oK/home/cwd/repo",
      "output_mode": "content",
      "-i": true,
      "head_limit": 60
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "Cycle Time|cycleTime|cycle_time",
      "path": "/private/tmp/e-R3hQDX/home/cwd/repo",
      "-i": true,
      "output_mode": "content",
      "head_limit": 60
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `features/score-types/niosh/services/niosh-manual-override-form.service.ts`
- `features/score-types/niosh/components/niosh-wizard/niosh-wizard.component.ts`
- `validators/scoring.validators.spec.ts`

Non-truth paths only in R3:

- `main/validators/scoring.validators.spec.ts`
- `main/constants/time.constants.ts`
- `main/features/score-types/niosh/services/niosh-manual-override-form.service.ts`
- `main/features/score-types/niosh/components/niosh-wizard/niosh-wizard.component.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "Cycle Time",
      "path": "/private/tmp/e-BaeT08/home/cwd/repo",
      "output_mode": "content",
      "-i": true
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "Cycle Time|cycleTime|cycle_time",
      "path": "/private/tmp/e-R3hQDX/home/cwd/repo",
      "-i": true,
      "output_mode": "content",
      "head_limit": 60
    }
  }
}
```

Correct paths only in R2:

- `main/assets/i18n/en.original.json`
- `main/assets/i18n/nb.json`
- `main/assets/i18n/es.json`
- `main/assets/i18n/cs.json`
- `main/assets/i18n/zh-TW.json`
- `main/assets/i18n/ko.json`
- `main/assets/i18n/el.json`
- `main/assets/i18n/fr.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/de.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/nl.json`

Correct paths only in R3:

None.

Non-truth paths only in R2:

None.

Non-truth paths only in R3:

- `main/constants/time.constants.ts`
- `main/features/score-types/niosh/services/niosh-manual-override-form.service.ts`
- `main/features/score-types/niosh/components/niosh-wizard/niosh-wizard.component.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/i18n/cs.json (existing/unspecified) | omitted; 1; — | included; 2; — | omitted; 1; — |
| main/assets/i18n/de.json (existing/unspecified) | omitted; 9; — | included; 5; — | omitted; —; — |
| main/assets/i18n/el.json (existing/unspecified) | omitted; 1; — | included; 2; — | omitted; 1; — |
| main/assets/i18n/en.json (existing/unspecified) | included; 9; 4 | included; 1; 6 | included; 1; 4 |
| main/assets/i18n/en.original.json (existing/unspecified) | omitted; 9; — | included; 1; — | omitted; —; — |
| main/assets/i18n/es.json (existing/unspecified) | omitted; 1; — | included; 2; — | omitted; 1; 13 |
| main/assets/i18n/fr.json (existing/unspecified) | omitted; 9; — | included; 2; — | omitted; 1; — |
| main/assets/i18n/ja.json (existing/unspecified) | omitted; 9; — | included; 5; — | omitted; —; — |
| main/assets/i18n/ko.json (existing/unspecified) | omitted; 1; — | included; 2; — | omitted; 1; — |
| main/assets/i18n/nb.json (existing/unspecified) | omitted; 1; — | included; 2; — | omitted; 1; — |
| main/assets/i18n/nl.json (existing/unspecified) | omitted; 9; — | included; 5; — | omitted; —; — |
| main/assets/i18n/pt.json (existing/unspecified) | omitted; 9; — | included; 2; — | omitted; —; — |
| main/assets/i18n/sk.json (existing/unspecified) | omitted; 9; — | included; 5; — | omitted; —; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | omitted; 9; — | included; 5; — | omitted; —; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | omitted; 1; — | included; 2; — | omitted; 1; — |
| main/features/score-types/hal/components/shared/hal-manual-inputs/hal-manual-inputs.component.html (existing/unspecified) | omitted; —; — | omitted; 3; — | omitted; —; — |
| main/features/score-types/lm-carry/components/shared/lm-carry-manual-inputs/lm-carry-manual-inputs.component.html (existing/unspecified) | included; 2; — | included; 3; — | included; 2; — |
| main/features/score-types/lm-carry/components/shared/lm-carry-manual-inputs/lm-carry-manual-inputs.component.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/features/score-types/lm-lift/components/shared/lm-lift-manual-inputs/lm-lift-manual-inputs.component.html (existing/unspecified) | included; 2; 4 | included; 3; 7 | included; 2; 6 |
| main/features/score-types/lm-lift/components/shared/lm-lift-manual-inputs/lm-lift-manual-inputs.component.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; 6; 6 |
| main/features/score-types/lm-lower/components/shared/lm-lower-manual-inputs/lm-lower-manual-inputs.component.html (existing/unspecified) | included; 2; — | included; 3; — | included; 2; — |
| main/features/score-types/lm-lower/components/shared/lm-lower-manual-inputs/lm-lower-manual-inputs.component.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/features/score-types/lm-push-pull/components/shared/lm-push-pull-manual-inputs/lm-push-pull-manual-inputs.component.html (existing/unspecified) | included; 2; — | included; 3; — | included; 2; — |
| main/features/score-types/lm-push-pull/components/shared/lm-push-pull-manual-inputs/lm-push-pull-manual-inputs.component.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/features/score-types/niosh/components/shared/niosh-manual-inputs/niosh-manual-inputs.component.html (existing/unspecified) | included; 2; — | included; 3; — | included; 2; 6 |
| main/features/score-types/niosh/components/shared/niosh-manual-inputs/niosh-manual-inputs.component.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rsi/components/manual-override-wizard/effort/rsi-manual-override-effort.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rsi/components/manual-override-wizard/effort/rsi-manual-override-effort.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rsi/components/shared/rsi-manual-inputs/rsi-manual-inputs.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/reba/components/shared/leg-position/reba-leg-position.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/reba/components/shared/leg-position/reba-leg-position.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/reba/components/shared/wrist/reba-wrist.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/reba/components/shared/wrist/reba-wrist.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/rula/components/shared/lower-body-effort/rula-lower-body-effort.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/rula/components/shared/lower-body-effort/rula-lower-body-effort.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/rula/components/shared/upper-body-effort/rula-upper-body-effort.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/rula/components/shared/upper-body-effort/rula-upper-body-effort.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/cycle-time-input/cycle-time-input.component.html (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/cycle-time-input/cycle-time-input.component.scss (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/cycle-time-input/cycle-time-input.component.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/frequency-unit-select/frequency-unit-select.component.html (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/frequency-unit-select/frequency-unit-select.component.scss (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/frequency-unit-select/frequency-unit-select.component.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/validators/scoring.validators.ts (existing/unspecified) | included; 6; 8 | included; 1; 4 | included; 11; 12 |

Offline union of final path sets: R 47.7%, P 75.0%, F1 58.3%. Intersection: R 15.9%, P 100.0%, F1 27.5%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-JN27oK](../../attempts/e-JN27oK.md)
- [R2 e-BaeT08](../../attempts/e-BaeT08.md)
- [R3 e-R3hQDX](../../attempts/e-R3hQDX.md)


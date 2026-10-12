# fe-vs-6404-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R1 finds 21/26 truth files; R2 seven; R3 three. R3 reads upload-complete TS/HTML at tool 3 and sees 15 locale paths at tool 4, but leaves the owner family and locales out of the final answer. R2 also lists the owner directory at tool 12, after spending early reads on upload orchestration. Thus the first tool/query difference is earlier than the demonstrable owner/locale exclusion in the answer.

Correct agent costs are $0.13945/$0.13969/$0.14535: R1 is cheapest, contrary to the ranking suggested by judge-inclusive totals. R2 has the smallest peak context but fails quality. R3 is fastest in harness wall time while losing nearly all required paths; speed alone is an unsafe reference.

**Proposed intervention:** Use changed-key → owning component → locale family as explicit obligations and carry all three into the final inventory. Test selection separately from discovery. Prefer R1 quality-qualified agent cost; treat the lower-context/faster weak answers only as resource aspirations.

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
| [R1 e-TLs9vd](../../attempts/e-TLs9vd.md) | completed | done | true | 2 | 1 | 0 |
| [R2 e-ns5Akt](../../attempts/e-ns5Akt.md) | completed | done | true | 2 | 1 | 0 |
| [R3 e-rMOURr](../../attempts/e-rMOURr.md) | completed | done | true | 2 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.8077 | 0.2692 | 0.1154 | R1 = 0.8077 | ≥0.7269 | 0.6923; 85.7% | NO | Q |
| Historical-file precision | 0.9545 | 0.8750 | 0.7500 | R1 = 0.9545 | ≥0.8591 | 0.2045; 21.4% | NO | Q |
| Historical-file F1 | 0.8750 | 0.4118 | 0.2000 | R1 = 0.8750 | ≥0.7875 | 0.6750; 77.1% | NO | Q |
| Existing-at-base recall | 0.8077 | 0.2692 | 0.1154 | R1 = 0.8077 | ≥0.7269 | 0.6923; 85.7% | NO | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | 1 | 0.3333 | 0 | R1 = 1 | ≥0.9000 | 1; 100.0% | NO | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1394 | 0.1397 | 0.1454 | R1 = 0.1394 | ≤0.1534 | 0.0059; 4.2% | yes | B |
| Harness total cost $ | 0.1458 | 0.1447 | 0.1498 | R2 = 0.1447 | ≤0.1592 | 0.0051; 3.5% | yes | B |
| Judging cost $ | 0.0064 | 0.0050 | 0.0044 | 0.0044–0.0064 | — | 0.0020; info | unmeasured / info | B |
| Harness turns | 6 | 13 | 7 | R1 = 6 | ≤6.60 | 7; 116.7% | NO | W |
| Model/API requests | 6 | 8 | 6 | R1, R3 = 6 | ≤6.60 | 2; 33.3% | NO | W |
| Tool calls | 5 | 12 | 6 | R1 = 5 | ≤5.50 | 7; 140.0% | NO | W |
| Harness wall seconds | 39 | 37 | 33 | R3 = 33 | ≤36.30 | 6; 18.2% | NO | T |
| Agent duration seconds | 29.76 | 26.87 | 24.30 | R3 = 24.30 | ≤26.73 | 5.46; 22.5% | NO | T |
| API duration seconds | 22.08 | 23.04 | 19.86 | R3 = 19.86 | ≤21.84 | 3.18; 16.0% | NO | T |
| Scaffold/setup seconds | 7.66 | 7.68 | 7.14 | R3 = 7.14 | ≤7.86 | 0.5360; 7.5% | yes | T |
| Time to first request seconds | 5.12 | 4.88 | 4.83 | R3 = 4.83 | ≤5.31 | 0.2950; 6.1% | yes | T |
| First context tokens | 18788 | 18788 | 18721 | R3 = 18721 | ≤20593.10 | 67; 0.4% | yes | B |
| Peak context tokens | 28374 | 26544 | 30494 | R2 = 26544 | ≤29198.40 | 3950; 14.9% | NO | B |
| Cache-created tokens | 21096 | 19266 | 23216 | 19266–23216 | — | 3950; info | unmeasured / info | B |
| Cache-read tokens | 118247 | 156964 | 139724 | 118247–156964 | — | 38717; info | unmeasured / info | B |
| Output tokens | 3139 | 3120 | 2452 | 2452–3139 | — | 687; info | unmeasured / info | B |
| Route-ready seconds | 3.07 | 2.75 | 2.55 | R3 = 2.55 | ≤2.80 | 0.5240; 20.6% | NO | T |
| Map layer ms | 2460 | 1974 | 2025 | R2 = 1974 | ≤2171.40 | 486; 24.6% | NO | T |
| Tool-result bytes | 19899 | 13251 | 24102 | 13251–24102 | — | 10851; info | unmeasured / info | B |
| Reading request waves | 3 | 4 | 2 | 2–4 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 2 | 4 | 0 | 0–4 | — | 4; info | unmeasured / info | W |
| Inferred read operands | 6 | 4 | 6 | 4–6 | — | 2; info | unmeasured / info | W |
| Distinct inferred requested files | 7 | 4 | 6 | 4–7 | — | 3; info | unmeasured / info | W |
| Truth files requested | 4 | 4 | 4 | 4–4 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 16460 | 0–16460 | — | 16460; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 4 | 1 | 0–4 | — | 4; info | unmeasured / info | W |
| Final answer bytes | 4464 | 3541 | 3008 | 3008–4464 | — | 1456; info | unmeasured / info | Q |
| Correct named files | 21 | 7 | 3 | 3–21 | — | 18; info | unmeasured / info | Q |
| Non-truth named files | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | Q |
| Delivered-map truth hits | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 29431 | 26381 | 24039 | 24039–29431 | — | 5392; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 16460 | 0–16460 | — | 16460; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-TLs9vd**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-TLs9vd. Eligible completed route candidates: R1. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.1394 | R1: 0.1394 | 0.1534 |
| Harness turns | R1: 6 | R1: 6 | 6.60 |
| Model/API requests | R1, R3: 6 | R1: 6 | 6.60 |
| Harness wall seconds | R3: 33 | R1: 39 | 36.30 |
| Peak context tokens | R2: 26544 | R1: 28374 | 29198.40 |

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
      "command": "cd /private/tmp/e-TLs9vd/home/cwd/repo 2>/dev/null && pwd; grep -rIl -i \"upload completed\\|uploadCompleted\\|view assessments\\|viewAssessments\" --exclude-dir=node_modules --exclude-dir=.git . | head -30",
      "description": "Find upload-completed references in repo"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-ns5Akt/home/cwd/repo 2>/dev/null || cd repo; pwd; grep -rniE \"Upload Completed|View Assessments|uploadCompleted|upload_completed\" --include=*.ts --include=*.html --include=*.json . --exclude-dir=node_modules | head -30"
    }
  }
}
```

Correct paths only in R1:

- `main/screens/upload/components/upload-complete/upload-complete.component.html`
- `main/screens/upload/components/upload-complete/upload-complete.component.scss`
- `main/assets/i18n/cs.json`
- `main/assets/i18n/de.json`
- `main/assets/i18n/el.json`
- `main/assets/i18n/es.json`
- `main/assets/i18n/fr.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/ko.json`
- `main/assets/i18n/nb.json`
- `main/assets/i18n/nl.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/zh-TW.json`

Correct paths only in R2:

- `main/screens/upload/manual-assessment/manual-assessment.component.ts`

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
      "command": "cd /private/tmp/e-TLs9vd/home/cwd/repo 2>/dev/null && pwd; grep -rIl -i \"upload completed\\|uploadCompleted\\|view assessments\\|viewAssessments\" --exclude-dir=node_modules --exclude-dir=.git . | head -30",
      "description": "Find upload-completed references in repo"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/screens/upload/video-assessment/video-assessment.component.ts main/screens/upload/upload.component.ts main/screens/upload/upload.routes.ts",
      "description": "Read upload screen files"
    }
  }
}
```

Correct paths only in R1:

- `main/screens/upload/components/upload-complete/upload-complete.component.ts`
- `main/screens/upload/components/upload-complete/upload-complete.component.html`
- `main/screens/upload/components/upload-complete/upload-complete.component.scss`
- `main/assets/i18n/en.json`
- `main/assets/i18n/en.original.json`
- `main/assets/i18n/cs.json`
- `main/assets/i18n/de.json`
- `main/assets/i18n/el.json`
- `main/assets/i18n/es.json`
- `main/assets/i18n/fr.json`
- `main/assets/i18n/ja.json`
- `main/assets/i18n/ko.json`
- `main/assets/i18n/nb.json`
- `main/assets/i18n/nl.json`
- `main/assets/i18n/pt.json`
- `main/assets/i18n/sk.json`
- `main/assets/i18n/zh-CN.json`
- `main/assets/i18n/zh-TW.json`

Correct paths only in R3:

None.

Non-truth paths only in R1:

None.

Non-truth paths only in R3:

None.

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-ns5Akt/home/cwd/repo 2>/dev/null || cd repo; pwd; grep -rniE \"Upload Completed|View Assessments|uploadCompleted|upload_completed\" --include=*.ts --include=*.html --include=*.json . --exclude-dir=node_modules | head -30"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task investigate-files-request-need-touch main/screens/upload/video-assessment/video-assessment.component.ts main/screens/upload/upload.component.ts main/screens/upload/upload.routes.ts",
      "description": "Read upload screen files"
    }
  }
}
```

Correct paths only in R2:

- `main/screens/upload/manual-assessment/manual-assessment.component.ts`
- `main/screens/upload/components/upload-complete/upload-complete.component.ts`
- `main/assets/i18n/en.json`
- `main/assets/i18n/en.original.json`

Correct paths only in R3:

None.

Non-truth paths only in R2:

None.

Non-truth paths only in R3:

None.

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/i18n/cs.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/de.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/el.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/en.json (existing/unspecified) | included; 1; 4 | included; 2; 3 | omitted; 2; 3 |
| main/assets/i18n/en.original.json (existing/unspecified) | included; 1; — | included; 2; — | omitted; 2; — |
| main/assets/i18n/es.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/fr.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/ja.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/ko.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/nb.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/nl.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/pt.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/sk.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | included; 4; — | omitted; —; — | omitted; 4; — |
| main/screens/upload/components/upload-complete/upload-complete.component.html (deleted) | included; 3; — | omitted; 5; — | omitted; 3; — |
| main/screens/upload/components/upload-complete/upload-complete.component.scss (deleted) | included; 3; — | omitted; 6; — | omitted; 3; — |
| main/screens/upload/components/upload-complete/upload-complete.component.ts (deleted) | included; 4; — | included; 5; — | omitted; 5; — |
| main/screens/upload/manual-assessment/manual-assessment.component.html (existing/unspecified) | omitted; 4; — | omitted; 6; — | omitted; 5; — |
| main/screens/upload/manual-assessment/manual-assessment.component.ts (existing/unspecified) | omitted; 4; 5 | included; 5; 12 | omitted; 5; — |
| main/screens/upload/models/upload-step.model.ts (existing/unspecified) | included; 4; 3 | included; 11; — | included; —; 3 |
| main/screens/upload/upload.component.html (existing/unspecified) | included; 2; — | included; 6; 8 | included; 1; — |
| main/screens/upload/upload.component.ts (existing/unspecified) | included; 2; — | included; 5; 7 | included; 1; 1 |
| main/screens/upload/video-assessment/video-assessment.component.ts (existing/unspecified) | omitted; 4; 5 | omitted; —; — | omitted; 1; 1 |
| main/services/upload.service.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/state/report-list.facade.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |

Offline union of final path sets: R 84.6%, P 95.7%, F1 89.8%. Intersection: R 11.5%, P 75.0%, F1 20.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-TLs9vd](../../attempts/e-TLs9vd.md)
- [R2 e-ns5Akt](../../attempts/e-ns5Akt.md)
- [R3 e-rMOURr](../../attempts/e-rMOURr.md)


# fe-vs-6086-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

R2 recovers 12/34 truth files versus eight in R1 and ten in R3. Relative to R2, R1 omits report-toolbar HTML/TS, the new-assessment-type dialog HTML and en.original.json. R3 drops the toolbar/dialog while adding the report facade; it also proposes six different no-video/manual-view files outside truth.

R2 is the lowest-agent-cost and highest-F1 witness despite one failed call. R3 uses fewer API calls but delivers more bytes (62,485 versus 54,390) and a longer answer. Broad chatbot/VLM/manual searches lead to changing UI surfaces and speculative new views.

**Proposed intervention:** Traverse report entry/resolver → manual marker → visible consumers → translations with an explicit obligation matrix. Separate proposed design files from existing owners. Preserve R2 consumer coverage and bound unsupported alternative-view expansion.

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
| [R1 e-pqOcLe](../../attempts/e-pqOcLe.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-PLRRyf](../../attempts/e-PLRRyf.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-nsPEa8](../../attempts/e-nsPEa8.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.2353 | 0.3529 | 0.2941 | R2 = 0.3529 | ≥0.3176 | 0.1176; 33.3% | NO | Q |
| Historical-file precision | 0.4444 | 0.5217 | 0.3846 | R2 = 0.5217 | ≥0.4696 | 0.1371; 26.3% | NO | Q |
| Historical-file F1 | 0.3077 | 0.4211 | 0.3333 | R2 = 0.4211 | ≥0.3789 | 0.1134; 26.9% | NO | Q |
| Existing-at-base recall | 0.2353 | 0.3529 | 0.2941 | R2 = 0.3529 | ≥0.3176 | 0.1176; 33.3% | NO | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2758 | 0.2704 | 0.2764 | R2 = 0.2704 | ≤0.2975 | 0.0060; 2.2% | yes | B |
| Harness total cost $ | 0.2831 | 0.2772 | 0.2855 | R2 = 0.2772 | ≤0.3049 | 0.0083; 3.0% | yes | B |
| Judging cost $ | 0.0073 | 0.0068 | 0.0091 | 0.0068–0.0091 | — | 0.0023; info | unmeasured / info | B |
| Harness turns | 13 | 13 | 10 | R3 = 10 | ≤11 | 3; 30.0% | NO | W |
| Model/API requests | 12 | 12 | 10 | R3 = 10 | ≤11 | 2; 20.0% | NO | W |
| Tool calls | 12 | 12 | 9 | R3 = 9 | ≤9.90 | 3; 33.3% | NO | W |
| Harness wall seconds | 81 | 70 | 73 | R2 = 70 | ≤77 | 11; 15.7% | NO | T |
| Agent duration seconds | 66.94 | 56.39 | 59.40 | R2 = 56.39 | ≤62.02 | 10.56; 18.7% | NO | T |
| API duration seconds | 40.27 | 38.01 | 43.25 | R2 = 38.01 | ≤41.81 | 5.24; 13.8% | NO | T |
| Scaffold/setup seconds | 11.83 | 11.82 | 11.79 | R3 = 11.79 | ≤12.97 | 0.0400; 0.3% | yes | T |
| Time to first request seconds | 8.37 | 8.36 | 9.82 | R2 = 8.36 | ≤9.20 | 1.46; 17.4% | NO | T |
| First context tokens | 19119 | 19119 | 19116 | R3 = 19116 | ≤21027.60 | 3; 0.0% | yes | B |
| Peak context tokens | 45060 | 44788 | 47884 | R2 = 44788 | ≤49266.80 | 3096; 6.9% | yes | B |
| Cache-created tokens | 37782 | 37510 | 40606 | 37510–40606 | — | 3096; info | unmeasured / info | B |
| Cache-read tokens | 378355 | 372690 | 302016 | 302016–378355 | — | 76339; info | unmeasured / info | B |
| Output tokens | 4894 | 4580 | 5356 | 4580–5356 | — | 776; info | unmeasured / info | B |
| Route-ready seconds | 6.58 | 6.55 | 6.60 | R2 = 6.55 | ≤7.21 | 0.0530; 0.8% | yes | T |
| Map layer ms | 5649 | 5576 | 5633 | R2 = 5576 | ≤6133.60 | 73; 1.3% | yes | T |
| Tool-result bytes | 55724 | 54390 | 62485 | 54390–62485 | — | 8095; info | unmeasured / info | B |
| Reading request waves | 6 | 8 | 7 | 6–8 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 2 | 3 | 1 | 1–3 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 12 | 14 | 18 | 12–18 | — | 6; info | unmeasured / info | W |
| Distinct inferred requested files | 18 | 20 | 22 | 18–22 | — | 4; info | unmeasured / info | W |
| Truth files requested | 6 | 9 | 8 | 6–9 | — | 3; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 1 | 0 | R1, R3 = 0 | ≤0 | 1; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 1 | 0 | 0–1 | — | 1; info | unmeasured / info | W |
| Final answer bytes | 5851 | 4908 | 7496 | 4908–7496 | — | 2588; info | unmeasured / info | Q |
| Correct named files | 8 | 12 | 10 | 8–12 | — | 4; info | unmeasured / info | Q |
| Non-truth named files | 10 | 11 | 16 | 10–16 | — | 6; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 66448 | 55995 | 59008 | 55995–66448 | — | 10453; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-PLRRyf**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R2 e-PLRRyf. Eligible completed route candidates: R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.2704 | R2: 0.2704 | 0.2975 |
| Harness turns | R3: 10 | R2: 13 | 11 |
| Model/API requests | R3: 10 | R2: 12 | 11 |
| Harness wall seconds | R2: 70 | R2: 70 | 77 |
| Peak context tokens | R2: 44788 | R2: 44788 | 49266.80 |

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
      "command": "cd /private/tmp/e-pqOcLe/home/cwd/repo && git ls-files | grep -iE \"individual|assessment|manual\" | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-PLRRyf/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"individual|assessment\" | head -80"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

- `main/screens/report/components/report-toolbar/report-toolbar.component.html`
- `main/screens/report/components/report-toolbar/report-toolbar.component.ts`
- `main/screens/report/components/new-assessment-type-dialog/new-assessment-type-dialog.component.html`
- `main/assets/i18n/en.original.json`

Non-truth paths only in R1:

- `main/screens/report/components/score-cards/report-score-cards.component.ts`
- `main/screens/report/components/potential-solutions/report-potential-solutions.component.html`
- `main/screens/report/components/body-part-analysis/report-body-part-analysis.component.ts`
- `main/screens/upload/manual-assessment/manual-assessment.component.ts`

Non-truth paths only in R2:

- `main/services/upload.service.ts`
- `main/screens/report/components/body-part-analysis/report-body-part-analysis.component.html`
- `main/screens/report/components/report-aside/report-aside.component.html`
- `main/screens/report/components/potential-solutions/report-potential-solutions.component.ts`
- `main/features/potential-solutions/services/report-solutions.service.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-pqOcLe/home/cwd/repo && git ls-files | grep -iE \"individual|assessment|manual\" | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-nsPEa8/home/cwd/repo && git ls-files | grep -iE \"individual|assessment\" | head -80; grep -rliE \"chatbot|vlm|composite\" --include=*.ts --include=*.html . --exclude-dir=node_modules | head -50"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

- `main/state/report.facade.ts`
- `main/assets/i18n/en.original.json`

Non-truth paths only in R1:

- `main/screens/report/report.module.ts`
- `main/screens/report/components/potential-solutions/report-potential-solutions.component.html`
- `main/screens/upload/manual-assessment/manual-assessment.component.ts`
- `main/screens/report/components/no-video-placeholder/no-video-placeholder.component.ts`

Non-truth paths only in R3:

- `main/services/upload.service.ts`
- `main/screens/report/components/body-part-analysis/report-body-part-analysis.component.html`
- `main/screens/report/services/report-score-types.service.ts`
- `main/screens/report/components/score-cards/report-score-cards.component.html`
- `main/features/potential-solutions/services/report-solutions.service.ts`
- `main/features/ai-custom-solutions/state/ai-solutions.facade.ts`
- `main/features/vlm/state/vlm.facade.ts`
- `main/screens/report/components/report-no-video/report-no-video.component.ts`
- `main/screens/report/components/report-no-video/report-no-video.component.html`
- `main/screens/report/components/report-no-video/report-no-video.component.scss`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-PLRRyf/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"individual|assessment\" | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-nsPEa8/home/cwd/repo && git ls-files | grep -iE \"individual|assessment\" | head -80; grep -rliE \"chatbot|vlm|composite\" --include=*.ts --include=*.html . --exclude-dir=node_modules | head -50"
    }
  }
}
```

Correct paths only in R2:

- `main/screens/report/components/report-toolbar/report-toolbar.component.html`
- `main/screens/report/components/report-toolbar/report-toolbar.component.ts`
- `main/screens/report/components/new-assessment-type-dialog/new-assessment-type-dialog.component.html`

Correct paths only in R3:

- `main/state/report.facade.ts`

Non-truth paths only in R2:

- `main/screens/report/report.module.ts`
- `main/screens/report/components/report-aside/report-aside.component.html`
- `main/screens/report/components/potential-solutions/report-potential-solutions.component.ts`
- `main/screens/report/components/no-video-placeholder/no-video-placeholder.component.ts`

Non-truth paths only in R3:

- `main/screens/report/components/body-part-analysis/report-body-part-analysis.component.ts`
- `main/screens/report/services/report-score-types.service.ts`
- `main/screens/report/components/score-cards/report-score-cards.component.html`
- `main/screens/report/components/score-cards/report-score-cards.component.ts`
- `main/features/ai-custom-solutions/state/ai-solutions.facade.ts`
- `main/features/vlm/state/vlm.facade.ts`
- `main/screens/report/components/report-no-video/report-no-video.component.ts`
- `main/screens/report/components/report-no-video/report-no-video.component.html`
- `main/screens/report/components/report-no-video/report-no-video.component.scss`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/i18n/cs.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/de.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/el.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/en.json (existing/unspecified) | included; 4; — | included; 10; — | included; 8; 9 |
| main/assets/i18n/en.original.json (existing/unspecified) | omitted; 4; — | included; 10; — | included; 8; — |
| main/assets/i18n/es.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/fr.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/ja.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/ko.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/nb.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/nl.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/pt.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/sk.json (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/tables/report-table/report-table.component.html (existing/unspecified) | omitted; 2; — | omitted; —; — | omitted; 8; — |
| main/components/tables/report-table/report-table.component.ts (existing/unspecified) | omitted; 2; — | omitted; —; — | omitted; 8; 9 |
| main/components/ui/ReportDragDrop/ReportDragDrop.component.ts (existing/unspecified) | omitted; 2; — | omitted; —; — | omitted; —; — |
| main/models/Report.ts (existing/unspecified) | included; 2; 6 | included; —; 6 | included; —; 4 |
| main/screens/compare/compare.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/screens/compare/compare.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/screens/report/components/new-assessment-type-dialog/new-assessment-type-dialog.component.html (existing/unspecified) | omitted; 2; — | included; 1; 8 | omitted; 1; — |
| main/screens/report/components/new-assessment-type-dialog/new-assessment-type-dialog.component.ts (existing/unspecified) | omitted; 2; — | omitted; 1; — | omitted; 1; — |
| main/screens/report/components/report-toolbar/report-toolbar.component.html (existing/unspecified) | omitted; 2; — | included; 5; 8 | omitted; —; — |
| main/screens/report/components/report-toolbar/report-toolbar.component.ts (existing/unspecified) | omitted; 2; — | included; 5; — | omitted; —; — |
| main/screens/report/components/report-video/report-video.component.html (existing/unspecified) | included; 2; 6 | included; —; 7 | included; 8; 6 |
| main/screens/report/components/report-video/report-video.component.scss (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/screens/report/components/report-video/report-video.component.ts (existing/unspecified) | included; 2; — | included; —; 10 | included; —; — |
| main/screens/report/report.component.html (existing/unspecified) | included; 2; 3 | included; 3; 4 | included; —; 4 |
| main/screens/report/report.component.ts (existing/unspecified) | included; 2; 6 | included; 3; 4 | included; 4; 4 |
| main/screens/report/report.resolver.ts (existing/unspecified) | included; 2; 6 | included; —; 3 | included; —; — |
| main/screens/report/services/report-assessments.service.ts (existing/unspecified) | included; 2; 7 | included; 1; 7 | included; 1; 6 |
| main/services/report.service.ts (existing/unspecified) | omitted; 4; — | omitted; —; — | omitted; —; — |
| main/state/report.facade.ts (existing/unspecified) | omitted; —; — | omitted; 5; — | included; 3; 5 |

Offline union of final path sets: R 38.2%, P 37.1%, F1 37.7%. Intersection: R 23.5%, P 66.7%, F1 34.8%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-pqOcLe](../../attempts/e-pqOcLe.md)
- [R2 e-PLRRyf](../../attempts/e-PLRRyf.md)
- [R3 e-nsPEa8](../../attempts/e-nsPEa8.md)


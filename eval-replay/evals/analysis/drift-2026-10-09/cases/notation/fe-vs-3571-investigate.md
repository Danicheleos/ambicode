# fe-vs-3571-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The role/permission change crosses many UI consumers. R2 has the best F1; relative to it, R1 omits employee-list, report-aside, toolbar, score-cards, report-table HTML and modules documentation. R3 recovers a different consumer subset. This is a traversal/coverage decision after a common map.

R2 costs more and has more requests than R1, but also better recall and precision. R3 offers a lower-call quality-qualified witness. Blindly choosing R1 context/cost would discard required UI consumers.

**Proposed intervention:** Enumerate role-check consumers once, deduplicate by component family, then read owner/consumer spans in batches. A coverage matrix should distinguish structural permission logic from incidental historic edits and documentation.

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
| [R1 e-PQ1vQV](../../attempts/e-PQ1vQV.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-mJumsn](../../attempts/e-mJumsn.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-6hKVVE](../../attempts/e-6hKVVE.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.2464 | 0.3043 | 0.2899 | R2 = 0.3043 | ≥0.2739 | 0.0580; 19.0% | NO | Q |
| Historical-file precision | 0.7727 | 0.9130 | 0.9091 | R2 = 0.9130 | ≥0.8217 | 0.1403; 15.4% | NO | Q |
| Historical-file F1 | 0.3736 | 0.4565 | 0.4396 | R2 = 0.4565 | ≥0.4109 | 0.0829; 18.2% | NO | Q |
| Existing-at-base recall | 0.2462 | 0.3231 | 0.3077 | R2 = 0.3231 | ≥0.2908 | 0.0769; 23.8% | NO | Q |
| Created-file recall | 0.2500 | 0 | 0 | R1 = 0.2500 | ≥0.2250 | 0.2500; 100.0% | NO | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2334 | 0.3309 | 0.2724 | R1 = 0.2334 | ≤0.2568 | 0.0975; 41.8% | NO | B |
| Harness total cost $ | 0.2449 | 0.3424 | 0.2841 | R1 = 0.2449 | ≤0.2694 | 0.0975; 39.8% | NO | B |
| Judging cost $ | 0.0115 | 0.0115 | 0.0117 | 0.0115–0.0117 | — | 0.0002; info | unmeasured / info | B |
| Harness turns | 15 | 18 | 12 | R3 = 12 | ≤13.20 | 6; 50.0% | NO | W |
| Model/API requests | 10 | 12 | 8 | R3 = 8 | ≤8.80 | 4; 50.0% | NO | W |
| Tool calls | 14 | 17 | 11 | R3 = 11 | ≤12.10 | 6; 54.5% | NO | W |
| Harness wall seconds | 70 | 85 | 68 | R3 = 68 | ≤74.80 | 17; 25.0% | NO | T |
| Agent duration seconds | 59.95 | 73.41 | 54.46 | R3 = 54.46 | ≤59.90 | 18.95; 34.8% | NO | T |
| API duration seconds | 46.07 | 53.53 | 45.46 | R3 = 45.46 | ≤50.00 | 8.07; 17.8% | NO | T |
| Scaffold/setup seconds | 8.19 | 9.72 | 11.78 | R1 = 8.19 | ≤9.01 | 3.59; 43.8% | NO | T |
| Time to first request seconds | 5.23 | 4.36 | 4.90 | R2 = 4.36 | ≤4.80 | 0.8670; 19.9% | NO | T |
| First context tokens | 19126 | 18988 | 19057 | R2 = 18988 | ≤20886.80 | 138; 0.7% | yes | B |
| Peak context tokens | 38189 | 52162 | 47989 | R1 = 38189 | ≤42007.90 | 13973; 36.6% | NO | B |
| Cache-created tokens | 30911 | 44884 | 40711 | 30911–44884 | — | 13973; info | unmeasured / info | B |
| Cache-read tokens | 243534 | 390203 | 238214 | 238214–390203 | — | 151989; info | unmeasured / info | B |
| Output tokens | 6104 | 7331 | 6188 | 6104–7331 | — | 1227; info | unmeasured / info | B |
| Route-ready seconds | 3.03 | 3.35 | 2.79 | R3 = 2.79 | ≤3.07 | 0.5610; 20.1% | NO | T |
| Map layer ms | 2074 | 2251 | 1875 | R3 = 1875 | ≤2062.50 | 376; 20.1% | NO | T |
| Tool-result bytes | 37324 | 67530 | 59700 | 37324–67530 | — | 30206; info | unmeasured / info | B |
| Reading request waves | 4 | 9 | 5 | 4–9 | — | 5; info | unmeasured / info | W |
| Single-path read waves | 2 | 4 | 1 | 1–4 | — | 3; info | unmeasured / info | W |
| Inferred read operands | 7 | 19 | 18 | 7–19 | — | 12; info | unmeasured / info | W |
| Distinct inferred requested files | 13 | 26 | 23 | 13–26 | — | 13; info | unmeasured / info | W |
| Truth files requested | 10 | 16 | 12 | 10–16 | — | 6; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 18591 | 0–18591 | — | 18591; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 1 | 0 | 0 | R2, R3 = 0 | ≤0 | 1; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 3 | 6 | 3 | 3–6 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 7850 | 7714 | 7995 | 7714–7995 | — | 281; info | unmeasured / info | Q |
| Correct named files | 17 | 21 | 20 | 17–21 | — | 4; info | unmeasured / info | Q |
| Non-truth named files | 5 | 2 | 2 | 2–5 | — | 3; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 59610 | 73099 | 54133 | 54133–73099 | — | 18966; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 16571 | 0–16571 | — | 16571; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 5 | 0–5 | — | 5; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-mJumsn**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R2 e-mJumsn, R3 e-6hKVVE. Eligible completed route candidates: R2, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R1: 0.2334 | R3: 0.2724 | 0.2568 |
| Harness turns | R3: 12 | R3: 12 | 13.20 |
| Model/API requests | R3: 8 | R3: 8 | 8.80 |
| Harness wall seconds | R3: 68 | R3: 68 | 74.80 |
| Peak context tokens | R1: 38189 | R3: 47989 | 42007.90 |

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
      "command": "cd /private/tmp/e-PQ1vQV/home/cwd/repo && ls && git ls-files | wc -l && git ls-files | grep -iE \"role|permission|access|guard|auth|acl|user-type|usertype\" | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-mJumsn/home/cwd/repo && ls && git ls-files | wc -l && git ls-files | grep -iE 'role|permission|guard|access|auth' | head -80"
    }
  }
}
```

Correct paths only in R1:

- `main/models/User.spec.ts`
- `main/assets/screenshots/user_permissions_table.png`

Correct paths only in R2:

- `main/screens/employees-list/employees-list.component.html`
- `main/screens/report/components/report-aside/report-aside.component.html`
- `main/screens/report/components/report-toolbar/report-toolbar.component.html`
- `main/screens/report/components/score-cards/report-score-cards.component.html`
- `main/components/tables/report-table/report-table.component.html`
- `main/assets/helpPages/cs/modules.md`

Non-truth paths only in R1:

- `main/guards/non-viewer.guard.ts`
- `main/screens/report/components/report-video/report-video.component.ts`
- `main/features/amplitude/models/amplitude.model.ts`
- `main/screens/org-admin/org-admin.component.spec.ts`

Non-truth paths only in R2:

- `main/guards/role.guard.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-PQ1vQV/home/cwd/repo && ls && git ls-files | wc -l && git ls-files | grep -iE \"role|permission|access|guard|auth|acl|user-type|usertype\" | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-6hKVVE/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l",
      "description": "List repository files"
    }
  }
}
```

Correct paths only in R1:

- `main/models/User.spec.ts`
- `main/screens/reports-list/reports-list.component.html`
- `main/screens/employee/employee.component.html`
- `main/assets/screenshots/user_permissions_table.png`

Correct paths only in R3:

- `main/screens/report/components/report-toolbar/report-toolbar.component.ts`
- `main/screens/report/components/report-toolbar/report-toolbar.component.html`
- `main/screens/report/components/report-aside/report-aside.component.ts`
- `main/screens/report/components/report-aside/report-aside.component.html`
- `main/screens/employee/employee.component.ts`
- `main/assets/i18n/cs.json`
- `main/assets/helpPages/cs/modules.md`

Non-truth paths only in R1:

- `main/guards/non-viewer.guard.ts`
- `main/screens/report/components/report-video/report-video.component.ts`
- `main/features/amplitude/models/amplitude.model.ts`
- `main/guards/auth.guard.spec.ts`
- `main/screens/org-admin/org-admin.component.spec.ts`

Non-truth paths only in R3:

- `main/guards/role.guard.ts`
- `main/screens/employees-list/employees-list.component.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-mJumsn/home/cwd/repo && ls && git ls-files | wc -l && git ls-files | grep -iE 'role|permission|guard|access|auth' | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-6hKVVE/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l",
      "description": "List repository files"
    }
  }
}
```

Correct paths only in R2:

- `main/screens/reports-list/reports-list.component.html`
- `main/screens/employee/employee.component.html`
- `main/screens/employees-list/employees-list.component.html`
- `main/screens/report/components/score-cards/report-score-cards.component.html`
- `main/components/tables/report-table/report-table.component.html`

Correct paths only in R3:

- `main/screens/report/components/report-toolbar/report-toolbar.component.ts`
- `main/screens/report/components/report-aside/report-aside.component.ts`
- `main/screens/employee/employee.component.ts`
- `main/assets/i18n/cs.json`

Non-truth paths only in R2:

- `main/guards/auth.guard.spec.ts`

Non-truth paths only in R3:

- `main/screens/employees-list/employees-list.component.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| main/assets/helpPages/cs/modules.md (existing/unspecified) | omitted; 8; — | included; 5; — | included; 2; — |
| main/assets/helpPages/de/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/el/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/en/modules.md (existing/unspecified) | included; 8; 14 | included; 5; 7 | included; 2; 10 |
| main/assets/helpPages/es/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/fr/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/ja/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/ko/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/nb/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/nl/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/original/modules.md (existing/unspecified) | included; 8; — | included; 5; — | included; 2; — |
| main/assets/helpPages/pt/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/sk/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/zh-CN/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/helpPages/zh-TW/modules.md (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; —; — |
| main/assets/i18n/cs.json (existing/unspecified) | omitted; —; — | omitted; 5; — | included; 2; — |
| main/assets/i18n/de.json (existing/unspecified) | omitted; 6; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/el.json (existing/unspecified) | omitted; —; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/en.json (existing/unspecified) | included; 6; 14 | included; 5; 17 | included; 2; 10 |
| main/assets/i18n/en.original.json (existing/unspecified) | included; 6; — | included; 5; 17 | included; 2; 11 |
| main/assets/i18n/es.json (existing/unspecified) | omitted; —; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/fr.json (existing/unspecified) | omitted; —; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/ja.json (existing/unspecified) | omitted; 6; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/ko.json (existing/unspecified) | omitted; —; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/nb.json (existing/unspecified) | omitted; —; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/nl.json (existing/unspecified) | omitted; 6; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/pt.json (existing/unspecified) | omitted; 6; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/sk.json (existing/unspecified) | omitted; 6; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/zh-CN.json (existing/unspecified) | omitted; 6; — | omitted; 5; — | omitted; —; — |
| main/assets/i18n/zh-TW.json (existing/unspecified) | omitted; —; — | omitted; 5; — | omitted; —; — |
| main/assets/screenshots/user_permissions_table.png (existing/unspecified) | included; 1; — | omitted; 1; — | omitted; —; — |
| main/components/datadisplays/employee-notes/employee-notes.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/components/datadisplays/employee-notes/employee-notes.component.ts (existing/unspecified) | omitted; 5; — | omitted; 5; — | omitted; 5; — |
| main/components/dialogs/new-users-dialog/new-users-dialog.component.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| main/components/tables/report-table/report-table.component.html (existing/unspecified) | omitted; 9; — | included; —; 17 | omitted; —; — |
| main/components/tables/report-table/report-table.component.ts (existing/unspecified) | included; 5; — | included; 5; 16 | included; 5; 11 |
| main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| main/components/tables/user-table/user-table.component.ts (existing/unspecified) | included; 2; — | included; 2; — | included; 2; — |
| main/directives/hidden-from-viewer.directive.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/ai-custom-solutions/components/ai-solutions-card/ai-solutions-card.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/potential-solutions/services/report-solutions.service.ts (existing/unspecified) | omitted; 8; — | omitted; —; — | omitted; 7; — |
| main/features/score-types/hal/components/hal-score-card/hal-score-card.component.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/reba/components/score-card/reba-score-card.component.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/rula-reba/rula/components/score-card/rula-score-card.component.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/edit-wizard-section-button/edit-wizard-section-button.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/edit-wizard-section-button/edit-wizard-section-button.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/score-card/score-card-container/score-card-container.component.html (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/features/score-types/shared/components/score-card/score-card.module.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/guards/viewer.guard.spec.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/guards/viewer.guard.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/models/Auth.ts (existing/unspecified) | included; 1; 5 | included; 1; 6 | included; 2; 3 |
| main/models/User.spec.ts (created) | included; —; — | omitted; —; — | omitted; —; — |
| main/models/User.ts (existing/unspecified) | included; 2; 4 | included; 2; 4 | included; 2; 3 |
| main/screens/app/constants/app-routes.ts (existing/unspecified) | included; 9; 12 | included; 7; 8 | included; —; 10 |
| main/screens/app/nav-header/models/nav-header.constants.ts (existing/unspecified) | included; 5; 12 | included; 5; 7 | included; 5; 8 |
| main/screens/employee/employee.component.html (existing/unspecified) | included; 9; — | included; 13; 14 | omitted; —; — |
| main/screens/employee/employee.component.ts (existing/unspecified) | omitted; —; 14 | omitted; —; — | included; —; — |
| main/screens/employees-list/employees-list.component.html (existing/unspecified) | omitted; —; — | included; —; 16 | omitted; —; — |
| main/screens/employees-list/employees-list.module.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/screens/report/components/report-aside/report-aside.component.html (existing/unspecified) | omitted; 8; — | included; 11; 16 | included; 7; — |
| main/screens/report/components/report-aside/report-aside.component.ts (existing/unspecified) | omitted; 8; 14 | omitted; —; — | included; 7; 10 |
| main/screens/report/components/report-toolbar/report-toolbar.component.html (existing/unspecified) | omitted; 8; — | included; 11; 12 | included; 7; 11 |
| main/screens/report/components/report-toolbar/report-toolbar.component.ts (existing/unspecified) | omitted; 8; 14 | omitted; —; 12 | included; 7; 10 |
| main/screens/report/components/score-cards/report-score-cards.component.html (existing/unspecified) | omitted; 8; — | included; 11; — | omitted; 7; — |
| main/screens/report/components/score-cards/report-score-cards.component.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/screens/report/report.component.ts (existing/unspecified) | omitted; 8; 14 | omitted; —; — | omitted; 7; — |
| main/screens/reports-list/reports-list.component.html (existing/unspecified) | included; 9; — | included; 13; 14 | omitted; —; — |
| main/screens/reports-list/reports-list.module.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| main/state/user.facade.ts (existing/unspecified) | included; 2; — | included; 3; 4 | included; 2; 3 |

Offline union of final path sets: R 39.1%, P 79.4%, F1 52.4%. Intersection: R 18.8%, P 100.0%, F1 31.7%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-PQ1vQV](../../attempts/e-PQ1vQV.md)
- [R2 e-mJumsn](../../attempts/e-mJumsn.md)
- [R3 e-6hKVVE](../../attempts/e-6hKVVE.md)


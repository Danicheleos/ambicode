# be-vs-5941-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

Five of seven true files are stable. R3 adds OrganizationApi.spec and lowers precision to 0.833. It opens with a broader file listing than the settings-filtered R1/R2, then returns much more source.

R2 ties the best quality at $0.16350 and 35,877 tool bytes. R3 costs $0.23592 with 66,455 bytes and seven rather than five API calls. This volume increase has no observed recall payoff.

**Proposed intervention:** Deliver settings owner/schema/consumer spans together; suppress unrelated full-file/test reads unless a specific obligation remains unresolved. R2 supplies a quality-qualified resource anchor.

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
| [R1 e-6H3vCd](../../attempts/e-6H3vCd.md) | completed | done | true | 1 | 1 | 0 |
| [R2 e-8PHfAE](../../attempts/e-8PHfAE.md) | completed | done | true | 1 | 1 | 0 |
| [R3 e-qip2np](../../attempts/e-qip2np.md) | completed | done | true | 1 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.7143 | 0.7143 | 0.7143 | R1, R2, R3 = 0.7143 | ≥0.6429 | 0; 0.0% | yes | Q |
| Historical-file precision | 1 | 1 | 0.8333 | R1, R2 = 1 | ≥0.9000 | 0.1667; 16.7% | NO | Q |
| Historical-file F1 | 0.8333 | 0.8333 | 0.7692 | R1, R2 = 0.8333 | ≥0.7500 | 0.0641; 7.7% | yes | Q |
| Existing-at-base recall | 0.8333 | 0.8333 | 0.8333 | R1, R2, R3 = 0.8333 | ≥0.7500 | 0; 0.0% | yes | Q |
| Created-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1711 | 0.1635 | 0.2359 | R2 = 0.1635 | ≤0.1799 | 0.0724; 44.3% | NO | B |
| Harness total cost $ | 0.1814 | 0.1687 | 0.2411 | R2 = 0.1687 | ≤0.1856 | 0.0724; 42.9% | NO | B |
| Judging cost $ | 0.0103 | 0.0052 | 0.0051 | 0.0051–0.0103 | — | 0.0052; info | unmeasured / info | B |
| Harness turns | 7 | 6 | 11 | R2 = 6 | ≤6.60 | 5; 83.3% | NO | W |
| Model/API requests | 5 | 5 | 7 | R1, R2 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Tool calls | 6 | 5 | 10 | R2 = 5 | ≤5.50 | 5; 100.0% | NO | W |
| Harness wall seconds | 36 | 34 | 40 | R2 = 34 | ≤37.40 | 6; 17.6% | NO | T |
| Agent duration seconds | 30.28 | 29.15 | 34.50 | R2 = 29.15 | ≤32.07 | 5.34; 18.3% | NO | T |
| API duration seconds | 24.46 | 23.76 | 26.29 | R2 = 23.76 | ≤26.14 | 2.53; 10.7% | NO | T |
| Scaffold/setup seconds | 3.48 | 2.97 | 3.85 | R2 = 2.97 | ≤3.27 | 0.8790; 29.6% | NO | T |
| Time to first request seconds | 3.18 | 2.90 | 4.23 | R2 = 2.90 | ≤3.19 | 1.33; 45.8% | NO | T |
| First context tokens | 18783 | 18780 | 18643 | R3 = 18643 | ≤20507.30 | 140; 0.8% | yes | B |
| Peak context tokens | 36407 | 35487 | 48934 | R2 = 35487 | ≤39035.70 | 13447; 37.9% | NO | B |
| Cache-created tokens | 29129 | 28209 | 41656 | 28209–41656 | — | 13447; info | unmeasured / info | B |
| Cache-read tokens | 109634 | 104243 | 172347 | 104243–172347 | — | 68104; info | unmeasured / info | B |
| Output tokens | 3261 | 2980 | 3480 | 2980–3480 | — | 500; info | unmeasured / info | B |
| Route-ready seconds | 1.23 | 0.9770 | 1.19 | R2 = 0.9770 | ≤1.07 | 0.2510; 25.7% | NO | T |
| Map layer ms | 706 | 433 | 592 | R2 = 433 | ≤476.30 | 273; 63.0% | NO | T |
| Tool-result bytes | 37853 | 35877 | 66455 | 35877–66455 | — | 30578; info | unmeasured / info | B |
| Reading request waves | 3 | 2 | 3 | 2–3 | — | 1; info | unmeasured / info | W |
| Single-path read waves | 0 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Inferred read operands | 13 | 8 | 5 | 5–13 | — | 8; info | unmeasured / info | W |
| Distinct inferred requested files | 10 | 9 | 5 | 5–10 | — | 5; info | unmeasured / info | W |
| Truth files requested | 4 | 3 | 5 | 3–5 | — | 2; info | unmeasured / info | W |
| Path-revisit bytes proxy | 10089 | 0 | 4290 | 0–10089 | — | 10089; info | unmeasured / info | B |
| Regex-recognized helper read calls | 4 | 1 | 0 | 0–4 | — | 4; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 35383 | 16263 | 0 | 0–35383 | — | 35383; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 2 | 1 | 3 | 1–3 | — | 2; info | unmeasured / info | W |
| Final answer bytes | 5327 | 5114 | 4948 | 4948–5327 | — | 379; info | unmeasured / info | Q |
| Correct named files | 5 | 5 | 5 | 5–5 | — | 0; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 29993 | 28835 | 34167 | 28835–34167 | — | 5332; info | unmeasured / info | T |
| Engine reader receipts | 4 | 1 | 0 | 0–4 | — | 4; info | unmeasured / info | W |
| Engine reader served bytes | 35876 | 16263 | 0 | 0–35876 | — | 35876; info | unmeasured / info | B |
| Engine truncated reader operands | 2 | 0 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Engine served file/span entries | 11 | 6 | 0 | 0–11 | — | 11; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-8PHfAE**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-6H3vCd, R2 e-8PHfAE. Eligible completed route candidates: R1, R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.1635 | R2: 0.1635 | 0.1799 |
| Harness turns | R2: 6 | R2: 6 | 6.60 |
| Model/API requests | R1, R2: 5 | R1, R2: 5 | 5.50 |
| Harness wall seconds | R2: 34 | R2: 34 | 37.40 |
| Peak context tokens | R2: 35487 | R2: 35487 | 39035.70 |

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
      "command": "cd /private/tmp/e-6H3vCd/home/cwd/repo && git ls-files | grep -i -E \"setting|organi\" | head -80; ls"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-8PHfAE/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"organi|setting\" | head -80"
    }
  }
}
```

Correct paths only in R1:

None.

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
      "command": "cd /private/tmp/e-6H3vCd/home/cwd/repo && git ls-files | grep -i -E \"setting|organi\" | head -80; ls"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-qip2np/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -100; ls"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

None.

Non-truth paths only in R3:

- `src/api/OrginizationApi.spec.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-8PHfAE/home/cwd/repo 2>/dev/null && pwd && git ls-files | grep -iE \"organi|setting\" | head -80"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-qip2np/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -100; ls"
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

- `src/api/OrginizationApi.spec.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/api/Organization.ts (existing/unspecified) | included; 1; 2 | included; 1; 2 | included; 1; 5 |
| src/api/ReportRestrictions.spec.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; 1; — |
| src/api/validators/OrganizationValidators.spec.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/api/validators/OrganizationValidators.ts (existing/unspecified) | included; 1; 2 | included; 1; 5 | included; 1; 9 |
| src/controllers/OrganizationController.spec.ts (existing/unspecified) | included; 1; 4 | included; 1; — | included; 1; 10 |
| src/controllers/OrganizationController.ts (existing/unspecified) | included; 1; 4 | included; 1; 5 | included; 1; 6 |
| src/models/Organization.ts (existing/unspecified) | included; 1; — | included; 1; — | included; 2; 6 |

Offline union of final path sets: R 71.4%, P 83.3%, F1 76.9%. Intersection: R 71.4%, P 100.0%, F1 83.3%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-6H3vCd](../../attempts/e-6H3vCd.md)
- [R2 e-8PHfAE](../../attempts/e-8PHfAE.md)
- [R3 e-qip2np](../../attempts/e-qip2np.md)


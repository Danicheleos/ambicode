# be-vs-5075-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

All runs recover four of nine truth paths. Precision falls from 0.80 to 0.667 to 0.571 because extras grow from one to two to three; added paths include MedianScoring and Organization in the weaker answers. The delivered map has no truth hit.

R3 expands to 11 API calls and 59,183 result bytes, compared with eight and 49,259 for the best-F1 R1. R2 is cheaper than R1 but fails the joint quality floor through precision. More exploration mainly broadens the answer rather than recovering missing truth files.

**Proposed intervention:** Extract feature-specific analytics obligations before expanding the search. Verify every proposed change path against an obligation and label analogue/mock evidence separately. Improve the zero-hit map, then use R1 quality as the floor and R2 cost as an improvement objective.

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
| [R1 e-3cz7VB](../../attempts/e-3cz7VB.md) | completed | done | true | 0 | 1 | 0 |
| [R2 e-CgDeOh](../../attempts/e-CgDeOh.md) | completed | done | true | 0 | 1 | 0 |
| [R3 e-FK0pMy](../../attempts/e-FK0pMy.md) | completed | done | true | 0 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.4444 | 0.4444 | 0.4444 | R1, R2, R3 = 0.4444 | ≥0.4000 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.8000 | 0.6667 | 0.5714 | R1 = 0.8000 | ≥0.7200 | 0.2286; 28.6% | NO | Q |
| Historical-file F1 | 0.5714 | 0.5333 | 0.5000 | R1 = 0.5714 | ≥0.5143 | 0.0714; 12.5% | NO | Q |
| Existing-at-base recall | 0.5714 | 0.5714 | 0.5714 | R1, R2, R3 = 0.5714 | ≥0.5143 | 0; 0.0% | yes | Q |
| Created-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2174 | 0.2083 | 0.2680 | R2 = 0.2083 | ≤0.2292 | 0.0596; 28.6% | NO | B |
| Harness total cost $ | 0.2222 | 0.2130 | 0.2727 | R2 = 0.2130 | ≤0.2343 | 0.0596; 28.0% | NO | B |
| Judging cost $ | 0.0048 | 0.0047 | 0.0047 | 0.0047–0.0048 | — | 0.0001; info | unmeasured / info | B |
| Harness turns | 9 | 9 | 16 | R1, R2 = 9 | ≤9.90 | 7; 77.8% | NO | W |
| Model/API requests | 8 | 8 | 11 | R1, R2 = 8 | ≤8.80 | 3; 37.5% | NO | W |
| Tool calls | 8 | 8 | 15 | R1, R2 = 8 | ≤8.80 | 7; 87.5% | NO | W |
| Harness wall seconds | 40 | 38 | 44 | R2 = 38 | ≤41.80 | 6; 15.8% | NO | T |
| Agent duration seconds | 35.05 | 32.38 | 39.53 | R2 = 32.38 | ≤35.62 | 7.15; 22.1% | NO | T |
| API duration seconds | 29.82 | 26.71 | 36.19 | R2 = 26.71 | ≤29.38 | 9.48; 35.5% | NO | T |
| Scaffold/setup seconds | 3.56 | 3.52 | 2.49 | R3 = 2.49 | ≤2.74 | 1.07; 42.8% | NO | T |
| Time to first request seconds | 2.82 | 2.80 | 2.44 | R3 = 2.44 | ≤2.68 | 0.3810; 15.6% | NO | T |
| First context tokens | 18943 | 18942 | 18947 | R2 = 18942 | ≤20836.20 | 5; 0.0% | yes | B |
| Peak context tokens | 42174 | 41120 | 48409 | R2 = 41120 | ≤45232.00 | 7289; 17.7% | NO | B |
| Cache-created tokens | 34896 | 33842 | 41131 | 33842–41131 | — | 7289; info | unmeasured / info | B |
| Cache-read tokens | 195365 | 196210 | 275666 | 195365–275666 | — | 80301; info | unmeasured / info | B |
| Output tokens | 3874 | 3368 | 4826 | 3368–4826 | — | 1458; info | unmeasured / info | B |
| Route-ready seconds | 1.01 | 0.9980 | 0.9940 | R3 = 0.9940 | ≤1.09 | 0.0150; 1.5% | yes | T |
| Map layer ms | 513 | 521 | 437 | R3 = 437 | ≤480.70 | 84; 19.2% | NO | T |
| Tool-result bytes | 49259 | 47761 | 59183 | 47761–59183 | — | 11422; info | unmeasured / info | B |
| Reading request waves | 4 | 3 | 5 | 3–5 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 1 | 0 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 12 | 9 | 12 | 9–12 | — | 3; info | unmeasured / info | W |
| Distinct inferred requested files | 12 | 11 | 19 | 11–19 | — | 8; info | unmeasured / info | W |
| Truth files requested | 4 | 5 | 3 | 3–5 | — | 2; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 3338 | 16276 | 0–16276 | — | 16276; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 1 | R1, R2 = 0 | ≤0 | 1; — | NO | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 1 | 4 | 1–4 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 4102 | 4186 | 4289 | 4102–4289 | — | 187; info | unmeasured / info | Q |
| Correct named files | 4 | 4 | 4 | 4–4 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 1 | 2 | 3 | 1–3 | — | 2; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 34766 | 32109 | 39172 | 32109–39172 | — | 7063; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R1 e-3cz7VB**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-3cz7VB. Eligible completed route candidates: R1. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.2083 | R1: 0.2174 | 0.2292 |
| Harness turns | R1, R2: 9 | R1: 9 | 9.90 |
| Model/API requests | R1, R2: 8 | R1: 8 | 8.80 |
| Harness wall seconds | R2: 38 | R1: 40 | 41.80 |
| Peak context tokens | R2: 41120 | R1: 42174 | 45232.00 |

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
      "command": "cd /private/tmp/e-3cz7VB/home/cwd/repo && git ls-files | grep -i -E \"dashboard|score-type|scoreType\" | head -80; grep -ril \"dashboard\" src | head -40",
      "description": "Find dashboard and score-type files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-CgDeOh/home/cwd/repo && git ls-files | grep -i -E \"dashboard|score-type\" | head -100; grep -rli \"dashboard\" src | head -50"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `src/features/score-types/ge-adv/mocks/ge-adv.mocks.ts`

Non-truth paths only in R2:

- `src/utils/Median.ts`
- `src/api/validators/AnalyticsValidators.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-3cz7VB/home/cwd/repo && git ls-files | grep -i -E \"dashboard|score-type|scoreType\" | head -80; grep -ril \"dashboard\" src | head -40",
      "description": "Find dashboard and score-type files"
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "(?i)dashboard",
      "path": "/private/tmp/e-FK0pMy/home/cwd/repo/src",
      "output_mode": "files_with_matches"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `src/features/score-types/ge-adv/mocks/ge-adv.mocks.ts`

Non-truth paths only in R3:

- `src/utils/Median.ts`
- `src/models/Scoring.ts`
- `src/models/Organization.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-CgDeOh/home/cwd/repo && git ls-files | grep -i -E \"dashboard|score-type\" | head -100; grep -rli \"dashboard\" src | head -50"
    }
  },
  "b": {
    "call": 1,
    "name": "Grep",
    "input": {
      "pattern": "(?i)dashboard",
      "path": "/private/tmp/e-FK0pMy/home/cwd/repo/src",
      "output_mode": "files_with_matches"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `src/api/validators/AnalyticsValidators.ts`

Non-truth paths only in R3:

- `src/models/Scoring.ts`
- `src/models/Organization.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| package.json (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/api/Analytics.ts (existing/unspecified) | included; —; 6 | included; —; 7 | included; 8; 9 |
| src/api/AnalyticsApi.spec.ts (existing/unspecified) | included; 7; 7 | included; —; 7 | included; 8; — |
| src/api/middleware/abort-signal.middleware.ts (created) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/app.ts (existing/unspecified) | omitted; —; — | omitted; —; 6 | omitted; —; — |
| src/controllers/AnalyticsController.spec.ts (existing/unspecified) | included; 7; 7 | included; —; 8 | included; 8; 15 |
| src/controllers/AnalyticsController.ts (existing/unspecified) | included; 3; 6 | included; 3; 5 | included; 5; 6 |
| src/errors.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| tsconfig.app.json (created) | omitted; —; — | omitted; —; — | omitted; —; — |

Offline union of final path sets: R 44.4%, P 44.4%, F1 44.4%. Intersection: R 44.4%, P 100.0%, F1 61.5%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-3cz7VB](../../attempts/e-3cz7VB.md)
- [R2 e-CgDeOh](../../attempts/e-CgDeOh.md)
- [R3 e-FK0pMy](../../attempts/e-FK0pMy.md)


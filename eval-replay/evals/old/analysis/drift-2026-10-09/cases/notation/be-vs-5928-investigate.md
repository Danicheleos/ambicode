# be-vs-5928-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

All six true files are named. R3 adds an additional validator spec beyond the controller-spec extra in the other answers; precision drops from 0.857 to 0.75. The first reads differ: R2 starts with the DTO/shared-schema relation rather than a broad catalogue.

R2 keeps best F1 with 30,028 tool bytes, six API calls and $0.16603 agent cost. R1/R3 deliver 39,696/45,949 bytes and cost $0.21506/$0.21814. This is a useful efficient witness, not proof that the first command alone produced the improvement.

**Proposed intervention:** Prefer a DTO → validator → controller/schema dependency batch. Separate test recommendations from files demonstrated to require changes, retaining all six truth paths.

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
| [R1 e-cq9BIu](../../attempts/e-cq9BIu.md) | completed | done | true | 4 | 1 | 0 |
| [R2 e-L870kY](../../attempts/e-L870kY.md) | completed | done | true | 4 | 1 | 0 |
| [R3 e-2kzIAl](../../attempts/e-2kzIAl.md) | completed | done | true | 4 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.8571 | 0.8571 | 0.7500 | R1, R2 = 0.8571 | ≥0.7714 | 0.1071; 12.5% | NO | Q |
| Historical-file F1 | 0.9231 | 0.9231 | 0.8571 | R1, R2 = 0.9231 | ≥0.8308 | 0.0659; 7.1% | yes | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2151 | 0.1660 | 0.2181 | R2 = 0.1660 | ≤0.1826 | 0.0521; 31.4% | NO | B |
| Harness total cost $ | 0.2201 | 0.1709 | 0.2266 | R2 = 0.1709 | ≤0.1880 | 0.0557; 32.6% | NO | B |
| Judging cost $ | 0.0051 | 0.0048 | 0.0085 | 0.0048–0.0085 | — | 0.0036; info | unmeasured / info | B |
| Harness turns | 8 | 6 | 8 | R2 = 6 | ≤6.60 | 2; 33.3% | NO | W |
| Model/API requests | 7 | 6 | 7 | R2 = 6 | ≤6.60 | 1; 16.7% | NO | W |
| Tool calls | 7 | 5 | 7 | R2 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Harness wall seconds | 41 | 29 | 36 | R2 = 29 | ≤31.90 | 12; 41.4% | NO | T |
| Agent duration seconds | 36.39 | 24.59 | 31.39 | R2 = 24.59 | ≤27.05 | 11.80; 48.0% | NO | T |
| API duration seconds | 33.54 | 22.24 | 25.24 | R2 = 22.24 | ≤24.47 | 11.30; 50.8% | NO | T |
| Scaffold/setup seconds | 2.94 | 2.75 | 2.95 | R2 = 2.75 | ≤3.02 | 0.2070; 7.5% | yes | T |
| Time to first request seconds | 3.30 | 3.02 | 2.88 | R3 = 2.88 | ≤3.16 | 0.4280; 14.9% | NO | T |
| First context tokens | 19207 | 19067 | 19208 | R2 = 19067 | ≤20973.70 | 141; 0.7% | yes | B |
| Peak context tokens | 41141 | 34753 | 43765 | R2 = 34753 | ≤38228.30 | 9012; 25.9% | NO | B |
| Cache-created tokens | 33863 | 27475 | 36487 | 27475–36487 | — | 9012; info | unmeasured / info | B |
| Cache-read tokens | 195138 | 135234 | 187174 | 135234–195138 | — | 59904; info | unmeasured / info | B |
| Output tokens | 4055 | 2906 | 3473 | 2906–4055 | — | 1149; info | unmeasured / info | B |
| Route-ready seconds | 0.8450 | 0.8650 | 1.03 | R1 = 0.8450 | ≤0.9295 | 0.1900; 22.5% | NO | T |
| Map layer ms | 376 | 371 | 438 | R2 = 371 | ≤408.10 | 67; 18.1% | NO | T |
| Tool-result bytes | 39696 | 30028 | 45949 | 30028–45949 | — | 15921; info | unmeasured / info | B |
| Reading request waves | 3 | 5 | 3 | 3–5 | — | 2; info | unmeasured / info | W |
| Single-path read waves | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Inferred read operands | 15 | 12 | 12 | 12–15 | — | 3; info | unmeasured / info | W |
| Distinct inferred requested files | 17 | 21 | 21 | 17–21 | — | 4; info | unmeasured / info | W |
| Truth files requested | 6 | 6 | 5 | 5–6 | — | 1; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 1 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 9361 | 0 | 15892 | 0–15892 | — | 15892; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Final answer bytes | 4241 | 3942 | 3859 | 3859–4241 | — | 382; info | unmeasured / info | Q |
| Correct named files | 6 | 6 | 6 | 6–6 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 1 | 1 | 2 | 1–2 | — | 1; info | unmeasured / info | Q |
| Delivered-map truth hits | 4 | 4 | 4 | 4–4 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 36098 | 24283 | 31018 | 24283–36098 | — | 11815; info | unmeasured / info | T |
| Engine reader receipts | 1 | 0 | 1 | 0–1 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 9361 | 0 | 15892 | 0–15892 | — | 15892; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 5 | 0 | 7 | 0–7 | — | 7; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R2 e-L870kY**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-cq9BIu, R2 e-L870kY. Eligible completed route candidates: R1, R2. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R2: 0.1660 | R2: 0.1660 | 0.1826 |
| Harness turns | R2: 6 | R2: 6 | 6.60 |
| Model/API requests | R2: 6 | R2: 6 | 6.60 |
| Harness wall seconds | R2: 29 | R2: 29 | 31.90 |
| Peak context tokens | R2: 34753 | R2: 34753 | 38228.30 |

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
      "command": "cd /private/tmp/e-cq9BIu/home/cwd/repo && ls && ls src/features/score-types/ge-adv src/features/score-types/ge-adv/* && grep -rIl -i \"geAdvFingers\\|ge-adv-fingers\" . --exclude-dir=node_modules --exclude-dir=.git | head -50",
      "description": "List repo and find finger references"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-L870kY/home/cwd/repo && ls src/features/score-types/ge-adv src/features/score-types/ge-adv/* && cat src/features/score-types/ge-adv/models/dto/ge-adv-fingers.dto.ts src/features/score-types/ge-adv/models/schemas/ge-adv-fingers.schema.ts src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.ts"
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
      "command": "cd /private/tmp/e-cq9BIu/home/cwd/repo && ls && ls src/features/score-types/ge-adv src/features/score-types/ge-adv/* && grep -rIl -i \"geAdvFingers\\|ge-adv-fingers\" . --exclude-dir=node_modules --exclude-dir=.git | head -50",
      "description": "List repo and find finger references"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-2kzIAl/home/cwd/repo 2>/dev/null && pwd && ls && git ls-files | grep -i -E \"adv\" | head -80"
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

- `src/features/score-types/ge-adv/validators/ge-adv.validators.spec.ts`

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-L870kY/home/cwd/repo && ls src/features/score-types/ge-adv src/features/score-types/ge-adv/* && cat src/features/score-types/ge-adv/models/dto/ge-adv-fingers.dto.ts src/features/score-types/ge-adv/models/schemas/ge-adv-fingers.schema.ts src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.ts"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-2kzIAl/home/cwd/repo 2>/dev/null && pwd && ls && git ls-files | grep -i -E \"adv\" | head -80"
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

- `src/features/score-types/ge-adv/validators/ge-adv.validators.spec.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/features/score-types/ge-adv/mocks/ge-adv.mocks.ts (existing/unspecified) | included; 1; 5 | included; 3; 4 | included; 1; 6 |
| src/features/score-types/ge-adv/models/dto/ge-adv-fingers.dto.ts (existing/unspecified) | included; 1; 2 | included; 3; 1 | included; 1; 2 |
| src/features/score-types/ge-adv/models/schemas/ge-adv-fingers.schema.ts (existing/unspecified) | included; 1; 2 | included; 3; 1 | included; 1; 2 |
| src/features/score-types/ge-adv/models/shared/ge-adv-fingers.ts (existing/unspecified) | included; 1; 2 | included; 3; 2 | included; 1; 2 |
| src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.spec.ts (existing/unspecified) | included; 1; 5 | included; 3; 5 | included; 1; — |
| src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.ts (existing/unspecified) | included; 1; 2 | included; 3; 1 | included; 1; 2 |

Offline union of final path sets: R 100.0%, P 75.0%, F1 85.7%. Intersection: R 100.0%, P 85.7%, F1 92.3%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-cq9BIu](../../attempts/e-cq9BIu.md)
- [R2 e-L870kY](../../attempts/e-L870kY.md)
- [R3 e-2kzIAl](../../attempts/e-2kzIAl.md)


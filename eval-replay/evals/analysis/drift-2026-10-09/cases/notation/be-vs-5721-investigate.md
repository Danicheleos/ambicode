# be-vs-5721-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The same three truth files are found every time. R1 adds Auth.spec, R2 adds token middleware plus an auth spec, and R3 adds none. The drift is answer scope around user deletion, rather than a missing source discovery.

R3 is both the quality and resource witness: precision 1.00, four API calls, 8,850 tool bytes, agent cost $0.09746. R1/R2 take six requests and retain 13–14 KB of results without additional true files.

**Proposed intervention:** Require a change reason for each final path. Deletion/authentication context may be evidence while remaining outside the change surface. Reproduce the three-file core with one bounded owner/route/schema batch.

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
| [R1 e-Dh1UDY](../../attempts/e-Dh1UDY.md) | completed | done | true | 3 | 1 | 0 |
| [R2 e-2Bfk7S](../../attempts/e-2Bfk7S.md) | completed | done | true | 3 | 1 | 0 |
| [R3 e-18w1Kb](../../attempts/e-18w1Kb.md) | completed | done | true | 3 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0.6000 | 0.6000 | 0.6000 | R1, R2, R3 = 0.6000 | ≥0.5400 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.7500 | 0.6000 | 1 | R3 = 1 | ≥0.9000 | 0.4000; 40.0% | NO | Q |
| Historical-file F1 | 0.6667 | 0.6000 | 0.7500 | R3 = 0.7500 | ≥0.6750 | 0.1500; 20.0% | NO | Q |
| Existing-at-base recall | 0.6000 | 0.6000 | 0.6000 | R1, R2, R3 = 0.6000 | ≥0.5400 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1165 | 0.1237 | 0.0975 | R3 = 0.0975 | ≤0.1072 | 0.0262; 26.9% | NO | B |
| Harness total cost $ | 0.1195 | 0.1286 | 0.1031 | R3 = 0.1031 | ≤0.1134 | 0.0255; 24.7% | NO | B |
| Judging cost $ | 0.0030 | 0.0049 | 0.0056 | 0.0030–0.0056 | — | 0.0027; info | unmeasured / info | B |
| Harness turns | 6 | 8 | 7 | R1 = 6 | ≤6.60 | 2; 33.3% | NO | W |
| Model/API requests | 6 | 6 | 4 | R3 = 4 | ≤4.40 | 2; 50.0% | NO | W |
| Tool calls | 5 | 7 | 6 | R1 = 5 | ≤5.50 | 2; 40.0% | NO | W |
| Harness wall seconds | 31 | 29 | 28 | R3 = 28 | ≤30.80 | 3; 10.7% | NO | T |
| Agent duration seconds | 25.83 | 24.54 | 22.86 | R3 = 22.86 | ≤25.15 | 2.96; 13.0% | NO | T |
| API duration seconds | 21.08 | 22.58 | 19.07 | R3 = 19.07 | ≤20.98 | 3.51; 18.4% | NO | T |
| Scaffold/setup seconds | 3.11 | 2.81 | 2.85 | R2 = 2.81 | ≤3.09 | 0.3030; 10.8% | NO | T |
| Time to first request seconds | 3.53 | 3.44 | 4.71 | R2 = 3.44 | ≤3.79 | 1.27; 36.8% | NO | T |
| First context tokens | 18583 | 18581 | 18515 | R3 = 18515 | ≤20366.50 | 68; 0.4% | yes | B |
| Peak context tokens | 25543 | 25866 | 23550 | R3 = 23550 | ≤25905.00 | 2316; 9.8% | yes | B |
| Cache-created tokens | 18265 | 18588 | 16272 | 16272–18588 | — | 2316; info | unmeasured / info | B |
| Cache-read tokens | 110005 | 111889 | 65483 | 65483–111889 | — | 46406; info | unmeasured / info | B |
| Output tokens | 2143 | 2692 | 1926 | 1926–2692 | — | 766; info | unmeasured / info | B |
| Route-ready seconds | 0.9300 | 0.8730 | 0.8500 | R3 = 0.8500 | ≤0.9350 | 0.0800; 9.4% | yes | T |
| Map layer ms | 355 | 409 | 365 | R1 = 355 | ≤390.50 | 54; 15.2% | NO | T |
| Tool-result bytes | 13036 | 13641 | 8850 | 8850–13641 | — | 4791; info | unmeasured / info | B |
| Reading request waves | 2 | 2 | 1 | 1–2 | — | 1; info | unmeasured / info | W |
| Single-path read waves | 1 | 1 | 0 | 0–1 | — | 1; info | unmeasured / info | W |
| Inferred read operands | 4 | 4 | 3 | 3–4 | — | 1; info | unmeasured / info | W |
| Distinct inferred requested files | 5 | 4 | 3 | 3–5 | — | 2; info | unmeasured / info | W |
| Truth files requested | 4 | 3 | 3 | 3–4 | — | 1; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 1 | 2 | 0–2 | — | 2; info | unmeasured / info | W |
| Final answer bytes | 2553 | 3656 | 2651 | 2553–3656 | — | 1103; info | unmeasured / info | Q |
| Correct named files | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 1 | 2 | 0 | 0–2 | — | 2; info | unmeasured / info | Q |
| Delivered-map truth hits | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
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
| Engine exit wall budget ms | 25431 | 24292 | 22604 | 22604–25431 | — | 2827; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R3 e-18w1Kb**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R3 e-18w1Kb. Eligible completed route candidates: R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R3: 0.0975 | R3: 0.0975 | 0.1072 |
| Harness turns | R1: 6 | R3: 7 | 6.60 |
| Model/API requests | R3: 4 | R3: 4 | 4.40 |
| Harness wall seconds | R3: 28 | R3: 28 | 30.80 |
| Peak context tokens | R3: 23550 | R3: 23550 | 25905.00 |

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
      "command": "cd /private/tmp/e-Dh1UDY/home/cwd/repo 2>/dev/null && pwd && ls && git ls-files | grep -iE 'user|admin|auth' | head -80",
      "description": "List repo files related to users/admin"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-2Bfk7S/home/cwd/repo 2>/dev/null && pwd && ls && grep -rniE \"deleteUser|delete.*user|removeUser\" src --include=*.ts -l | head -30",
      "description": "Locate user deletion code in repo"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `src/api/Auth.spec.ts`

Non-truth paths only in R2:

- `src/api/middleware/verify-access-token.middleware.ts`
- `src/api/middleware/verify-access-token.middleware.spec.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-Dh1UDY/home/cwd/repo 2>/dev/null && pwd && ls && git ls-files | grep -iE 'user|admin|auth' | head -80",
      "description": "List repo files related to users/admin"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-18w1Kb/home/cwd/repo && git ls-files | grep -iE \"user\" | head -50; grep -rliE \"registered.?users|deleteUser\" --include=*.ts --include=*.tsx --include=*.js --include=*.vue . --exclude-dir=node_modules | head -30"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `src/api/Auth.spec.ts`

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
      "command": "cd /private/tmp/e-2Bfk7S/home/cwd/repo 2>/dev/null && pwd && ls && grep -rniE \"deleteUser|delete.*user|removeUser\" src --include=*.ts -l | head -30",
      "description": "Locate user deletion code in repo"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-18w1Kb/home/cwd/repo && git ls-files | grep -iE \"user\" | head -50; grep -rliE \"registered.?users|deleteUser\" --include=*.ts --include=*.tsx --include=*.js --include=*.vue . --exclude-dir=node_modules | head -30"
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `src/api/middleware/verify-access-token.middleware.ts`
- `src/api/middleware/verify-access-token.middleware.spec.ts`

Non-truth paths only in R3:

None.

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/api/Auth.ts (existing/unspecified) | included; 1; 4 | included; 2; 3 | included; 2; 4 |
| src/api/middleware/permissions/permissions.middleware.ts (existing/unspecified) | omitted; —; — | omitted; —; — | omitted; —; — |
| src/controllers/AuthController.spec.ts (existing/unspecified) | included; 1; 5 | included; 2; 5 | included; 2; 6 |
| src/controllers/AuthController.ts (existing/unspecified) | included; 1; 4 | included; 2; 4 | included; 2; 5 |
| src/utils/PermissionHelper.ts (existing/unspecified) | omitted; —; 5 | omitted; —; — | omitted; —; — |

Offline union of final path sets: R 60.0%, P 50.0%, F1 54.5%. Intersection: R 60.0%, P 100.0%, F1 75.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-Dh1UDY](../../attempts/e-Dh1UDY.md)
- [R2 e-2Bfk7S](../../attempts/e-2Bfk7S.md)
- [R3 e-18w1Kb](../../attempts/e-18w1Kb.md)


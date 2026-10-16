# be-vs-5071-investigate — notation cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

All attempts name the same four true paths, but add four non-truth paths; recall 1.00 and precision 0.50 therefore look stable while the extras change. R2 also requests repo/src/... after resolving inside the repo and receives four helper operand refusals.

R3 reaches the same scored quality in four API calls versus seven/nine, with agent cost $0.20348 versus $0.23461/$0.24754. R2 pays for the malformed path request and recovery. The read refusal is an observed local inefficiency, not an explanation for an unchanged recall score.

**Proposed intervention:** Give canonical repository-relative operands in route delivery and an explicit cwd/root. Add concise change-vs-evidence roles to the final file inventory so supporting middleware is not automatically named as a modification.

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
| [R1 e-Bx42P3](../../attempts/e-Bx42P3.md) | completed | done | true | 2 | 1 | 0 |
| [R2 e-NtMlxq](../../attempts/e-NtMlxq.md) | completed | done | true | 2 | 1 | 0 |
| [R3 e-ZIgfIp](../../attempts/e-ZIgfIp.md) | completed | done | true | 2 | 1 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Historical-file precision | 0.5000 | 0.5000 | 0.5000 | R1, R2, R3 = 0.5000 | ≥0.4500 | 0; 0.0% | yes | Q |
| Historical-file F1 | 0.6667 | 0.6667 | 0.6667 | R1, R2, R3 = 0.6667 | ≥0.6000 | 0; 0.0% | yes | Q |
| Existing-at-base recall | 1 | 1 | 1 | R1, R2, R3 = 1 | ≥0.9000 | 0; 0.0% | yes | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.2346 | 0.2475 | 0.2035 | R3 = 0.2035 | ≤0.2238 | 0.0441; 21.7% | NO | B |
| Harness total cost $ | 0.2394 | 0.2613 | 0.2078 | R3 = 0.2078 | ≤0.2285 | 0.0535; 25.7% | NO | B |
| Judging cost $ | 0.0048 | 0.0137 | 0.0043 | 0.0043–0.0137 | — | 0.0094; info | unmeasured / info | B |
| Harness turns | 8 | 9 | 12 | R1 = 8 | ≤8.80 | 4; 50.0% | NO | W |
| Model/API requests | 7 | 9 | 4 | R3 = 4 | ≤4.40 | 5; 125.0% | NO | W |
| Tool calls | 7 | 8 | 11 | R1 = 7 | ≤7.70 | 4; 57.1% | NO | W |
| Harness wall seconds | 35 | 46 | 35 | R1, R3 = 35 | ≤38.50 | 11; 31.4% | NO | T |
| Agent duration seconds | 29.95 | 38.86 | 29.77 | R3 = 29.77 | ≤32.75 | 9.09; 30.5% | NO | T |
| API duration seconds | 26.24 | 34.53 | 23.39 | R3 = 23.39 | ≤25.73 | 11.14; 47.6% | NO | T |
| Scaffold/setup seconds | 3.59 | 5.47 | 3.03 | R3 = 3.03 | ≤3.33 | 2.45; 80.8% | NO | T |
| Time to first request seconds | 3.55 | 3.31 | 3.21 | R3 = 3.21 | ≤3.53 | 0.3430; 10.7% | NO | T |
| First context tokens | 18656 | 18655 | 18721 | R2 = 18655 | ≤20520.50 | 66; 0.4% | yes | B |
| Peak context tokens | 45836 | 44121 | 44606 | R2 = 44121 | ≤48533.10 | 1715; 3.9% | yes | B |
| Cache-created tokens | 38558 | 36843 | 37328 | 36843–38558 | — | 1715; info | unmeasured / info | B |
| Cache-read tokens | 216647 | 261498 | 102547 | 102547–261498 | — | 158951; info | unmeasured / info | B |
| Output tokens | 3702 | 4783 | 3364 | 3364–4783 | — | 1419; info | unmeasured / info | B |
| Route-ready seconds | 2.08 | 0.8960 | 1.05 | R2 = 0.8960 | ≤0.9856 | 1.18; 131.8% | NO | T |
| Map layer ms | 849 | 398 | 478 | R2 = 398 | ≤437.80 | 451; 113.3% | NO | T |
| Tool-result bytes | 57188 | 52923 | 53824 | 52923–57188 | — | 4265; info | unmeasured / info | B |
| Reading request waves | 5 | 7 | 2 | 2–7 | — | 5; info | unmeasured / info | W |
| Single-path read waves | 0 | 2 | 0 | 0–2 | — | 2; info | unmeasured / info | W |
| Inferred read operands | 16 | 18 | 8 | 8–18 | — | 10; info | unmeasured / info | W |
| Distinct inferred requested files | 16 | 14 | 8 | 8–16 | — | 8; info | unmeasured / info | W |
| Truth files requested | 4 | 4 | 3 | 3–4 | — | 1; info | unmeasured / info | W |
| Path-revisit bytes proxy | 4115 | 28552 | 3171 | 3171–28552 | — | 25381; info | unmeasured / info | B |
| Regex-recognized helper read calls | 1 | 2 | 1 | 1–2 | — | 1; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 23926 | 24248 | 23926 | 23926–24248 | — | 322; info | unmeasured / info | B |
| Helper operand refusals | 0 | 4 | 0 | R1, R3 = 0 | ≤0 | 4; — | NO | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 1 | 0 | 3 | 0–3 | — | 3; info | unmeasured / info | W |
| Final answer bytes | 4427 | 5866 | 3953 | 3953–5866 | — | 1913; info | unmeasured / info | Q |
| Correct named files | 4 | 4 | 4 | 4–4 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 4 | 4 | 4 | 4–4 | — | 0; info | unmeasured / info | Q |
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
| Engine exit wall budget ms | 29116 | 38584 | 29477 | 29116–38584 | — | 9468; info | unmeasured / info | T |
| Engine reader receipts | 1 | 2 | 1 | 1–2 | — | 1; info | unmeasured / info | W |
| Engine reader served bytes | 23926 | 24212 | 23926 | 23926–24212 | — | 286; info | unmeasured / info | B |
| Engine truncated reader operands | 3 | 3 | 3 | 3–3 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 5 | 4 | 5 | 4–5 | — | 1; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

Balanced quality witness: **R3 e-ZIgfIp**, chosen by maximum F1, then recall, then agent cost. This does not replace the independent recall/precision references in the metric table.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: R1 e-Bx42P3, R2 e-NtMlxq, R3 e-ZIgfIp. Eligible completed route candidates: R1, R2, R3. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R3: 0.2035 | R3: 0.2035 | 0.2238 |
| Harness turns | R1: 8 | R1: 8 | 8.80 |
| Model/API requests | R3: 4 | R3: 4 | 4.40 |
| Harness wall seconds | R1, R3: 35 | R1, R3: 35 | 38.50 |
| Peak context tokens | R2: 44121 | R2: 44121 | 48533.10 |

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
      "command": "cd /private/tmp/e-Bx42P3/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 src/controllers/OrganizationController.ts src/api/Organization.ts src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts src/api/middleware/permissions/permissions.middleware.ts src/api/validators/OrganizationValidators.ts"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-NtMlxq/home/cwd/repo 2>/dev/null && pwd; node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 repo/src/controllers/OrganizationController.ts repo/src/api/Organization.ts repo/src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts repo/src/api/validators/OrganizationValidators.ts",
      "description": "Read the lead files"
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R2:

None.

Non-truth paths only in R1:

- `src/api/middleware/permissions/ge-adv-enabled.middleware.spec.ts`

Non-truth paths only in R2:

- `src/api/Organization.ts`

### R1 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 0; first different tool ordinal **1**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 1,
  "a": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "cd /private/tmp/e-Bx42P3/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 src/controllers/OrganizationController.ts src/api/Organization.ts src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts src/api/middleware/permissions/permissions.middleware.ts src/api/validators/OrganizationValidators.ts"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 src/controllers/OrganizationController.ts src/api/Organization.ts src/api/validators/OrganizationValidators.ts src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts src/api/middleware/permissions/permissions.middleware.ts",
      "description": "Read candidate files",
      "dangerouslyDisableSandbox": false
    }
  }
}
```

Correct paths only in R1:

None.

Correct paths only in R3:

None.

Non-truth paths only in R1:

- `src/api/middleware/permissions/ge-adv-enabled.middleware.ts`
- `src/api/middleware/permissions/ge-adv-enabled.middleware.spec.ts`

Non-truth paths only in R3:

- `src/api/middleware/permissions/restrictions.middleware.ts`
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
      "command": "cd /private/tmp/e-NtMlxq/home/cwd/repo 2>/dev/null && pwd; node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 repo/src/controllers/OrganizationController.ts repo/src/api/Organization.ts repo/src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts repo/src/api/validators/OrganizationValidators.ts",
      "description": "Read the lead files"
    }
  },
  "b": {
    "call": 1,
    "name": "Bash",
    "input": {
      "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 src/controllers/OrganizationController.ts src/api/Organization.ts src/api/validators/OrganizationValidators.ts src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts src/api/middleware/permissions/permissions.middleware.ts",
      "description": "Read candidate files",
      "dangerouslyDisableSandbox": false
    }
  }
}
```

Correct paths only in R2:

None.

Correct paths only in R3:

None.

Non-truth paths only in R2:

- `src/api/Organization.ts`
- `src/api/middleware/permissions/ge-adv-enabled.middleware.ts`

Non-truth paths only in R3:

- `src/api/middleware/permissions/restrictions.middleware.ts`
- `src/api/OrginizationApi.spec.ts`

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|
| src/api/validators/OrganizationValidators.ts (existing/unspecified) | included; 1; 1 | included; 1; 1 | included; 1; 1 |
| src/controllers/OrganizationController.spec.ts (existing/unspecified) | included; 6; 7 | included; 5; 6 | included; 2; — |
| src/controllers/OrganizationController.ts (existing/unspecified) | included; 1; 1 | included; 1; 1 | included; 1; 1 |
| src/models/Organization.ts (existing/unspecified) | included; 2; 4 | included; 3; 4 | included; 3; 5 |

Offline union of final path sets: R 100.0%, P 36.4%, F1 53.3%. Intersection: R 100.0%, P 66.7%, F1 80.0%. This diagnoses selection variance; blindly unioning speculative paths is not a runtime recommendation.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-Bx42P3](../../attempts/e-Bx42P3.md)
- [R2 e-NtMlxq](../../attempts/e-NtMlxq.md)
- [R3 e-ZIgfIp](../../attempts/e-ZIgfIp.md)


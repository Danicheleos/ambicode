# be-vs-6015-review — 17 cohort

[Main report](../../report.md) · [Machine audit](../../audit.json)

Three repetitions of the same case within this campaign; no cross-build pooling.

## Observed divergence and explanation

The review command produces a replayed recorded answer (ledger status partial) and zero measured review recall in every repetition. These cases do not involve a fresh independent reviewer. Prepared recordings do not establish current reviewer quality; evals/README.md explicitly says current core recordings need regeneration.

The first shared commands are review, then view --review in the background. Drift follows in waiting/reading its task-output file and retrying view under a timeout. Additional view retries change turns, wall time and cost, while the same replay content remains the primary output. The view failures are operational, not an explanation for a differing reviewer score (the score does not differ).

**Proposed intervention:** Use matching per-case reviewer recordings and report replay separately from live quality. Return a canonical view URL/status once and stop retrying a failed server without new evidence. Keep partial coverage visible; a completed route with replay gaps is not a verified clean review.

These are trace-supported mechanisms and proposed interventions, not a claim of proven counterfactual causation. The first different request below is the first observable model drift; the final path-set differences are the first indisputable quality drift when intermediate evidence is similar.

## Input invariants and engine state

| Served item | Distinct recorded values |
|---|---:|
| promptHashes | 1 |
| contractHashes | 1 |
| stepHashes | 1 |
| mapHashes | 0 |

| Attempt | Model terminal | Engine exit | Engine completed | Map truth hits | Model step deliveries | Artifact errors |
|---|---|---|---|---:|---:|---:|
| [R1 e-wl0P4A](../../attempts/e-wl0P4A.md) | completed | done | true | — | 2 | 0 |
| [R2 e-ujQYBN](../../attempts/e-ujQYBN.md) | completed | done | true | — | 2 | 0 |
| [R3 e-iAQZVP](../../attempts/e-iAQZVP.md) | completed | done | true | — | 2 | 0 |

Map identity is the delivered map hash, rather than map execution time. Engine ledger completion is separate from successful task implementation, validator success or a live independent review.

## Every metric and its own witnessed reference

Higher-is-better metrics require ≥90% of that case's best; lower-is-better metrics require ≤110% of its minimum. This is relative to the best, not ten percentage points. Zero-error minima require zero; integers are not rounded up. Info rows show min–max only and have no target. No quality criterion or causality can be inferred from info-row counts alone. Missing/not-applicable fields are —. One repetition cannot establish a band.

| Metric | R1 | R2 | R3 | Own reference | Target boundary | Range; worst relative drift | All within band? | Mechanism |
|---|---:|---:|---:|---|---:|---|---|---|
| Historical-file recall | 0 | 0 | 0 | R1, R2, R3 = 0 | ≥0 | 0; 0.0% | yes | Q |
| Historical-file precision | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Historical-file F1 | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Existing-at-base recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Created-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Deleted-file recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task hunk recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Task identifier recall | — | — | — | unmeasured | — | — | unmeasured / info | Q |
| Agent trace cost $ | 0.1096 | 0.1116 | 0.1048 | R3 = 0.1048 | ≤0.1153 | 0.0068; 6.5% | yes | B |
| Harness total cost $ | 0.1155 | 0.1184 | 0.1101 | R3 = 0.1101 | ≤0.1211 | 0.0083; 7.5% | yes | B |
| Judging cost $ | 0.0059 | 0.0068 | 0.0053 | 0.0053–0.0068 | — | 0.0015; info | unmeasured / info | B |
| Harness turns | 5 | 5 | 4 | R3 = 4 | ≤4.40 | 1; 25.0% | NO | W |
| Model/API requests | 5 | 5 | 4 | R3 = 4 | ≤4.40 | 1; 25.0% | NO | W |
| Tool calls | 4 | 4 | 3 | R3 = 3 | ≤3.30 | 1; 33.3% | NO | W |
| Harness wall seconds | 30 | 32 | 26 | R3 = 26 | ≤28.60 | 6; 23.1% | NO | T |
| Agent duration seconds | 25.13 | 26.28 | 20.59 | R3 = 20.59 | ≤22.65 | 5.69; 27.6% | NO | T |
| API duration seconds | 18.95 | 20.11 | 17.81 | R3 = 17.81 | ≤19.59 | 2.30; 12.9% | NO | T |
| Scaffold/setup seconds | 3.36 | 3.51 | 3.36 | R3 = 3.36 | ≤3.69 | 0.1540; 4.6% | yes | T |
| Time to first request seconds | 2.93 | 2.84 | 2.80 | R3 = 2.80 | ≤3.08 | 0.1260; 4.5% | yes | T |
| First context tokens | 17821 | 17819 | 17822 | R2 = 17819 | ≤19600.90 | 3; 0.0% | yes | B |
| Peak context tokens | 23953 | 23869 | 23529 | R3 = 23529 | ≤25881.90 | 424; 1.8% | yes | B |
| Cache-created tokens | 16675 | 16591 | 16251 | 16251–16675 | — | 424; info | unmeasured / info | B |
| Cache-read tokens | 93287 | 93266 | 69776 | 69776–93287 | — | 23511; info | unmeasured / info | B |
| Output tokens | 2426 | 2660 | 2586 | 2426–2660 | — | 234; info | unmeasured / info | B |
| Route-ready seconds | 4.09 | 4.00 | 4 | R2 = 4.00 | ≤4.39 | 0.0930; 2.3% | yes | T |
| Map layer ms | — | — | — | unmeasured | — | — | unmeasured / info | T |
| Tool-result bytes | 12434 | 12434 | 12307 | 12307–12434 | — | 127; info | unmeasured / info | B |
| Reading request waves | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Single-path read waves | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Inferred read operands | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Distinct inferred requested files | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Truth files requested | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Path-revisit bytes proxy | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Regex-recognized helper read calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recognized helper-containing output bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Helper operand refusals | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Failed tool calls | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Permission denials | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Stop blocks | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Parallel tool request waves | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Final answer bytes | 4792 | 5569 | 5613 | 4792–5613 | — | 821; info | unmeasured / info | Q |
| Correct named files | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | Q |
| Non-truth named files | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | Q |
| Delivered-map truth hits | — | — | — | unmeasured | — | — | unmeasured / info | W |
| Engine model-step deliveries | 2 | 2 | 2 | 2–2 | — | 0; info | unmeasured / info | W |
| Artifact validation failures | 0 | 0 | 0 | R1, R2, R3 = 0 | ≤0 | 0; 0.0% | yes | E |
| Harness aggregate score | 0.8000 | 0.8000 | 0.8000 | 0.8000–0.8000 | — | 0; info | unmeasured / info | W |
| Harness passed flag (1=yes) | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Failed paid/deterministic graders | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | E |
| Paid graders skipped (1=yes) | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| AskUserQuestion calls | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Ledger acceptances | 1 | 1 | 1 | 1–1 | — | 0; info | unmeasured / info | W |
| Ledger declines | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Headless defaults taken | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Policy ledger entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Recorded compaction events | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine exit wall budget ms | 24743 | 25973 | 20220 | 20220–25973 | — | 5753; info | unmeasured / info | T |
| Engine reader receipts | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine reader served bytes | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | B |
| Engine truncated reader operands | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |
| Engine served file/span entries | 0 | 0 | 0 | 0–0 | — | 0; info | unmeasured / info | W |

**Q — Quality/answer surface:** dictated by the scored final artifact and historical truth; the diagnosis and exact path differences below explain gain/loss. Created paths are proposals and may be unreadable at base. **B — Bytes/tokens/cost:** exact input/output volume and repeated cached context are in each call chain; correlate with wave changes, but bytes alone do not prove billing causation. **T — Timing:** setup/first-call/map delays precede the model search; API/server scheduling and subsequent model/tool work add variation. Wall includes more than engine time and judging; a duration residual is not a measured subsystem. **E — Errors/guards/artifacts:** exact failed/refused calls and Stop ledger events are recorded in each attempt; a refusal inside a successful shell command is separate from tool-error. **W — Workflow counts:** APIs, host turns, tool calls, read waves and engine model steps are different quantities. Fewer reads or more batching is only useful when coverage is retained.

## Quality-qualified resource targets

No observed F1/precision reference exists for this review score. Zero review recall and replayed output do not establish a successful quality witness.

Observed runs meeting ≥90% of each best recall, precision and F1 simultaneously: none. Eligible completed route candidates: none. A zero-scoring blocked task cannot be a quality-qualified successful target.

| Resource | Unconstrained minimum | Best among eligible quality witnesses | Allowed +10% of unconstrained best |
|---|---|---|---:|
| Agent trace cost $ | R3: 0.1048 | none | 0.1153 |
| Harness turns | R3: 4 | none | 4.40 |
| Model/API requests | R3: 4 | none | 4.40 |
| Harness wall seconds | R3: 26 | none | 28.60 |
| Peak context tokens | R3: 23529 | none | 25881.90 |

If the eligible minimum exceeds the resource boundary, that joint goal has not been observed. Independent bests are aspiration points, not a synthetic run that already exists. Exact-path membership is an additional stability criterion, even when aggregate scores tie.

## Individual harness graders

The aggregate harness score can combine several judgments; it is not interchangeable with deterministic file F1. The investigation paid grader only requires a true-file hit, so a passing score can coexist with poor recall/precision. The no-peek graders count only inputs matching benchmark/preset/eval paths: "Bash called 0x" means zero matching forbidden calls, not zero total Bash calls. Missing paid judgments in the cost-capped campaign are not counted as passed. All original grader fields remain in each attempt JSON.

| Attempt | Grader | Passed | Score | Recorded explanation |
|---|---|---|---|---|
| R1 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R1 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R1 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R1 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R1 | raises-01 | false | — | judge votes: FAIL FAIL FAIL |
| R2 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R2 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R2 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R2 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R2 | raises-01 | false | — | judge votes: FAIL FAIL FAIL |
| R3 | no-peek-bash | true | — | Bash called 0x (expected 0..0) |
| R3 | no-peek-glob | true | — | Glob called 0x (expected 0..0) |
| R3 | no-peek-grep | true | — | Grep called 0x (expected 0..0) |
| R3 | no-peek-read | true | — | Read called 0x (expected 0..0) |
| R3 | raises-01 | false | — | judge votes: FAIL FAIL FAIL |

## First drift, pair by pair

### R1 vs R2

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 2; first different tool ordinal **3**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 3,
  "a": {
    "call": 3,
    "name": "Bash",
    "input": {
      "command": "sleep 3; cat /private/tmp/e-wl0P4A/tmp/claude-502/-private-tmp-e-wl0P4A-home-cwd/296b8719-e21a-467c-80f9-e63ebdd74cc8/tasks/bn5hq3ugp.output"
    }
  },
  "b": {
    "call": 3,
    "name": "Bash",
    "input": {
      "command": "sleep 3; cat /private/tmp/e-ujQYBN/tmp/claude-502/-private-tmp-e-ujQYBN-home-cwd/d51df79a-1623-4f22-a609-cb2131c1c843/tasks/bkrsevzyv.output"
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

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 2; first different tool ordinal **3**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 3,
  "a": {
    "call": 3,
    "name": "Bash",
    "input": {
      "command": "sleep 3; cat /private/tmp/e-wl0P4A/tmp/claude-502/-private-tmp-e-wl0P4A-home-cwd/296b8719-e21a-467c-80f9-e63ebdd74cc8/tasks/bn5hq3ugp.output"
    }
  },
  "b": {
    "call": 3,
    "name": "Read",
    "input": {
      "file_path": "/private/tmp/e-iAQZVP/tmp/claude-502/-private-tmp-e-iAQZVP-home-cwd/e8a9f0e0-98cb-4912-b896-4cab1ac98578/tasks/bx7ogzwe4.output"
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

None.

### R2 vs R3

First recorded input difference: none among served prompt, normalized route delivery and delivered map. Shared normalized tool-input prefix: 2; first different tool ordinal **3**. Shell spelling, cwd strategy, descriptions and operand order can make a lexical difference without changing evidence; inspect both results before treating it as semantic loss.

```json
{
  "ordinal": 3,
  "a": {
    "call": 3,
    "name": "Bash",
    "input": {
      "command": "sleep 3; cat /private/tmp/e-ujQYBN/tmp/claude-502/-private-tmp-e-ujQYBN-home-cwd/d51df79a-1623-4f22-a609-cb2131c1c843/tasks/bkrsevzyv.output"
    }
  },
  "b": {
    "call": 3,
    "name": "Read",
    "input": {
      "file_path": "/private/tmp/e-iAQZVP/tmp/claude-502/-private-tmp-e-iAQZVP-home-cwd/e8a9f0e0-98cb-4912-b896-4cab1ac98578/tasks/bx7ogzwe4.output"
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

None.

## Best-F1 file obligations: where they enter or disappear

This traces every historic truth file, including files the best-F1 witness also missed. A tool-output path mention is weaker evidence than a returned source body; no true-file oracle was available to the runtime model. A dash means the extractor found no explicit path, not proof the bytes never contained relevant evidence.

| Truth file / base status | R1 final; first output mention; first inferred read operand | R2 final; first output mention; first inferred read operand | R3 final; first output mention; first inferred read operand |
|---|---|---|---|

Review uses issue-thread grading rather than a source-file truth matrix. Inspect the raw graders and replay result in the attempt JSON.

## Responsible files and proposed data flow

The model chooses query, scope, operand, proposed names and final selection. The plugin supplies map/routing/guards/read receipts. The evaluator then scores the captured artifact. Current-source links identify responsibilities, not a claim that current dirty code was executed in these historical traces.

- [src/hook/events/run-hook.ts](../../../../../../src/hook/events/run-hook.ts) and [prompts/session-contract.md](../../../../../../prompts/session-contract.md): shared contract and starting delivery.
- [src/harness/engine/execute.ts](../../../../../../src/harness/engine/execute.ts) / [src/harness/engine/delivery.ts](../../../../../../src/harness/engine/delivery.ts): fold → active step/commands/route state → model message.
- [src/modules/search/text/map.ts](../../../../../../src/modules/search/text/map.ts) / [src/modules/search/text/locate.ts](../../../../../../src/modules/search/text/locate.ts): requirement terms + repository inventory → ranked candidates → delivered map.
- [routes/investigate/read.md](../../../../../../routes/investigate/read.md) / [src/modules/search/text/read-many.ts](../../../../../../src/modules/search/text/read-many.ts) / [src/cli/commands/search/search.ts](../../../../../../src/cli/commands/search/search.ts): suggested search/read workflow; operands → resolved files/spans → bounded output and search receipts.
- [src/harness/engine/stop.ts](../../../../../../src/harness/engine/stop.ts) and [src/skills/task/handlers.ts](../../../../../../src/skills/task/handlers.ts): terminal report checks and no-check task preflight.
- [evals/scripts/src/analysis/run-report.mjs](../../../../../../evals/scripts/src/analysis/run-report.mjs) / [evals/scripts/src/analysis/bench-score.mjs](../../../../../../evals/scripts/src/analysis/bench-score.mjs): traces/artifacts → counts and historical quality scores.

Each full repetition below contains exact commands, requested and returned path mentions, bytes/hashes, usage/context per model wave, ledger transitions, export provenance and the scored final artifact.

- [R1 e-wl0P4A](../../attempts/e-wl0P4A.md)
- [R2 e-ujQYBN](../../attempts/e-ujQYBN.md)
- [R3 e-iAQZVP](../../attempts/e-iAQZVP.md)


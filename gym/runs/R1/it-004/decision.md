# it-004 — WP3 item 1 (investigation) — decision

**Verdict: accept** on 02 §5 last row (no behaviour claim; gates green; control unchanged). WP3 item 1 is done. WP3 item 2 (behaviour) is not started, and the replan R-1 changes how it will be measured (`replan/R-1-2026-09-29T09-30-00Z.md`).

## Evidence (`it-004/metrics.json`; the verifier re-derived it, `handoffs/verifier.md`)

```
G1  exit 0, 776 / 775 / 0 / 1     (verifier re-ran npm run verify: same)
G2  exit 0, zip bee92a9a…487033   (identical to it-003; verifier: same)
G3  exit 0, 508 files             (505 when first counted; +3 = this iteration's own tracked files)
git diff --stat gym/R1/it-003 -- . ':!gym'   empty (lead and verifier)
T1 T2 T3 T4   null — no plugin change, nothing to measure
eval spend $0 (worker and verifier sessions are counted by the supervisor)
```

Verifier disagreements: 5, all citation or count slips in the worker's table (recorder line numbers, 25 vs 26 env names, one over-broad "only commit" claim, G3 505 vs 508). Corrections are appended to `handoffs/worker-1.md`. None touches a gate or the recommendation.

## Findings the recommendation rests on (read, not inferred)

- The reviewer runs `--output-format json` (`claude-reviewer.ts:266-267`); `stream-json` appears in no `src` file. The envelope fields the code reads are `num_turns`, `duration_api_ms`, `usage.output_tokens`, `total_cost_usd`, `usage.output_tokens_details.thinking_tokens`. No tool-call count or list is read, and no fixture or archived result carries one.
- The three archived VS-6735 reviews: turns 14 / 3 / 2, cost $1.107 / $0.402 / $0.326. `.reviewer.tools` is the allowed list, not the calls made.
- `ReviewerUsage` is a strict object; `thinkingTokens` was added with `.default(null)` and no schema bump (`f751954`), which is the precedent for an additive field.
- Recordings store `case, model, output, recordedFrom, snapshotId` only: no usage, no turns, no cost. The cost drop between 0.3.3 and 0.3.4 recordings cannot be explained from files (0.3.3 recordings ran from uncommitted state; no reviewer-path commit between the eras).

## Options and the pick (07 B6: the lead picks the option that breaks no documented contract)

| option | breaks a contract | needs paid capture |
|---|---|---|
| A stream-json + count `tool_use` | none documented; shape unverified in this repo; 4 MiB cap more likely | yes ($0.10–0.40) |
| **B infer an upper bound from `num_turns`** | none | no |
| C reviewer self-report `filesRead` | prompt and schema change; every T3 recording redone; untrusted | no |
| D recorder usage sidecar | none (measurement only) | no |

**Pick for WP3 item 2: B, worded "at most one tool call, the answer itself" (never "read no file"), with `turns == null` read as unknown; add D beside it; A only after a budgeted real capture.** B is an upper bound: for turns ≥ 3 it cannot tell 0 reads from 1. The 07 B6 clause is met (one option keeps every contract), so no B7 and no R5.

## Not measured

- A real `stream-json` reviewer output (needs a `claude` call; the worker may not make one).
- Whether the turns-to-tool relation holds for the reviewer. The 350 agent traces give `num_turns − tool_use` ∈ {1: 167, 2: 183}, but those are agent runs on a different model.
- Whether the JSON envelope also carries `modelUsage` or `permission_denials`.
- The cause of the recording cost drop.
- T1–T4 (no plugin change).

## Process notes

- The auditor cadence (04 §4: every 3 iterations) is met by the cp-2 audit run before it-004; the next is due at cp-3 or three iterations after it-003, whichever comes first, and it runs **before** the commit and tag.
- The brief was written before the measurement and is committed in the same record commit as the metrics (the auditor's F10 asked for an earlier commit; it-004 changes no plugin file, so nothing could have been retrofitted).

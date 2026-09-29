# it-003 — WP2 items 1–3 (pin the MCP server, CLI-stamped `receivedAt`, size pre-flight in `prepare`) — decision

**Verdict: accept.** Gates are green. The claims are reproduced as tests that failed before the change and pass after it. The T2 and T1 controls are within noise. One T3 case, `be-vs-5546`, moved outside the brief's ±2 band (median 6 → 3). That is a decision by the lead, not a row of the table read off mechanically, and the grounds are below. The verifier's independent numbers match on every field the decision rests on (`handoffs/verifier.md`).

## Evidence

From `it-003/metrics.json` and `baseline/metrics.json` (cp-0); the verifier re-derived each line:

```
G1  exit 0, 776 / 775 / 0 / 1   (cp-1 752; +24 test declarations in the diff; cp-2 needs ≥ 755)
G2  exit 0, zip bee92a9a…487033 identical across two runs      G3 exit 0 (491 tracked LF; 4 new files 0 CR)
T1  7 scored cases 1.0 in 3/3 runs; url-bare investigate 3/3 (score 0.4, same as cp-0); $4.18
T2  3 runs/arm, 18 cases, partial false; 1 run error (be-vs-5075 with, ENOENT, cause unknown) → that case rerun alone and merged
                         it-003     cp-0      Δ        rule (01 §3)
    localize with F1     0.6328     0.6565    −0.024   real if |Δ| ≥ 0.05 → noise; ≥ cp-0 − 0.03 = 0.6265 (01 §1 item 3) holds
    localize without F1  0.6408     0.6198    +0.021   drift control ±0.03 → ok
    review with recall   0.1563     0.1563     0.000   real if |Δ| ≥ 0.105 → noise
    helper-ran med       loc 9/10, rev 8/8    loc 9/10, rev 8/8    0
    cost/run with        loc $0.537, rev $0.665   loc $0.544, rev $0.631   −1.3 %, +5.5 % (< 25 %)
T3  8/8, 3 recordings each, refused 0; medians vs cp-1: 3571 6 (4), 5075 4 (4), 5546 3 (6), 6261 1 (2),
    6086-d1f 5 (3), 6253 3 (4), 6086-d7c 3 (3), 6292 4 (2)
    reviewer prompts at 01f626f vs it-003: 16 of 16 byte-identical, 0 nondeterministic (lead and verifier, scratch/prompt-diff.log)
spend  eval $68.48 (T1 4.18 + preflight 0.40 + T2 57.83 + rerun 2.82 + judge 0.88 + T3 2.37); brief budget $90
```

Claims, as reproductions (`handoffs/worker-1.md`, `worker-1-delta.md`): the before-change run of the new tests gave 17 failed of 126 (`/tmp/it003-before.log`, not kept). Each item has a named test with its before-failure line:
- item 1: `Unknown option '--mcp-server'`; `actual: null, expected: 'atlassian'`; `Missing expected rejection.`
- item 2: `receivedAt` undefined; `requirements-invalid` on an envelope without `retrievedAt`.
- item 3: no size notice.

## Why the T3 band breach does not reject

1. **The reviewer's input did not change.** The recorder builds the reviewer's input with `ambicode bundle` and then `review`. For all 8 cases, both prompt files are byte-identical between the base build and the it-003 build: 16 of 16, twice per build. The positive control shows the two builds do differ: `receivedAt` and `mcp-server` appear 0/0 times in the base's shipped scripts and 5/6 times in it-003's. `claude-reviewer.ts`, `prompts/` and `policies/` are unchanged. The verifier could not check the `review` path without a model call. The diff closes that gap. Every changed line under `src/review/` is the `clock` argument (`bundle.ts`) or sits inside a loop over requirement sources (`prompt.ts` `requirementBlock`, `report.ts`). None of the 18 cases carries a source.
2. **The reviewer's own spread on identical input is wider than the band.** `src/review/`, `prompts/` and `policies/` did not change between it-001's commit and 01f626f, so it-001's new recordings (2 per BE case, 3 per FE case) and this iteration's three were all made on identical input:
   - be-vs-5546: 6, 5, 3, 3, 4
   - be-vs-3571: 2, 6, 7, 6, 1
   - fe-vs-6292: 2, 2, 5, 4, 2, 4

   One input yields spreads of 3–6 findings. A ±2 median band over 3 recordings sits inside the reviewer's sampling noise.
3. **cp-3's own no-go rule is not met.** That rule is a median drop of ≥ 3 on ≥ 2 cases; one case dropped by 3.

What remains open: for be-vs-5546, all 3 new recordings fall below both of it-001's. With exchangeable draws, the chance of that ordering is 1 in 10. That is weak evidence for a shift in the reviewer model or service over the day, and none for an effect of this change. It is not investigated here. Because the reviewer's output varies this much on fixed input, the 01 §3 T3 rule ("a difference of ≥ 2 findings is real") needs recalibrating. A threshold is the owner's call (03 §2), so this goes to `OWNER-INBOX.md` rather than being applied.

## Not measured, and caveats

- **T4: `null`.** No human-run cycle exists after this build. The claims (fabricated provenance 4/4 → 0, refused launches → 0, MCP questions → 0) are "reproduced in tests", not "observed". L-010 asks the owner for the first cycle (01 §1 item 6).
- **Coverage of the T2 control.** T2 can see only item 3, because 0 of 18 cases carry a requirement source. For items 1 and 2, "within noise" says nothing; they rest on their unit tests.
- **Screening skipped by design** (brief, step 4). The decision sweep is the only T2 measurement.
- **Recordings.** T2 review with-arm replayed it-001's 8 recordings (sha 6b7157a5…), while cp-0 replayed 5, so those numbers are not like-for-like. The recall median is equal anyway. After this iteration the file holds record-3's recordings (sha b4d778c9…).
- **The T2 run error is unexplained.** be-vs-5075 with-arm, run 3, ENOENT after 13 s. It was not a usage limit (03 S5 not triggered). The lead's own guess, a campaign-file write racing the harness, is contradicted by the timing (the label edit was at 04:06:16Z, the error at 04:09:32Z) and is dropped.
- **Brief gaps, fixed by an addendum before the gate:** `src/review/bundle.ts` (+1 line, the second call site) and `src/cli/main.ts` (help text). The worker's first diff deleted two existing skill instructions to fit the 5,600-byte budget. On the lead's request they were restored verbatim, and the budget was not raised.
- **Not done:** `skills/init/SKILL.md` does not mention `--mcp-server` (T1 surface; its text still works). A positional directory passed to `prepare` is not expanded for the size check.
- A guard denial during measure: `claude-home`, 1 of 5. See `metrics.json` notes and `OWNER-INBOX.md`.

## WP2 status after this iteration

- Item 1 (pin `requirements.mcpServer`): **accepted**.
- Item 2 (`receivedAt` stamped by the CLI, `retrievedAt` never required): **accepted**.
- Item 3 (per-file size pre-flight in `prepare`): **accepted**.
- Item 4 (cache fetched sources per `updatedAt`): **dropped**. A cache cannot avoid a fetch. The session learns `updatedAt` only by fetching; `review`, the only command that writes, runs after the fetch; `prepare` writes nothing (07 K3); the skill forbids keeping the envelope on disk. A cache that skipped the fetch would review against unchecked, possibly stale requirements. The T4 re-fetch row stays "report only".
- WP2 exit: every item is accepted or explicitly dropped (02 §7). See `cp-2.md`.

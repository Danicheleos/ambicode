# it-001 — T3 re-record 8/8 with `--exclude` — decision

**Verdict: accept** (02 §5 last row: measurement-only, no behaviour claim; gates green; nothing in the plugin changed, so no control could move).

## Evidence

From `it-001/metrics.json`, reproduced by the verifier (`handoffs/verifier.md`):

```
G1 exit 0, 752 / 751 / 0 / 1        G2 exit 0, zip c8c5b7b3…dec7f       G3 exit 0
T3 8 of 8 cases recorded, refused 0, rejections 0; 19 new recording runs + 5 reused = 3 runs per case
   median findings: be-3571 4, be-5075 4, be-5546 6, be-6261 2, fe-6253 4, fe-6086-d1f 3, fe-6086-d7c 3, fe-6292 2
   costUsd 2.03 (brief budget $15), 518 s
diff.patch: empty (git diff gym/R1/it-000 -- . ':!gym')
```

Baseline (`baseline/metrics.json` T3): `"recordings": 5, "of": 8`, findings 4 / 4 / 6 / 1 / 6.

The claim "T3 5/8 → 8/8, 3 recordings per case" holds as recording runs. The stored artifact has 8 recordings, one per case, because the recorder overwrites by snapshot id (verifier's disagreement, now reflected in `storedRecordings: 8`). Medians come from the logs.

## Not measured, and caveats

- T1, T2, T4: `null` (no trigger surface, no code change, no human cycle).
- For 5 cases, recording #1 is the baseline recording (plugin 0.3.3, no `--exclude`). Reuse follows L-002 ("do not repeat spend that already produced usable evidence"), and `prompts/`, `policies/` and `src/review/` are unchanged since then. But those recordings cost $0.33–0.67 each, while the 19 new ones cost $0.06–0.19. **A 3–5× cost drop with the reviewer code unchanged is unexplained.** Without the reused recordings, the medians move by at most 0.5 finding per case, below the 2-finding signal rule (01 §3). Not investigated here: it belongs to WP3, whose seam is exactly the reviewer's usage record.
- fe-vs-6253: 6 findings in the old recording vs 3 and 4 in the new ones. A difference of 2–3 counts as real by the signal rule, but n = 1 on the old side.
- Harness side effect (named in the brief): T2 review with-arm sweeps from here replay the new recordings, so they are not directly comparable to cp-0's review numbers.

## WP1 status after this iteration

- Item 1 (record 8/8 with `--exclude`): **accepted** here.
- Item 2 (review with-arm runs the pipeline, `helper-ran` 0 → ≥ 6): **dropped, premise contradicted**. The baseline has `helper-ran` 23/24, median 8/8 (`baseline/metrics.json` T2 review.with; `baseline/decision.md` finding 1). No change was made, and none is needed.
- Item 3 (queue the local VS-6735 findings for labels): open → it-002 ($0).

## blockers

None.

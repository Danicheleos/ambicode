# it-002 — label queue for the 6 VS-6735 findings — decision

**Verdict: accept** (02 §5 last row: no behaviour claim; gates green; diff.patch empty).

```
G1 exit 0, 752 / 751 / 0 / 1 (verify.log: exit=0 seconds=27)   G2 exit 0, zip c8c5b7b3…dec7f   G3 exit 0, 485 files
labelsQueued: L-003 … L-008 (labels/pending.md); costUsd 0
```

The verifier (`handoffs/verifier.md`) matched all 6 ids, reviews, categories and locations against the archived `result.json` files, and found no finding text in the entry (6-word-window search; paraphrase is not detected). Its note that line 108 never names L-004 is now stated in the table.

Not measured: T1–T4, not applicable. The later-iteration judgements were not re-derived against the plan file. They are the audit's and are marked as such until a human answers.

**WP1 exit** (02 §7): item 1 accepted (it-001), item 2 dropped (premise contradicted, `baseline/decision.md` finding 1), item 3 accepted (this iteration). → `cp-1.md`.

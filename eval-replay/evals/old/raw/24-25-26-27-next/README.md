# Follow-up audit: new investigate suite, runs 06 and 07

Date: 2026-10-08. [Full analysis and recommendations](report.md).

Run 06 passes the existing gate; run 07 fails cost. Stronger wording increases reader adoption, but also adds reading rounds, root-resolution failures, output, and cached traffic. The worst-cost case does not have reader calls large enough for a 12 KB cap to affect them. Search targeting and evidence selection remain the priorities.

Supporting artifacts:

- [Audit metrics, case comparisons, gate replay, and uncertainty](audit.json).
- [180 matched attempts: 120 plugin, 60 cached bare](attempts.json).
- [Tool operations and reader outputs](toolcalls.json).
- [120 delivered-map receipts](maps.json).
- [Current case bases and file hashes](case-manifest.json).
- [Free reader-budget replay](read-budget-replay.json).

Reproduce from saved data, with no model calls or product changes:

```sh
node eval-replay/evals/24-25-26-27-next/analyze.mjs
node eval-replay/evals/24-25-26-27-next/replay-read-budgets.mjs
```

The second script reads immutable git object content from the benchmark cache and calls the reader with in-memory filesystem ports. It does not run a scaffold or application. The report distinguishes those deterministic output measurements from unknown future model behavior and paid cost.

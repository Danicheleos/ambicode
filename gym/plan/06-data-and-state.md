# 06 — Data and state

Where every run log, metric, diff and decision lives; what is committed; how to
rebuild the campaign's state from disk alone. Read with
[02-loop-protocol.md](02-loop-protocol.md) (what produces these files) and
[08-safety-and-rollback.md](08-safety-and-rollback.md) (what must never be here).

## 1. Layout

All campaign state lives under `gym/runs/<campaign-id>/`. The planner does not
create it; the lead creates it in iteration 0 ([02 §2](02-loop-protocol.md#2-iteration-0-baseline)).

```text
gym/plan/                          this plan (read-only during a campaign; changed only by 09-replan)
gym/runs/<campaign-id>/
  CAMPAIGN.md                      start commit, plan digest, budget, model ids, status (open|paused|stopped|done)
  STATE.md                         one row per iteration: id, commit, tag, WP, decision, cost — the reconstruction entry point
  baseline/                        iteration-0 measurements (same files as an iteration dir)
  it-NNN/                          one directory per iteration, NNN zero-padded from 001
    brief.md                       what is being changed, why, which metric it claims to move, budget
    diff.patch                     `git diff <base-tag>..HEAD -- . ':!gym'` of the plugin change
    verify.log                     full `npm run verify` output
    metrics.json                   the numbers, schema in §3
    decision.md                    accept / reject / inconclusive, with the evidence lines quoted
    handoffs/                      one file per helper report, format in 04 §4
    scratch/                       NOT committed: eval result JSON, traces, review prompts, recordings
  labels/
    pending.md                     questions for the human, oldest first (02 §6)
    labels.json                    answers, keyed by question id
  incidents/                       one file per emergency stop or rollback (08 §5)
  archive/                         NOT committed: durable copies of volatile inputs (§5)
  STOP                             presence = emergency stop requested (08 §2); never committed
  PHASE                            `<it-NNN> <phase>`, the lead's current step (10 §3); never committed
  OWNER-INBOX.md                   supervisor notices for the owner (10 §4); committed
  supervisor/                      NOT committed: guard.log, supervisor.log, session streams, context.json, KILL marker, state.json
```

Campaign id: `<YYYY-MM-DD>-<slug>` of the start date, e.g. `2026-09-29-c1`.

## 2. Committed vs scratch

| Path | Committed? | Why |
|---|---|---|
| `CAMPAIGN.md`, `STATE.md`, `it-NNN/{brief,decision}.md`, `it-NNN/metrics.json`, `it-NNN/handoffs/*.md`, `labels/*`, `incidents/*` | yes | Reconstruction needs them; they carry numbers and paths, not NDA content |
| `it-NNN/diff.patch`, `it-NNN/verify.log` | yes | Diff of this repository only (`':!gym'` excludes campaign files); verify output has no NDA content |
| `it-NNN/scratch/**`, `archive/**` (except `archive/MANIFEST.txt`), `STOP`, `PHASE`, `supervisor/**` | no | Eval result JSON embeds benchmark prompts (NDA, `evals/evals-core/README.md:3-4`); traces embed code; recordings and snapshots embed the FE repository |

The supervisor writes `gym/runs/.gitignore` before the first launch (`ensureIgnored`, `supervisor/supervise.mjs`), containing:

```gitignore
**/scratch/
**/archive/
**/STOP
**/PHASE
**/supervisor/
```

`archive/MANIFEST.txt` is committed with `git add -f`; the session streams under `supervisor/` can carry NDA text.

Rule for every committed file: it may name a case id (`be-vs-5928`), a ticket key
(`VS-6735`) or a file path, because tracked notes already do
(`gym/planing/investigation/investigation_2026-09-28T22-45.md`, commit `3e5e146`);
it may never contain ticket text, review-thread text, diff hunks from
`benchmarks/`, or reviewer prompts. `benchmarks/`, `evals/evals-core/cases/`,
`evals/**/results/`, `.ambicode/` and `archive/` stay gitignored (`.gitignore:22-38`).

## 3. `metrics.json` schema

One object per iteration; absent measurements are `null`, never `0`
(CLAUDE.md "Never let a change make the output look cleaner than the reality").
Metric ids are defined in [01-goals-and-metrics.md](01-goals-and-metrics.md).

```json
{
  "iteration": "it-003",
  "commit": "<40-hex>",
  "pluginVersion": "0.3.4",
  "capturedAt": "2026-09-29T10:00:00Z",
  "models": { "agent": "claude-opus-5-5", "reviewer": "sonnet", "judge": "claude-haiku-4-5-20251001" },
  "G1": { "exit": 0, "tests": 751, "pass": 750, "fail": 0, "skipped": 1, "seconds": 0 },
  "G2": { "exit": 0 },
  "T1": { "scoredMean": 1.0, "urlBarePattern": "investigate 3/3", "runs": 3, "costUsd": 0, "seconds": 0, "resultDir": "scratch/triggers/<ts>" },
  "T2": { "runsPerArm": 3, "resultFiles": ["scratch/curated/eval-<ts>.json"],
          "localize": { "with": { "f1": 0, "precision": 0, "recall": 0, "helperRan": 0 }, "without": { "f1": 0, "precision": 0, "recall": 0 } },
          "review":   { "with": { "recall": 0, "helperRan": 0 }, "without": { "recall": 0 } },
          "costUsd": 0, "seconds": 0 },
  "T3": { "recordings": 5, "of": 8, "perCase": [ { "case": "be-vs-6261-review-1141-f14493f1", "findings": 1, "turns": 0, "costUsd": 0.33, "seconds": 126 } ] },
  "T4": null,
  "costUsd": 0,
  "notes": "free text: what was skipped and why"
}
```

`models.agent` is read from the harvested traces' `system/init` row
(`evals/evals-core/results/traces/*.jsonl`, field `model`), because the result
JSON does not record it (keys per run: `costUsd, durationSeconds, error, graders,
judgeCostUsd, passed, score, skippedPaidGraders, startedAt, tracePath, turns`).

## 4. Git conventions

- Branch `gym/<campaign-id>` created from `tuning` (HEAD `3e5e146` at planning time). Never
  `main`, never `master`.
- One commit per accepted iteration, message `gym <campaign-id> it-NNN: <one line>`; the
  campaign files of that iteration are in the same commit.
- Tag `gym/<campaign-id>/it-NNN` on every accepted commit; tag `gym/<campaign-id>/cp-K` on
  every checkpoint ([03](03-checkpoints-and-gates.md)). The repository has 0 tags today
  (`git tag | wc -l` → 0), so the namespace is free.
- A rejected iteration is not committed: `git reset --hard <last accepted tag>` after its
  `decision.md` and `metrics.json` are written and committed on their own
  (commit `gym <campaign-id> it-NNN: rejected — <reason>`).
- No push unless [USER-GUIDE.md](USER-GUIDE.md) §4 says the owner enabled it.

## 5. Volatile inputs to archive before iteration 1

Copied once into `gym/runs/<campaign-id>/archive/` (not committed) by the owner with
`node gym/plan/supervisor/supervise.mjs archive --campaign <campaign-id>` (list in
`supervisor/defaults.json` → `volatileInputs`), with a sha256 manifest in
`archive/MANIFEST.txt` that **is** committed:

| Source (exists at planning time) | Why volatile |
|---|---|
| `~/.claude/projects/-Users-KillBill-Documents-projects-inseer-inseer-frontend/8efdbd08-d9f5-45e9-b69e-98333a4275eb.jsonl` and `9a235fc3-aa67-402d-8ef2-6e115f369eac.jsonl` | `~/.claude/projects` is not a durable store (v2 note §0) |
| `/var/folders/nx/xb7v_m614s50z6c43bmbj5j40000gp/T/ambicode-snapshot-{Fc3xud,FvNeOp,sHg0ly}` (paths in `gym/planing/investigation/cache/VS-6735/reviews/*/snapshot-path.txt`; all three existed on 2026-09-28) | macOS purges `$TMPDIR` |
| `gym/planing/investigation/cache/VS-6735/` | gitignored (`.gitignore:40`) |
| `benchmarks/reviewer-recordings.json` | gitignored; overwritten by every `evals:record` |
| `evals/evals-core/results/eval-2026-09-28T{11-55-27-862Z,13-30-05-452Z,16-18-49-737Z}.json` + `results/traces/` | gitignored; the three pre-campaign sweeps |

## 6. Reconstructing state from disk

1. `git log --oneline gym/<campaign-id>` and `git tag -l 'gym/<campaign-id>/*'` — accepted history.
2. `cat gym/runs/<campaign-id>/STATE.md` — the iteration table; its last row is where work stopped.
3. `ls gym/runs/<campaign-id>/it-*/` — a directory with `brief.md` but no `decision.md` is an iteration in flight; treat it as rejected unless `metrics.json` is complete and `verify.log` ends with `exit=0`.
4. `test -e gym/runs/<campaign-id>/STOP` — if present, the campaign is stopped; read `incidents/` before anything else.
5. `(cd gym/runs/<campaign-id> && sha256sum -c archive/MANIFEST.txt)` — confirms the volatile inputs are intact.
6. `git status --short` must be empty apart from `gym/runs/**/scratch` and `archive` — anything else is an unrecorded change: diff it, then discard or record it before continuing.

Nothing in the lead's or a helper's memory counts as state. If it is not on disk under
`gym/runs/<campaign-id>/`, it did not happen ([05 §2](05-anti-hallucination.md)).

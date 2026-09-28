# 02 — Loop protocol

One evaluate → improve → evaluate iteration, step by step. Metric ids and commands are in
[01-goals-and-metrics.md](01-goals-and-metrics.md); file locations in
[06-data-and-state.md](06-data-and-state.md); roles in [04-orchestration.md](04-orchestration.md).

## 1. Entry conditions

All must hold before `it-NNN/brief.md` is written.

| Check | Command | Required |
|---|---|---|
| Clean tree | `git status --short` | empty apart from `gym/runs/**/scratch`, `archive`, `STOP` |
| On the campaign branch | `git branch --show-current` | `gym/<campaign-id>` |
| Last accepted tag exists | `git tag -l 'gym/<campaign-id>/it-*' \| tail -1` | equals the last `accepted` row of `STATE.md` |
| No stop | `test ! -e gym/runs/<campaign-id>/STOP` | true |
| Budget | sum of `costUsd` over `it-*/metrics.json` | < 90 % of `CAMPAIGN.md` ceiling |
| Baseline exists | `test -s gym/runs/<campaign-id>/baseline/metrics.json` | true (else run §2) |
| Plan digest | `sha256sum gym/plan/*.md \| sha256sum` | equals `CAMPAIGN.md` `planDigest`; if not, stop and read [09](09-replan.md) |

## 2. Iteration 0 (baseline)

Once per campaign.

1. `git switch -c gym/<campaign-id> tuning` (from `3e5e146` or the owner-named commit); write `CAMPAIGN.md` (start commit, `planDigest`, budget ceiling, model ids, owner contact) and `gym/runs/.gitignore` ([06 §2](06-data-and-state.md#2-committed-vs-scratch)).
2. Archive the volatile inputs and write `archive/MANIFEST.txt` ([06 §5](06-data-and-state.md#5-volatile-inputs-to-archive-before-iteration-1)). Fail loudly if any source is missing; that is Q-class blocker B5 ([07](07-blockers.md)).
3. Write `tools/transcript-metrics.py` from the audited scripts and run it on the VS-6735 transcripts; its output must reproduce the T4 baseline row for row before it is trusted.
4. Run G1–G3, T1, `npm run evals:preflight`, then T2 at 3 runs/arm with `--model claude-opus-5-5`, then T3 (`jq` over the existing recordings; no re-record yet).
5. Write `baseline/metrics.json`, `baseline/verify.log`; copy result JSON and traces into `baseline/scratch/`.
6. Commit `gym <campaign-id> it-000: baseline`; tag `gym/<campaign-id>/it-000`.

## 3. One iteration

```text
select ─▶ brief ─▶ implement ─▶ gate ─▶ measure ─▶ decide ─▶ record ─▶ (commit+tag | reset)
```

**3.1 Select.** Take the next open item of the current WP in [01 §4](01-goals-and-metrics.md#4-work-packages)
order. One iteration changes one thing: one seam, one claimed metric. Splitting is
allowed; merging two WPs into one iteration is not.

**3.2 Brief** (`it-NNN/brief.md`, written before any edit; template):

```markdown
# it-NNN — <one line>
WP: WP2   Seam: src/cli/commands/prepare.ts:446-454, src/snapshot/snapshot.ts:56-87
Claim: T4 refused launches 1/session → 0; G1 tests +2
Must not move: T2 localize F1 (control), T1
Measurement plan: G1-G3; T1 (skill text touched: yes/no); T2 screening 1 run/arm → decision 3 runs/arm only if screening is not worse than baseline − 0.05
Budget for this iteration: $<n>   Files allowed to change: <globs>
Rollback: git reset --hard gym/<campaign-id>/it-<last>
```

**3.3 Implement.** Scope per turn: only the files named in the brief, under `src/`,
`skills/`, `prompts/`, `policies/`, `evals/scripts/`, `fixtures/`, `docs/`; never
`benchmarks/`, `.ambicode/`, `gym/plan/`, `CLAUDE.md`, `.github/`, `package.json`
`version`. New behaviour ships with its test (CLAUDE.md "New behaviour ships with its
test"). Use a worker in a worktree ([04 §3](04-orchestration.md#3-workers)) or the
`/ambicode:task` skill; the lead never edits `src/` itself ([04 §1](04-orchestration.md#1-lead)).

**3.4 Gate.** `npm run verify` → `it-NNN/verify.log`; then G2, G3. Any failure: fix within
the same iteration at most twice, then reject ([07 B1](07-blockers.md)). "Typecheck after
every structural edit; run the full suite before saying done" (CLAUDE.md).

**3.5 Measure.** Exactly what the brief listed, in this order, each into `metrics.json`:
1. T1 if `skills/*/SKILL.md` frontmatter, `hooks/`, or `src/hook/` changed; else `null` with `notes: "T1 skipped: no trigger surface touched"`.
2. `npm run evals:preflight` before any T2 (refuses when the plugin does not fire; $0.4–0.7).
3. T2 screening at 1 run/arm. If the with-arm is not worse than baseline − 0.05 on the claimed metric, run T2 at 3 runs/arm. Otherwise stop here: the iteration is a reject (no decision sweep is spent on a change that already lost).
4. T3 re-record only if `prompts/`, `policies/` or `src/review/` changed (3 recordings per case, medians).
5. T4 only when a new human-run cycle exists in `labels/labels.json`; otherwise `null`.

The verifier ([04 §2](04-orchestration.md#2-verifier)) re-runs G1 and re-extracts every
T-number from the result files independently before step 3.6; a mismatch is a red flag
([05 §5](05-anti-hallucination.md#5-red-flags)).

**3.6 Decide** with §5. Write `it-NNN/decision.md`: the verdict, the exact lines from
`metrics.json` and `baseline/metrics.json` it rests on, and what was **not** measured.

**3.7 Record.** `diff.patch`, `metrics.json`, `decision.md`, `handoffs/*` committed;
`STATE.md` gets its row. Accepted: commit the change + campaign files, tag
`gym/<campaign-id>/it-NNN`. Rejected: commit the campaign files only, then
`git reset --hard <last accepted tag>` **after** confirming `git diff --stat` shows only
the rejected change ("Before anything destructive", CLAUDE.md). Inconclusive: same as
rejected, plus a `labels/pending.md` entry if a human label would settle it.

## 4. Required tests per change type

| Touched | Required before measure |
|---|---|
| `src/**` | `npm run verify` (G1) + G2 + a new or changed `*.test.ts` in the same diff |
| `skills/**`, `prompts/**` | G1 (skill-content tests run in it) + T1 + T3 re-record if `prompts/` |
| `policies/**` | G1 (`src/policy/policy.test.ts`) + T3 re-record |
| `evals/scripts/**` | G1 (`evals/scripts/src/*.test.mjs`) + one T2 screening to prove the harness still runs |
| `fixtures/**` | G1 + `npm run evals:preflight` |
| `docs/**` | G3 only |

## 5. Decision table

Applies to medians over ≥ 3 runs/arm (T2), 3 recordings (T3). Screening sweeps never decide.

| Gates | Claimed metric | Control metrics (must-not-move) | Verdict |
|---|---|---|---|
| any red | — | — | **reject** |
| green | moved ≥ signal threshold in the claimed direction | all within noise (01 §3) | **accept** |
| green | moved ≥ threshold | one control moved beyond noise **against** | **reject** — record the trade-off |
| green | within noise | all within noise | **inconclusive** — one retry allowed with a sharper brief, else reject |
| green | moved ≥ threshold **against** | — | **reject** |
| green | not measured (skipped step) | — | **inconclusive**, never accept; the skipped step is named in `decision.md` |
| green | WP0-type change (tooling, no behaviour claim) | all within noise | **accept** on gates + control |

Cost rule: an accept whose with-arm cost rose > 25 % over baseline without the brief
predicting it becomes **reject** (01 §3, T2).

## 6. Label queue

Anything only a human can settle goes to `labels/pending.md` as one block:

```markdown
## L-007  (asked it-004, 2026-09-30)
Question: For review local_2026-09-28T21-38, is finding f-414213252434 actionable / correct-but-inert / unfounded / unverifiable (rubric evals/evals-archived/typescript/adjudication.md)?
Needed for: WP4 T4 "later-iteration findings"
Default if unanswered by it-008: treat as correct-but-inert (does not count as recall)
```

Answers go to `labels/labels.json` (`{"L-007": {"label": "...", "by": "...", "at": "..."}}`).
An unanswered label past its default iteration takes the default and the decision says so.

## 7. Exit conditions

- **Iteration exit:** `decision.md` committed and `STATE.md` row present; tree clean.
- **WP exit:** every item of the WP row in 01 §4 accepted or explicitly dropped in `decision.md`.
- **Campaign exit:** [01 §1](01-goals-and-metrics.md#1-definition-of-trained-cycle-1) all true on one tagged commit → write `CAMPAIGN.md` `status: done` and the handover note ([USER-GUIDE §6](USER-GUIDE.md)).
- **Forced exit:** any trigger in [03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate) or [08 §2](08-safety-and-rollback.md#2-emergency-shutdown).

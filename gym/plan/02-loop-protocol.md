# 02 — Loop protocol

Supersedes: gym/plan/02-loop-protocol.md @ c7d037a1911594eb921dbc9890437b1f1f3e8108b98002c48f5b10550d406317 (replan R-3; R-1's and R-2's Changes stay below, R-3's follow them)

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
| Baseline exists | `test -s gym/runs/<campaign-id>/baseline/metrics.json` | true (else run §2); `baseline/metrics-R-1.json` is also accepted as the reference for Sonnet comparisons |
| Plan digest | `sha256sum gym/plan/*.md \| sha256sum` | equals `CAMPAIGN.md` `planDigest`; if not, stop and read [09](09-replan.md) |

## 2. Iteration 0 (baseline)

Once per campaign.

1. Be on `gym/<campaign-id>`: the owner creates it from `tuning` before starting the supervisor (`git switch -c gym/<campaign-id> tuning`); otherwise create it now. Write `CAMPAIGN.md` (start commit, `planDigest`, `budgetUsd: <n>`, `status: open`, model ids, owner channel) and confirm `gym/runs/.gitignore` has the five lines of [06 §2](06-data-and-state.md#2-committed-vs-scratch).
2. Verify the archive: the owner creates it before the first launch with `node gym/plan/supervisor/supervise.mjs archive --campaign <campaign-id>` ([10 §1](10-supervisor.md#1-components)), because the guard denies agent reads of `~/.claude`. The lead runs `(cd gym/runs/<campaign-id> && sha256sum -c archive/MANIFEST.txt)` and commits the manifest with `git add -f`. A missing archive or a failed check is blocker B5 ([07](07-blockers.md)).
3. Write `tools/transcript-metrics.py` from the audited scripts and run it on the VS-6735 transcripts; its output must reproduce the T4 baseline row for row before it is trusted.
4. Run G1–G3, T1, `npm run evals:preflight`, then T2 at 3 runs/arm with `--model claude-opus-5-5`, then T3 (`jq` over the existing recordings; no re-record yet).
5. Write `baseline/metrics.json`, `baseline/verify.log`; copy result JSON and traces into `baseline/scratch/`.
6. Commit `gym <campaign-id> it-000: baseline`; tag `gym/<campaign-id>/it-000`.

## 3. One iteration

```text
select ─▶ brief ─▶ implement ─▶ gate ─▶ measure ─▶ decide ─▶ record ─▶ (commit+tag | reset)
```

**Phase file.** At every step below the lead first writes `gym/runs/<campaign-id>/PHASE` (`<it-NNN> <phase>`: select, brief, implement, gate, measure, decide, record, then idle). The session may end only at a safe point ([10 §3](10-supervisor.md#3-safe-points-and-the-phase-file)).

**3.1 Select.** Take the next open item of the current WP in [01 §4](01-goals-and-metrics.md#4-work-packages)
order. One iteration changes one thing: one seam, one claimed metric. Splitting is
allowed; merging two WPs into one iteration is not.

**3.2 Brief** (`it-NNN/brief.md`, written before any edit; template):

```markdown
# it-NNN — <one line>
Plan revision: R-3
WP: WP2   Seam: src/cli/commands/prepare.ts:446-454, src/snapshot/snapshot.ts:56-87
Claim: T4 refused launches 1/session → 0; G1 tests +2
Must not move: T2 localize F1 (control), T1
Measurement plan: G1-G3; T1 (skill text touched: yes/no); every eval with `--model claude-sonnet-5-5`; T2 screening 1 run/arm → decision 3 runs/arm only if screening is not worse than baseline − 0.05
Budget for this iteration: $<n>   Files allowed to change: <globs>
Rollback: git reset --hard gym/<campaign-id>/it-<last>
```

The brief is committed BEFORE the first measure step, so git shows the order (auditor finding F10, `it-003/handoffs/auditor.md`).

**3.3 Implement.** Scope per turn: only the files named in the brief, under `src/`,
`skills/`, `prompts/`, `policies/`, `evals/scripts/`, `fixtures/`, `docs/`; never
`benchmarks/`, `.ambicode/`, `gym/plan/`, `CLAUDE.md`, `.github/`, `package.json`
`version`. New behaviour ships with its test (CLAUDE.md "New behaviour ships with its
test"). R-2 (owner, L-013 b) allows one file outside this list:
`evals/evals-archived/typescript/p2-task-regression-fix/prompt.md`, in the iteration that
repairs the preflight. R-3 (owner, L-015 b) fixes its wording: the task sentence "Find it, fix
it, and verify the fix." becomes "Find it. Use the ambicode task skill to implement the fix,
and verify the fix." and nothing else in the file changes. Any other eval case file
(`prompt.md`, `case.yaml`, `graders/`) needs the same route, an owner-confirmed replan that
names it. Use a worker in a worktree
([04 §3](04-orchestration.md#3-workers)) or the
`/ambicode:task` skill; the lead never edits `src/` itself ([04 §1](04-orchestration.md#1-lead)).

**3.4 Gate.** `npm run verify` → `it-NNN/verify.log`; then G2, G3. Any failure: fix within
the same iteration at most twice, then reject ([07 B1](07-blockers.md)). "Typecheck after
every structural edit; run the full suite before saying done" (CLAUDE.md).

**3.5 Measure.** Exactly what the brief listed, in this order, each into `metrics.json`:
1. T1 if `skills/*/SKILL.md` frontmatter, `hooks/`, or `src/hook/` changed; else `null` with `notes: "T1 skipped: no trigger surface touched"`.
2. `npm run evals:preflight` before any T2 (refuses when the plugin does not fire; $0.4–0.7). `plugin-fired` and `helper-ran` are required for both preflight cases, on every model. On Sonnet (the result's own `suite.modelOverride`), `unit-check-ran` of `p2-task-regression-fix` is printed as a NOTE with its observed state and is not gated (R-2, L-013 a). The prompt of `p2-task-regression-fix` names the ambicode task skill (R-3, L-015 b), so its `plugin-fired` and `helper-ran` measure the skill's mechanics once called, not whether the description makes it fire; T1 is the trigger metric, and a passing preflight is never read as trigger evidence. A preflight that still fails after that repair is a B2 stop: the lead reports it, files a label, and neither drops another grader, nor gates on `regression-ts` alone, nor edits the prompt again, nor runs T2 behind it; only a new owner label changes that. After a Sonnet pass, the Opus preflight runs once before H2-T2 (the new prompt has not been seen by an Opus run).
3. T2 screening at 1 run/arm on Sonnet for every iteration that touches a seam a T2 case can see. If the with-arm is worse than the Sonnet baseline minus 0.05 on the claimed or control metric, stop here: the iteration is a reject (no sweep is spent on a change that already lost). If not worse, do NOT run a 3-run sweep in the iteration: the verdict is a provisional accept (§5) and the 3 runs/arm decision sweep runs at the next checkpoint ([03 §1](03-checkpoints-and-gates.md#1-checkpoints)). An iteration whose brief claims a T2 metric that a screening cannot decide (claimed movement smaller than 0.05) is brought forward: run the 3 runs/arm sweep in that iteration.
4. T3 re-record only if `prompts/`, `policies/` or `src/review/` changed: 3 recordings per case with the keep-runs option ([01 §3](01-goals-and-metrics.md#3-measured-metrics)); report the findings counts and the medium-and-above stability. T3 is not a control until the stability floor exists (01 §3).
5. T4p when the brief claims a T4 metric and T4p exists (01 §3), else `null`; the human T4 only at cp-5 ([03 §1](03-checkpoints-and-gates.md#1-checkpoints)).

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
| `evals/evals-*/**` case files (`prompt.md`, `case.yaml`, `graders/`) | only the file a confirmed replan names; G1 + `npm run evals:preflight` |
| `docs/**` | G3 only |

## 5. Decision table

Applies to medians over ≥ 3 runs/arm (T2), 3 recordings (T3: counts reported, stability once its floor exists). Screening sweeps never decide an accept: at most they leave a provisional accept.

| Gates | Claimed metric | Control metrics (must-not-move) | Verdict |
|---|---|---|---|
| any red | — | — | **reject** |
| green | moved ≥ signal threshold in the claimed direction | all within noise (01 §3) | **accept** |
| green | moved ≥ threshold | one control moved beyond noise **against** | **reject** — record the trade-off |
| green | within noise | all within noise | **inconclusive** — one retry allowed with a sharper brief, else reject |
| green | moved ≥ threshold **against** | — | **reject** |
| green | not measured (skipped step) | — | **inconclusive**, never accept; the skipped step is named in `decision.md`; a claim with no proxy and no reproducing test named in the brief is still **inconclusive** |
| green | WP0-type change (tooling, no behaviour claim) | all within noise | **accept** on gates + control |
| green | T2 screening (1 run/arm) not worse than the Sonnet baseline − 0.05 on the claimed or control metric; no T2 claim smaller than 0.05 (that one is brought forward, §3.5 step 3) | within noise, or not measurable per iteration (T2 by screening only; T3 stability before its floor exists) | **provisional accept**: tag `gym/R1/it-NNN` is created; `STATE.md` says "provisional"; the next checkpoint's 3 runs/arm sweep either confirms it (the row becomes accept) or a control moved beyond noise against, which makes that checkpoint **no-go** and the iterations since the last confirmed checkpoint are bisected with a revert iteration (tags never move, 09 §3) |
| green | the claim is a T4 metric, measured by T4p when it exists, otherwise by the reproducing tests the brief names before the change | all within noise (T2 control: screening not worse than the Sonnet baseline − 0.05; the checkpoint sweep covers it) | **accept**; the human T4 stays "observed" until cp-5 |

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
A label whose answer only a human cycle can give (L-010) does not gate an iteration; its default only affects cp-5.

## 7. Exit conditions

- **Iteration exit:** `decision.md` committed and `STATE.md` row present; tree clean.
- **WP exit:** every item of the WP row in 01 §4 accepted or explicitly dropped in `decision.md`.
- **Campaign exit:** [01 §1](01-goals-and-metrics.md#1-definition-of-trained-cycle-1) all true on one tagged commit → write `CAMPAIGN.md` `status: done` and the handover note ([USER-GUIDE §6](USER-GUIDE.md)).
- **Forced exit:** any trigger in [03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate) or [08 §2](08-safety-and-rollback.md#2-emergency-shutdown).

## Changes

- §1 baseline row, required: "true (else run §2)" -> "true (else run §2); `baseline/metrics-R-1.json` is also accepted as the reference for Sonnet comparisons". Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3.2 brief template: (no revision header; Measurement plan without a model) -> header line `Plan revision: R-1`; Measurement plan names `--model claude-sonnet-5-5` for every eval. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3.2 after the template: (none) -> "The brief is committed BEFORE the first measure step, so git shows the order". Lead-proposed, not an owner line. Evidence: `gym/runs/R1/it-003/handoffs/auditor.md` F10.
- §3.5 step 3: "T2 screening at 1 run/arm. If the with-arm is not worse than baseline − 0.05 on the claimed metric, run T2 at 3 runs/arm. Otherwise stop here: the iteration is a reject" -> screening at 1 run/arm on Sonnet for every iteration that touches a seam a T2 case can see; worse than the Sonnet baseline − 0.05 on the claimed or control metric: reject; not worse: no 3-run sweep in the iteration, the verdict is a provisional accept and the 3 runs/arm decision sweep runs at the next checkpoint (03); a brief that claims a T2 metric a screening cannot decide (claimed movement smaller than 0.05) is brought forward to a 3 runs/arm sweep in that iteration. Evidence: `labels.json` L-011 also, 2026-09-29T09:14:36.733Z.
- §3.5 step 4: "T3 re-record only if `prompts/`, `policies/` or `src/review/` changed (3 recordings per case, medians)" -> the same trigger; 3 recordings per case with the keep-runs option; report counts and medium-and-above stability; T3 is not a control until the floor exists. Evidence: `labels.json` L-011 a, 2026-09-29T09:14:36.733Z.
- §3.5 step 5: "T4 only when a new human-run cycle exists in `labels/labels.json`; otherwise `null`" -> "T4p when the brief claims a T4 metric and T4p exists, else `null`; the human T4 only at cp-5". Evidence: `labels.json` L-011 b, 2026-09-29T09:14:36.733Z.
- §5 intro: "Applies to medians over ≥ 3 runs/arm (T2), 3 recordings (T3). Screening sweeps never decide." -> "3 recordings (T3: counts reported, stability once its floor exists). Screening sweeps never decide an accept: at most they leave a provisional accept." Evidence: `labels.json` L-011 a, L-011 also, 2026-09-29T09:14:36.733Z.
- §5 row "not measured (skipped step)": "inconclusive, never accept; the skipped step is named in `decision.md`" -> the same, plus "a claim with no proxy and no reproducing test named in the brief is still inconclusive". Evidence: `gym/plan/09-replan.md` §4 (an inconclusive is not turned into an accept).
- §5 new verdict row **provisional accept** (gates green, screening not worse than the Sonnet baseline − 0.05, controls within noise or not measurable per iteration; tag `gym/R1/it-NNN` created, `STATE.md` says "provisional", the next checkpoint's 3 runs/arm sweep confirms it or a control moved beyond noise against makes that checkpoint no-go with the iterations since the last confirmed checkpoint bisected by a revert iteration, tags never move). Evidence: `labels.json` L-011 also, 2026-09-29T09:14:36.733Z. This row is the lead's reading of the owner's split between screening and checkpoint sweeps and needs the owner's confirmation.
- §5 new row for a T4 claim: (none) -> claim is a T4 metric, measured by T4p when it exists, otherwise by the reproducing tests the brief names before the change; controls within noise; verdict accept, the human T4 stays "observed" until cp-5. Evidence: `labels.json` L-011 b, 2026-09-29T09:14:36.733Z ("Accept WP2 on gates plus its reproducing tests"). This row is the lead's reading of the owner's line and needs the owner's confirmation.
- §6 label queue: (none) -> "A label whose answer only a human cycle can give (L-010) does not gate an iteration; its default only affects cp-5." Evidence: `labels.json` L-011 b, 2026-09-29T09:14:36.733Z.
- R-2 header and §3.2 template: `Supersedes` names the R-1 digest; `Plan revision: R-1` -> `Plan revision: R-2`. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §3.3: (list of allowed paths only) -> plus one named eval case file, `evals/evals-archived/typescript/p2-task-regression-fix/prompt.md`, and the rule that any other eval case file needs an owner-confirmed replan naming it. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §3.5 step 2: preflight required graders unstated in the plan -> `plugin-fired` and `helper-ran` required for both cases on every model; on Sonnet `unit-check-ran` of `p2-task-regression-fix` is a NOTE with its observed state, not gated; a preflight that still fails after the repair is a B2 stop with a label, no further grader dropped, no T2 behind it. The relaxation is data-driven (`suite.modelOverride` of the result), so Opus stays strict. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §4 table: new row for eval case files (only the file a confirmed replan names; G1 + preflight). Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- R-3 header and §3.2 template: `Supersedes` names the R-2 digest; `Plan revision: R-2` -> `Plan revision: R-3`. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z; `gym/runs/R1/replan/R-3-2026-09-29T11-59-31Z.md`.
- §3.3: the R-2 allowance for `p2-task-regression-fix/prompt.md` (wording not fixed; R-2's rationale was the verb "implement") -> the wording is fixed: "Find it, fix it, and verify the fix." becomes "Find it. Use the ambicode task skill to implement the fix, and verify the fix.", nothing else in the file changes; other eval case files still need their own confirmed replan. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z ("This wording is outside R-2's allowance (it names 'implement' only)"); it-008 preflight 2 of 2 failed on "implement the fix" (`gym/runs/R1/it-008/decision.md`).
- §3.5 step 2: (R-2 text) -> plus: the prompt names the skill, so `plugin-fired` and `helper-ran` of that case measure the skill's mechanics, never trigger evidence (T1's job); a still-failing preflight is a B2 stop that also forbids gating on `regression-ts` alone and editing the prompt again, until a new owner label; after a Sonnet pass the Opus preflight runs once before H2-T2. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z.

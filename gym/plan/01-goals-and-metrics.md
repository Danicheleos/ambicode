# 01 — Goals and metrics

What "trained" means for this campaign, the named metrics, the exact command behind
each, the baseline captured on 2026-09-28 at HEAD `3e5e146` (plugin 0.3.4), the target,
and the smallest change that counts as signal. Every number below is either a command
output from [00-audit.md](00-audit.md) or marked TBD. The lead re-reads this file at the
cadence in [05 §4](05-anti-hallucination.md#4-cadence).

## 1. Definition of "trained" (cycle 1)

The plugin is trained for cycle 1 when all of the following hold on one commit, each
proven by a `metrics.json` in `gym/runs/<campaign>/it-NNN/` ([06 §3](06-data-and-state.md#3-metricsjson-schema)):

1. Gates G1–G3 green (§2).
2. T1 unchanged from baseline (7 scored cases at 1.0 in 3/3 runs; `url-bare` → investigate 3/3).
3. T2 localize with-arm F1 (median of 3 runs/arm) not below baseline − 0.03, and review with-arm `helper-ran` ≥ 6 of 8 runs.
4. T3 recordings 8/8 curated review cases, each recorded 3 times.
5. WP0–WP4 accepted per the decision table in [02 §5](02-loop-protocol.md#5-decision-table).
6. T4 on the first human-run cycle after WP2: fabricated provenance fields 0, refused review launches 0.

Anything else (WP5–WP7) is cycle 2 and needs a replan ([09](09-replan.md)).

## 2. Gates (deterministic, $0)

| Id | Command | Extract | Baseline (2026-09-28) | Rule |
|---|---|---|---|---|
| G1 | `npm run verify` | exit code; `ℹ tests/pass/fail/skipped` lines | exit 0; 751 / 750 / 0 / 1; 29.7 s wall | exit ≠ 0 or `fail` > 0 or `tests` < 751 → reject the iteration |
| G2 | `npm run package:reproducible` | exit code; "identical zip sha256" line | exit 0; zip sha256 `c8c5b7b3…dec7f`; 1.1 s | exit ≠ 0 → reject |
| G3 | `node check-line-endings.mjs` | exit code | exit 0; 441 tracked text files LF | exit ≠ 0 → reject |

A new behaviour ships with its test in the same change (CLAUDE.md), so `tests` must
rise by ≥ 1 for any WP that adds behaviour; equal count with new behaviour → reject.

## 3. Measured metrics

### T1 trigger routing

Structural graders only; ≈ $4 and ≈ 3 min per sweep.

```
npm run evals:triggers
R=$(ls -td evals/evals-triggers/results/*/ | head -1)
jq -r '.cases[] | "\(.name)\t\(.arms.with | map(.score) | add / length)"' "$R/aggregate-result.json"
jq -c '{costUsd, durationSeconds, partial}' "$R/aggregate-result.json"
```
Baseline (`results/2026-09-28T11-06-31-644Z`): 7 scored cases 1.0; `url-bare` 0.4
(diagnostic: investigate fires 3/3, `evals/evals-triggers/README.md:24-27`); $3.92; 185 s.
Noise: 3 consecutive sweeps 24/24 consistent (`.ambicode/task/ambicode-refactor/notes.md:55-58`).
**Signal rule:** any scored case < 1.0 in ≥ 2 of 3 runs = regression; in 1 of 3 = rerun once,
then regression if it repeats. Runs only when a SKILL.md `description` or the hook changed,
and at every checkpoint.

### T2 curated benchmark sweep

LLM-judged, NDA data; ≈ $19 and ≈ 17 min per run/arm.

```
node evals/scripts/src/evals-bench.mjs select
node evals/scripts/src/evals-bench.mjs run --runs 3 --ablation with-without -j 4 --model claude-opus-5-5
J=$(ls -t evals/evals-core/results/eval-*.json | head -1)
npm run evals:score -- "$J"          # localize/{with,without}: precision, recall, f1, helper-ran; review/{with,without}: recall, raised, helper-ran; costUsd, turns
jq -c '{costUsd, durationSeconds, partial, claudeVersion}' "$J"
grep -ho '"model":"[^"]*"' evals/evals-core/results/traces/*.jsonl | sort | uniq -c   # the agent model actually used
```
`--model` is an ASSUMPTION-free addition: `claude plugin eval --model` exists (help text)
and the harness forwards extra arguments (`evals-bench.mjs:600`); the three baseline sweeps
ran unpinned and their traces record `claude-opus-5-5`. Never run `claude plugin eval` on
`evals/evals-core` by hand: it publishes NDA prompts (`evals/evals-core/README.md:41-47`).

Baseline, 1 run/arm (`npm run evals:score` on the three result files):

| Sweep | plugin | localize F1 with / without | review recall with / without | helper-ran localize / review (with) | cost | s |
|---|---|---|---|---|---|---|
| 11-55 | 0.3.2 | 0.655 / 0.648 | 0.094 / 0.188 | 9 / 0 | $17.99 | 1,004 |
| 13-30 | 0.3.2 | 0.637 / 0.654 | 0.094 / 0.250 | 9 / 0 | $20.00 | 1,037 |
| 16-18 | 0.3.3 | 0.694 / 0.630 | 0.094 / 0.156 | 10 / 0 | $18.78 | 987 |

Noise, from the two same-version sweeps: with-arm F1 Δ 0.018, without-arm Δ 0.006;
review without-arm recall Δ 0.06 (one thread of 19 = 0.053); per-case single-run swing up
to 0.5 F1 (`be-vs-5928`). A 3-run/arm baseline is **TBD: captured in iteration 0** (§6).
**Signal rules** (medians over ≥ 3 runs/arm; 1-run sweeps are screening only, never accept/reject):
- localize with-arm F1 real change: |Δ| ≥ 0.05 **and** without-arm within ±0.03 of its baseline (the without-arm is the model-drift control, [05 §3](05-anti-hallucination.md#3-cross-checks)).
- review with-arm recall real change: |Δ| ≥ 0.105 (two threads of 19).
- `helper-ran` is a count out of 10 (localize) or 8 (review); a change of ≥ 2 is real.
- Cost per run with-arm: report; a rise > 25 % over baseline ($0.48 localize, $0.66 review) is a reject unless the WP brief predicted it.

### T3 reviewer recordings

The real reviewer; $0.33–0.67 and 2–13 min per case.

```
npm run evals:record -- --exclude 'main/assets/i18n/**' 2>&1 | tee gym/runs/<campaign>/it-NNN/scratch/record.log
jq -c '.recordings[] | {case, snapshotId, recordedFrom, findings: (.output.findings | length)}' benchmarks/reviewer-recordings.json
grep -E '^(be|fe)-vs' gym/runs/<campaign>/it-NNN/scratch/record.log      # "ok, N finding(s), … $C, S s" or "REFUSED — …"
```
Baseline: 5/8 recorded (BE 3571, 5075, 5546, 6261; FE 6253), findings 4/4/6/1/6, cost
$0.33–0.67, 126–772 s (`cache/record-2.log`); 3 FE cases refused `snapshot-too-large`
(i18n bundles 325–367 KB > 262,144). Noise: between record-1 and record-2 the same case
moved 6 → 4 findings (be-vs-3571), cost ±15 %, duration up to 2.2×. **Signal rule:** 3
recordings per case; compare medians of findings count; a difference of ≥ 2 findings is
real. Human-thread recall of recordings is Q3 in [00 §6](00-audit.md#6-open-questions).
Re-record after any change to `prompts/`, `policies/`, `src/review/` (README `evals-core:104-106`).

### T4 real-session metrics

Human-run cycles; a script over the transcripts.

Computed by `gym/runs/<campaign>/tools/transcript-metrics.py` (written in iteration 0 from the
verifier's scripts S1–S12 recorded in [00 §4](00-audit.md#4-vs-6735-cycle-claims)) over the
session JSONL files under `~/.claude/projects/<repo-slug>/`. One cycle = one investigate +
one plan + the task sessions for one ticket. Baseline = the VS-6735 cycle (n = 1).

| Metric | How | Baseline | Target after |
|---|---|---|---|
| shortlist recall@10 with caller terms / auto-derived | `prepare` calls in Bash inputs vs `git diff --name-only <base> <head>` | 0.15–0.26 / 0.03–0.06 (2/59, 2/34) | WP6: auto-derived ≥ 0.10 or the fallback refused |
| fabricated provenance fields per session | `retrievedAt` in `--evidence` heredocs vs first MCP fetch timestamp | 4 of 4 sessions | WP2: 0 |
| MCP-server questions per cycle | `AskUserQuestion` text matching "MCP server" | 3 of 4 sessions | WP2: 0 after the first answer |
| requirement re-fetches per cycle | `getJiraIssue` calls | 15 for 4 keys | WP2: ≤ 4 + 1 per changed ticket |
| review launches refused per task session | `snapshot-too-large` in tool results | 1 per session (2/2) | WP2: 0 |
| reviewer turns / cost per completed review | `result.json .reviewer.usage` | 14 / 3 / 2 turns; $1.11 / $0.40 / $0.33 | WP3: tool calls recorded; 0-file-read reviews flagged |
| findings about later plan iterations | human label ([02 §6](02-loop-protocol.md#6-label-queue)) | 4 of 6 | WP4: 0 of N |
| self-run checks per task session (tsc / vitest / eslint) | Bash inputs | 1 / 0 / 0 | report only |
| LSP calls / correct answers | `tool_use.name == "LSP"` | 1 / 0 | report only (Q7) |
| human questions / human-wait | `AskUserQuestion` round-trips | 1,5,1,1 / 8,539,4,36 s | report only |

No noise estimate exists (n = 1). **Rule:** a T4 target counts as met only on ≥ 2 human-run
cycles; until then it is "observed", not "achieved".

## 4. Work packages

Each WP names its seam (from [00 §2](00-audit.md#2-code-claims)), the metric it claims to move,
and the metric that must not move. A WP is one or more iterations ([02](02-loop-protocol.md)).

| WP | Change | Seam | Claims to move | Must not move |
|---|---|---|---|---|
| WP0 harness parity and state | archive volatile inputs ([06 §5](06-data-and-state.md#5-volatile-inputs-to-archive-before-iteration-1)); pin `--model`; record `models.agent`; write `transcript-metrics.py`; capture 3-run T2 baseline | `evals-bench.mjs:600` (add `--model`); `gym/runs/` | none (it creates the baselines) | G1–G3 |
| WP1 evals as steering wheel | record 8/8 with `--exclude`; make the review with-arm run the pipeline (the case prompt says "Do not edit anything." at `evals/evals-core/cases/*-review-*/prompt.md:24`, and agents treat `.ambicode/reviews/` writes as edits: `helper-ran` 0/8); queue the 6 local findings for labels | `skills/review/SKILL.md` wording about `.ambicode/reviews/` being a saved result, or the case prompt template `evals-bench.mjs:250-258` (harness fix, recorded as such) | T2 review `helper-ran` 0 → ≥ 6; T3 5 → 8 | T2 localize F1; T1 |
| WP2 requirements envelope | pin `requirements.mcpServer` after the first answer; CLI records when the envelope was received (`receivedAt`, never a fabricated `retrievedAt`); pre-flight per-file size check in `prepare` for given paths and `git status` paths; cache fetched sources per `updatedAt` **only where a command already writes** (`prepare` promises "nothing is written", `ambicode --help`) | `src/requirements/normalize.ts:16-17`; `src/contracts/requirements.ts:11`; `src/cli/commands/prepare.ts:446-454`; `src/snapshot/snapshot.ts:56-87`; `skills/shared/requirements-mcp.md` | T4 fabricated 4/4 → 0; refusals → 0; questions → 0 | T2 (control); G1 tests +N |
| WP3 reviewer tool record and effort floor | first an investigation: what the `--output-format json` envelope carries (`src/review/claude-reviewer.ts:412-425`); then extend `ReviewerUsage` (`src/contracts/review.ts:108-114`), report tool calls, mark a review whose reviewer read no file as `partial` with a reason | `claude-reviewer.ts`, `contracts/review.ts`, `src/review/report.ts` | T4 reviewer turns/tool record present; T3 findings on 0-turn reviews | T3 median findings; T2 |
| WP4 iteration-scope-aware review | `--task <slug> --iteration <n>` reads the accepted plan's iteration heading (Goal / Leaves out / Accept) into the scope section | `src/cli/target-option.ts:26`; `src/review/bundle.ts:202-212`; `src/review/prompt.ts:134-150`; `skills/task/SKILL.md:96-97` | T4 later-iteration findings 4/6 → 0 (replay on the 3 archived VS-6735 reviews) | T3; T2 |
| WP5 `related` selector from snapshot | investigation first: whether vitest can enumerate inside the snapshot | `src/checks/adapters.ts:90`; `src/checks/select.ts:195-266` | limitation line disappears; selected specs ⊆ change-related | G1 |
| WP6 shortlist fallback and limit | word-frequency fallback becomes a top-level notice, or refuses without terms; add `--limit` to `prepare` (does not exist: `prepare.ts:40-44`, fixed 10 at `locate.ts:18`) | `prepare.ts:312-330`; `locate.ts:18,431` | T2 localize F1 / `helper-ran`; T4 recall@10 | T2 review; cost |
| WP7 team packs from review history | `audit-mrs.mjs` threads → candidate `team` pack via the `rules` skill; needs human approval of content | `benchmarks/audit-mrs.mjs`; `skills/rules/SKILL.md`; `policies/` | T2 review recall with-arm; `ruleRefs` | T2 localize; cost |

Order: WP0 → WP1 → WP2 → WP3 → WP4 (cycle 1); WP5–WP7 after replan. Retired: prose-only
skill edits and LSP prose (items 1–2), "drop uncited rules" (item 8, premise contradicted).

## 5. Cost and time per iteration

| Step | Cost | Wall |
|---|---|---|
| G1 + G2 + G3 | $0 | ≈ 1 min |
| T1 | ≈ $4 | ≈ 3 min |
| T2 screening (1 run/arm) | ≈ $19 | ≈ 17 min |
| T2 decision (3 runs/arm) | ≈ $57 | ≈ 50 min |
| T3 re-record 8 cases | ≈ $4–6 | ≈ 15 min at `-j 4` |
| preflight (`npm run evals:preflight`, before any T2) | $0.4–0.7, ceiling $1.5 | ≈ 2 min |
| Iteration with a T2 decision | ≈ $65–70 | ≈ 75 min |

Campaign budget ceiling: **TBD: the owner's usage plan** (A1). Default written into
`CAMPAIGN.md` at iteration 0 if the owner sets none: $500, i.e. ≈ 7 decision iterations.
The lead stops at 90 % of the ceiling ([03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate)).

## 6. Iteration 0 must produce

- `baseline/metrics.json` with G1–G3, T1 (1 sweep), T2 (3 runs/arm, pinned model), T3 (current 5), T4 (VS-6735 cycle, from the script).
- The 3-run T2 numbers replace the 1-run rows above as the reference for every later decision; the lead writes them into `baseline/metrics.json`, never into this file ([09 §1](09-replan.md)).

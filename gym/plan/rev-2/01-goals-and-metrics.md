# 01 — Goals and metrics

Supersedes: gym/plan/01-goals-and-metrics.md @ a7feb66fef5cf1d2ecff7ba3aee4eb57e6e8f217c64abc2a21bd7f1e81c9ca5f (replan R-2; R-1's Changes stay below, R-2's follow them)

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
3. T2 localize with-arm F1 (median of 3 runs/arm) not below baseline − 0.03, and review with-arm `helper-ran` ≥ 6 of 8 runs. Measured with `--model claude-sonnet-5-5` and compared with the Sonnet baseline `baseline/metrics-R-1.json` (checkpoint cp-S0, [03 §1](03-checkpoints-and-gates.md#1-checkpoints)); never with the cp-0..cp-2 Opus numbers (§3 T2).
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

**Model pin (R-1):** T1 also runs pinned to `--model claude-sonnet-5-5`. Its reference for §1
item 2 is the one Sonnet sweep in `baseline/metrics-R-1.json`; the Opus baseline above, with its
$4 and 3 min, is history. How `npm run evals:triggers` forwards `--model` is checked in item H2
(§4) before the first Sonnet run: TBD: set from that check, applies from the first Sonnet T1.

### T2 curated benchmark sweep

LLM-judged, NDA data; ≈ $19 and ≈ 17 min per run/arm (Opus, history; Sonnet: TBD, measured in H2).

```
node evals/scripts/src/evals-bench.mjs select
node evals/scripts/src/evals-bench.mjs run --runs 3 --ablation with-without -j 4 --model claude-sonnet-5-5
J=$(ls -t evals/evals-core/results/eval-*.json | head -1)
npm run evals:score -- "$J"          # localize/{with,without}: precision, recall, f1, helper-ran; review/{with,without}: recall, raised, helper-ran; costUsd, turns
jq -c '{costUsd, durationSeconds, partial, claudeVersion}' "$J"
grep -ho '"model":"[^"]*"' evals/evals-core/results/traces/*.jsonl | sort | uniq -c   # the agent model actually used
```
`--model` is an ASSUMPTION-free addition: `claude plugin eval --model` exists (help text)
and the harness forwards extra arguments (`evals-bench.mjs:600`); the three baseline sweeps
ran unpinned and their traces record `claude-opus-5-5`. Never run `claude plugin eval` on
`evals/evals-core` by hand: it publishes NDA prompts (`evals/evals-core/README.md:41-47`).

**Model and references (R-1):** every eval suite the campaign runs uses `--model claude-sonnet-5-5`.
The reference for every decision is the Sonnet baseline `baseline/metrics-R-1.json` (checkpoint
cp-S0, [03 §1](03-checkpoints-and-gates.md#1-checkpoints)). The cp-0..cp-2 numbers are Opus, history,
and are never compared with Sonnet numbers. The thresholds below (0.05, 0.03, 0.105, `helper-ran`
≥ 2, cost 25 %) are unchanged but provisional on Sonnet until re-derived from cp-S0's 3-run/arm
spread ([09 §2 step 3](09-replan.md#2-procedure)); a re-derived value applies from the iteration
after it is written ([09 §4](09-replan.md#4-what-a-replan-may-not-do)). The dollar figures in the
cost bullet ($0.48 localize, $0.66 review) are Opus, history; the Sonnet figures are TBD: set from
H2's 3-run/arm cost, and the 25 % rule reads them from `baseline/metrics-R-1.json` once written.

Baseline (Opus, history), 1 run/arm (`npm run evals:score` on the three result files):

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
moved 6 → 4 findings (be-vs-3571), cost ±15 %, duration up to 2.2×. **Signal rule (R-1):** 3
recordings per case, every run kept (item H1, §4; the keep-runs option is added to the command
above). The rule "compare medians of findings count; a difference of ≥ 2 findings is real" is
withdrawn as a control: findings counts are still reported per case (median of 3) and per run,
but decide nothing. Noise evidence, `gym/runs/R1/it-003/scratch/t3-same-day-ab.txt` (same day,
byte-identical reviewer prompts, 3 recordings per side, 24 recordings, $2.42): within-set ranges
(max − min of the 3 counts) over the 8 cases are base 3, 1, 3, 1, 2, 2, 1, 2 and it-003 6, 2, 1, 2,
1, 2, 1, 2; be-vs-3571 (base 3,3,6 → it-003 7,6,1) and fe-vs-6086-d1f112e5 (base 4,2,2 → it-003
5,4,5) moved +3 in the median on byte-identical prompts.

**T3 medium-and-above stability** replaces the count as the T3 metric. Per case, over its k = 3
runs: key = the finding's file path (`location.newPath ?? location.oldPath`), restricted to
findings with `risk` in {medium, high}; stability = (number of keys present in ≥ 2 of the 3
runs) / (number of distinct keys over all 3 runs); `null` when the case has no medium-and-above
finding in any run. The path is the key because `category` is free text in the recordings (both
"comment placement" and "comment-placement" occur). Also recorded: the per-run count of
medium-and-above findings. `metrics.json.T3` carries the stability per case, the counts, the md5
of `reviewer-system-prompt.md` and the `policies/` tree hash ([05 §3](05-anti-hallucination.md#3-cross-checks)).

Stability is **reported only** until an A/A on the it-003 build (two independent 3-run sets on
the same build, item H2) gives a floor: floor := the lowest per-case stability observed between
the A/A sets. The floor is applied as a control from the iteration after it is written, not
retroactively; until then T3 decides nothing. TBD: set from the A/A in item H2.

Human-thread recall of recordings is Q3 in [00 §6](00-audit.md#6-open-questions).
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

**T4p, the automated proxy (R-1).** The table above stays the definition of the metrics. T4p
measures the same events without a human cycle: a new tracked synthetic suite (like
`evals/evals-triggers`, materialized from fixtures with `fixtures/materialize.mjs`, with a stub
requirements MCP server) runs headless investigate / plan / task sessions through the eval harness
(the lead may not run `claude` itself) and scores them with `tools/transcript-metrics.py` or
structural graders over the eval traces:
- fabricated provenance fields (`retrievedAt` in `--evidence` heredocs);
- refused review launches (`snapshot-too-large`);
- MCP-server questions (`AskUserQuestion` matching "MCP server");
- for WP3, the reviewer's turns and the upper-bound flag.

**Feasibility is unproven.** Whether the harness can carry a stub MCP server, and whether
`transcript-metrics.py` parses eval traces, is item H3's investigation (§4); until it passes, T4p
is `null`, never assumed. T4p target: 0 in 3 of 3 runs per case. The rule above stays for the
human T4; T4p results are "observed by proxy". The human cycle (L-010) becomes ONE confirmation at
cycle-1 exit (cp-5), not a per-WP gate.

## 4. Work packages

Each WP names its seam (from [00 §2](00-audit.md#2-code-claims)), the metric it claims to move,
and the metric that must not move. A WP is one or more iterations ([02](02-loop-protocol.md)).

| WP | Change | Seam | Claims to move | Must not move |
|---|---|---|---|---|
| WP0 harness parity and state | archive volatile inputs ([06 §5](06-data-and-state.md#5-volatile-inputs-to-archive-before-iteration-1)); pin `--model`; record `models.agent`; write `transcript-metrics.py`; capture 3-run T2 baseline | `evals-bench.mjs:600` (add `--model`); `gym/runs/` | none (it creates the baselines) | G1–G3 |
| WP1 evals as steering wheel | record 8/8 with `--exclude`; make the review with-arm run the pipeline (the case prompt says "Do not edit anything." at `evals/evals-core/cases/*-review-*/prompt.md:24`, and agents treat `.ambicode/reviews/` writes as edits: `helper-ran` 0/8); queue the 6 local findings for labels | `skills/review/SKILL.md` wording about `.ambicode/reviews/` being a saved result, or the case prompt template `evals-bench.mjs:250-258` (harness fix, recorded as such) | T2 review `helper-ran` 0 → ≥ 6; T3 5 → 8 | T2 localize F1; T1 |
| WP2 requirements envelope | pin `requirements.mcpServer` after the first answer; CLI records when the envelope was received (`receivedAt`, never a fabricated `retrievedAt`); pre-flight per-file size check in `prepare` for given paths and `git status` paths; cache fetched sources per `updatedAt` **only where a command already writes** (`prepare` promises "nothing is written", `ambicode --help`) | `src/requirements/normalize.ts:16-17`; `src/contracts/requirements.ts:11`; `src/cli/commands/prepare.ts:446-454`; `src/snapshot/snapshot.ts:56-87`; `skills/shared/requirements-mcp.md` | T4 fabricated 4/4 → 0; refusals → 0; questions → 0 | T2 (control); G1 tests +N |
| WPH measurement changes (from R-1) | H1 recorder keeps every run: a keep-runs option beside the existing options (`-j`, `--exclude`) in the recorder; runs go to `it-NNN/scratch` (gitignored: they hold NDA output); plus a stability summary and a per-case usage sidecar (`turns`, `costUsd`; this is also WP3's option D). H2 Sonnet baseline on `gym/R1/it-003`, split by R-2: H2-measure (done in it-006: the `--model` check, T1 once, T3 A/A of two 3-run sets; stored in `baseline/metrics-R-1.json` with T2 null); H2-repair (L-013: the prompt of `p2-task-regression-fix` asks for the change with "implement the fix"; on Sonnet its `unit-check-ran` is a NOTE, not a gate; `plugin-fired` and `helper-ran` stay required; if the preflight still fails, stop and report); then H2-T2 (T2 at 3 runs/arm added to `baseline/metrics-R-1.json`, tag `gym/R1/cp-S0`). The repaired case is in the archived suite only (0 hits in `evals/evals-core/cases` and `selection.json`), so the Opus T2 history is unaffected by its prompt change. H3 T4p investigation first (B6-type, $0 eval), then build only if feasible | `evals/scripts/src/evals-record-core.mjs` (H1); `evals-bench.mjs`, `package.json` `evals:*` scripts only where H2's check finds a `--model` gap; `fixtures/`, `tools/transcript-metrics.py` and a new suite beside `evals/evals-triggers` (H3; the brief names the new directory, it is outside 02 §3.3's list); `evals/scripts/src/evals-preflight.mjs` and its test, and `evals/evals-archived/typescript/p2-task-regression-fix/prompt.md` (H2-repair; the prompt is outside 02 §3.3's list, allowed by R-2) | none for T1–T3 (H2 creates `baseline/metrics-R-1.json`); H1: per-run findings, stability and the sidecar exist; H3: T4p exists, or is recorded infeasible with its evidence; H2-repair: `judge` unit tests (on Sonnet `unit-check-ran` is a NOTE, on Opus it still fails the gate, `plugin-fired` and `helper-ran` still fail the gate on both) and one Sonnet preflight that passes | G1–G3 |
| WP3 reviewer tool record and effort floor | item 1, the investigation of what the `--output-format json` envelope carries (`src/review/claude-reviewer.ts:412-425`), is done in it-004 (accepted, `gym/R1/it-004`); item 2 = option B: extend `ReviewerUsage` (`src/contracts/review.ts:108-114`) with an upper bound from `num_turns`: a review with turns ≤ 2 is flagged `partial` with a reason worded "at most one tool call, the answer itself", turns null reads as unknown; plus option D (the recorder usage sidecar of H1); option A (stream-json) only after one budgeted real capture | `claude-reviewer.ts`, `contracts/review.ts`, `src/review/report.ts`, `evals-record-core.mjs` (D) | a synthetic ≤ 2-turn review is flagged `partial` in a unit test; the recorder sidecar exists | T2 screening; T3 stability (reported) |
| WP4 iteration-scope-aware review | `--task <slug> --iteration <n>` reads the accepted plan's iteration heading (Goal / Leaves out / Accept) into the scope section | `src/cli/target-option.ts:26`; `src/review/bundle.ts:202-212`; `src/review/prompt.ts:134-150`; `skills/task/SKILL.md:96-97` | T4 later-iteration findings 4/6 → 0 (replay on the 3 archived VS-6735 reviews) | T3 stability; T2 |
| WP5 `related` selector from snapshot | investigation first: whether vitest can enumerate inside the snapshot | `src/checks/adapters.ts:90`; `src/checks/select.ts:195-266` | limitation line disappears; selected specs ⊆ change-related | G1 |
| WP6 shortlist fallback and limit | word-frequency fallback becomes a top-level notice, or refuses without terms; add `--limit` to `prepare` (does not exist: `prepare.ts:40-44`, fixed 10 at `locate.ts:18`) | `prepare.ts:312-330`; `locate.ts:18,431` | T2 localize F1 / `helper-ran`; T4 recall@10 | T2 review; cost |
| WP7 team packs from review history | `audit-mrs.mjs` threads → candidate `team` pack via the `rules` skill; needs human approval of content | `benchmarks/audit-mrs.mjs`; `skills/rules/SKILL.md`; `policies/` | T2 review recall with-arm; `ruleRefs` | T2 localize; cost |

WP2 was accepted on gates plus its reproducing tests (L-011 b), not on a human cycle.

Order: WP0 → WP1 → WP2 → WPH → WP3 → WP4 (cycle 1); WP5–WP7 after replan. Retired: prose-only
skill edits and LSP prose (items 1–2), "drop uncited rules" (item 8, premise contradicted).

## 5. Cost and time per iteration

| Step | Cost | Wall |
|---|---|---|
| G1 + G2 + G3 | $0 | ≈ 1 min |
| T1 | ≈ $4 (Opus, history; Sonnet TBD: measured in H2) | ≈ 3 min |
| T2 screening (1 run/arm), once per iteration that has a T2 control | ≈ $19 (Opus, history; Sonnet TBD: measured in H2) | ≈ 17 min (Opus, history) |
| T2 decision (3 runs/arm), at checkpoints only | ≈ $57 (Opus, history; Sonnet TBD: measured in H2) | ≈ 50 min (Opus, history) |
| T3 re-record 8 cases | ≈ $4–6 | ≈ 15 min at `-j 4` |
| preflight (`npm run evals:preflight`, before any T2) | $0.4–0.7, ceiling $1.5 (Opus, history) | ≈ 2 min |
| Iteration with a T2 decision | ≈ $65–70 (Opus, history) | ≈ 75 min (Opus, history) |

The owner's estimate is that an Opus run costs about $0.45–0.80, mostly in cache writes
(owner-directive-1); the Sonnet cost per run and per step is TBD: measured in H2, applies from
`baseline/metrics-R-1.json`.

Campaign budget ceiling: **$400**, the lead stops at 90 % = $360 ([03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate));
budget checkpoints at $200 and $300 (L-012 a). Historic note: before L-012 a the ceiling was
**TBD: the owner's usage plan** (A1) with a default of $500, i.e. ≈ 7 decision iterations; that
default no longer applies.

## 6. Iteration 0 must produce

- `baseline/metrics.json` with G1–G3, T1 (1 sweep), T2 (3 runs/arm, pinned model), T3 (current 5), T4 (VS-6735 cycle, from the script).
- The 3-run T2 numbers replace the 1-run rows above as the reference for every later decision; the lead writes them into `baseline/metrics.json`, never into this file ([09 §1](09-replan.md)).
- R-1: H2 (§4) produces `baseline/metrics-R-1.json` (Sonnet: T1 once, T2 3 runs/arm, T3 A/A); it is never merged into `baseline/metrics.json` ([09 §3](09-replan.md#3-superseding-without-losing-history)).

## Changes

- §1 item 3: "T2 localize with-arm F1 ... `helper-ran` ≥ 6 of 8 runs." -> the same thresholds, measured with `--model claude-sonnet-5-5` and compared with `baseline/metrics-R-1.json` (cp-S0), never with cp-0..cp-2 Opus numbers. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3 T1: (none; the baseline and the signal rule are unchanged) -> new "Model pin" paragraph: T1 runs pinned to `claude-sonnet-5-5`, Sonnet reference in `baseline/metrics-R-1.json`, `$4`/`3 min` are Opus history, how `evals:triggers` forwards `--model` is TBD from H2's check. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3 T2 heading cost "≈ $19 and ≈ 17 min per run/arm" -> the same figures labelled "Opus, history", Sonnet TBD from H2. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3 T2 command `--model claude-opus-5-5` -> `--model claude-sonnet-5-5`. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3 T2 references and thresholds: "Baseline, 1 run/arm" (unlabelled, and no statement on which baseline decisions use) -> "Baseline (Opus, history)"; new "Model and references" paragraph: decisions compare with `baseline/metrics-R-1.json`; thresholds 0.05, 0.03, 0.105, `helper-ran` ≥ 2, cost 25 % unchanged but provisional on Sonnet until re-derived from cp-S0's 3-run/arm spread (09 §2 step 3), a re-derived value applies from the iteration after it is written; the $0.48 / $0.66 figures are Opus history, Sonnet TBD from H2. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §3 T3 signal rule: "3 recordings per case; compare medians of findings count; a difference of ≥ 2 findings is real" -> the count rule is withdrawn as a control (counts still reported per case, median of 3, and per run); noise evidence: `gym/runs/R1/it-003/scratch/t3-same-day-ab.txt` (within-set ranges base 3,1,3,1,2,2,1,2; it-003 6,2,1,2,1,2,1,2; +3 on be-vs-3571 and fe-vs-6086-d1f112e5 on byte-identical prompts). Evidence: `labels.json` L-011 a, 2026-09-29T09:14:36.733Z.
- §3 T3 new metric: (none) -> medium-and-above stability per case over 3 runs (key = `location.newPath ?? location.oldPath`, `risk` in {medium, high}; stability = keys in ≥ 2 of 3 runs / distinct keys; `null` without a medium+ finding), per-run medium+ counts, `metrics.json.T3` carries the md5 of the reviewer system prompt and the policies tree hash. Evidence: `labels.json` L-011 a, 2026-09-29T09:14:36.733Z.
- §3 T3 floor: (none) -> stability is reported only until an A/A on the it-003 build gives floor := lowest per-case stability observed between the A/A sets; the floor is a control from the iteration after it is written, not retroactively. Evidence: `labels.json` L-011 a, 2026-09-29T09:14:36.733Z.
- §3 T4: (only the human T4) -> the human T4 table stays the definition; new T4p automated proxy (tracked synthetic suite via `fixtures/materialize.mjs` with a stub requirements MCP server, headless sessions through the eval harness, scored by `tools/transcript-metrics.py` or structural graders: fabricated provenance, refused review launches, MCP-server questions, for WP3 reviewer turns and the upper-bound flag), `null` until H3 shows it feasible, target 0 in 3 of 3 runs per case, results "observed by proxy"; the "≥ 2 human-run cycles" rule stays for the human T4; the human cycle (L-010) becomes one confirmation at cp-5, not a per-WP gate. Evidence: `labels.json` L-011 b, 2026-09-29T09:14:36.733Z.
- §4 new row WPH (H1 recorder keeps every run and adds a stability summary and usage sidecar, H2 Sonnet baseline and cp-S0, H3 T4p investigation) and order "WP0 → WP1 → WP2 → WP3 → WP4" -> "WP0 → WP1 → WP2 → WPH → WP3 → WP4". Evidence: `labels.json` L-011 a, L-011 b, owner-directive-1 (2026-09-29T09:14:36.733Z, 2026-09-29T09:23:24.943Z).
- §4 WP3 row: "first an investigation ...; then extend `ReviewerUsage`, report tool calls, mark a review whose reviewer read no file as `partial`"; claims "T4 reviewer turns/tool record present; T3 findings on 0-turn reviews"; must-not-move "T3 median findings; T2" -> item 1 done in it-004 (accepted, `gym/R1/it-004`); item 2 = option B (upper bound from `num_turns`, turns ≤ 2 flagged `partial` with reason "at most one tool call, the answer itself", turns null reads as unknown) plus option D, option A only after one budgeted real capture; claims "a synthetic ≤ 2-turn review is flagged `partial` in a unit test; the recorder sidecar exists"; must-not-move "T2 screening; T3 stability (reported)". Evidence: `gym/runs/R1/it-004/decision.md`.
- §4 WP4 must-not-move: "T3; T2" -> "T3 stability; T2". Evidence: `labels.json` L-011 a, 2026-09-29T09:14:36.733Z.
- §4 note under the table: (none) -> "WP2 was accepted on gates plus its reproducing tests (L-011 b), not on a human cycle". Evidence: `labels.json` L-011 b, 2026-09-29T09:14:36.733Z.
- §5 cost table: T2 screening "≈ $19" / T2 decision "≈ $57" / iteration with a T2 decision "≈ $65–70" (unlabelled) -> the same Opus figures labelled "Opus, history", Sonnet TBD from H2; T2 screening once per iteration that has a T2 control, T2 decision at checkpoints only; T1 and preflight figures also labelled Opus history. Evidence: `labels.json` L-011 also, owner-directive-1 (2026-09-29T09:14:36.733Z, 2026-09-29T09:23:24.943Z).
- §5 budget: "Campaign budget ceiling: TBD: the owner's usage plan (A1). Default ... $500" -> ceiling $400, stop at 90 % = $360, budget checkpoints at $200 and $300; the $500 default is a historic note. Evidence: `labels.json` L-012 a, 2026-09-29T08:54:57.804Z.
- §6: (iteration 0 unchanged) -> added bullet: H2 produces `baseline/metrics-R-1.json` and it is never merged into `baseline/metrics.json`. Evidence: `gym/plan/09-replan.md` §3 (baselines are not rewritten), `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- R-2 header: `Supersedes` names the R-1 digest. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §4 WPH row: H2 (one item: Sonnet baseline, cp-S0) -> H2-measure (done in it-006), H2-repair (L-013: case prompt names "implement", `unit-check-ran` a NOTE on Sonnet, `plugin-fired` and `helper-ran` stay required, stop and report if the preflight still fails), H2-T2 (T2 at 3 runs/arm, tag cp-S0); seam adds `evals-preflight.mjs` (+ test) and the one case prompt; claims add the `judge` tests and a passing Sonnet preflight; note that the archived case is not in the T2 set, so the Opus T2 history is unaffected. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.

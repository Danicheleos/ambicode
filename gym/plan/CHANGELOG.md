# Changelog

## R-1 (2026-09-29, trigger R7)

**01-goals-and-metrics.md**

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

**02-loop-protocol.md**

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

**03-checkpoints-and-gates.md**

- §1 new row cp-S0 (Sonnet reference, after cp-2, before cp-3): (none) -> go requires `baseline/metrics-R-1.json` complete on `gym/R1/it-003` (G1 exit 0; T1 run once with every scored case recorded; T2 3 runs/arm, `partial: false`, agent model verified from the traces as `claude-sonnet-5-5`; T3 two 3-run sets on the same build with the stability floor computed; archive verifies); any `null` or a trace showing another model -> pause, fix the harness. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §1 cp-3 go: "T3 recordings carry a tool-call record; a synthetic 0-read review is flagged `partial` in a unit test; T3 median findings per case within ±2 of cp-1" -> "T3 recordings carry a per-case usage sidecar and the upper-bound flag; a synthetic ≤ 2-turn review is flagged `partial` in a unit test; T3 stability not below the cp-S0 floor on more than 1 case (reported per case); T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0". Evidence: `labels.json` L-011 a, L-011 also, owner-directive-1 (2026-09-29T09:14:36.733Z, 2026-09-29T09:23:24.943Z); `gym/runs/R1/it-004/decision.md` (option B + D).
- §1 cp-3 no-go: "median findings drop ≥ 3 on ≥ 2 cases" -> "stability below the floor on ≥ 2 cases". Evidence: `labels.json` L-011 a, 2026-09-29T09:14:36.733Z.
- §1 cp-4 go: "T3 unchanged" -> "T3 stability not below the floor; T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0". Evidence: `labels.json` L-011 a, L-011 also, 2026-09-29T09:14:36.733Z.
- §1 cp-5 go: (no decision sweep, no human cycle) -> adds "T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0; one human cycle (L-010) confirming, or its absence stated in the handover". Evidence: `labels.json` L-011 b, L-011 also, 2026-09-29T09:14:36.733Z.
- §1 after the table: (none) -> "The cp-0..cp-2 rows stay as history (Opus). Before every checkpoint tag the lead reads the auditor's handoff for that checkpoint." The auditor sentence is lead-proposed, not an owner line. Evidence: `gym/runs/R1/it-003/handoffs/auditor.md` F3 (cp-2 was tagged before the auditor ran); the Opus note: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §2 row "iteration accept/reject": "iteration accept/reject" -> "iteration accept/reject, or provisional accept confirmed at the next checkpoint (02 §5)". Evidence: `labels.json` L-011 also, 2026-09-29T09:14:36.733Z.
- §3 S4 threshold: "moved > 0.10 from cp-0 on two sweeps" -> "moved > 0.10 from cp-0 (from cp-S0 for Sonnet sweeps: cp-S0 replaces cp-0 as the reference) on two sweeps"; the 0.10 is unchanged. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z.
- §4 push-through row 1 action: "run the 3-run decision sweep anyway" -> "record a provisional accept; the checkpoint sweep covers it". Evidence: `labels.json` L-011 also, 2026-09-29T09:14:36.733Z.

**10-supervisor.md**

- §2 table, soft limit: "soft | 300,000 tokens" -> "soft | 150,000 tokens". Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z (item 3); `gym/plan/supervisor/defaults.json` `softTokens: 150000`.
- §2 table, hard limit: "hard | 500,000 tokens" -> "hard | 200,000 tokens". Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z (item 3); `gym/plan/supervisor/defaults.json` `hardTokens: 200000`. The sentences "rolls over only at these limits" and "one 3-iteration feature session reached 313,178 tokens without compaction" stay true and are unchanged.
- §1 Defaults row: "model, limits, forbidden roots, volatile inputs" -> "model (the lead runs on `claude-sonnet-5-5`), limits, forbidden roots, volatile inputs". The file named no lead model before. Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z (item 3); `gym/plan/supervisor/defaults.json` `model: claude-sonnet-5-5`.

**README.md**

- Files table, row 10-supervisor.md: "context budget 300k/500k" -> "context budget 150k/200k". Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z (item 3).
- Revisions table: (one row, rev 0) -> added row rev 1 (2026-09-29, trigger R7: L-011, L-012, owner-directive-1; planDigest after computed by the owner after apply). Evidence: `gym/plan/09-replan.md` §3 (README keeps the Revisions table); `gym/runs/R1/replan/R-1-2026-09-29T09-30-00Z.md`.

### Not revised (stale text, owner's call)

- `04-orchestration.md:18` model "TBD: owner's choice".
- `05-anti-hallucination.md:31` "300-500k tokens".
- `USER-GUIDE.md:60` "claude-opus-5-5 ... soft 300k / hard 500k".
- 01 §1 item 6 wording about cycle 2 is unchanged.

## R-2 (2026-09-29, trigger R7)

**01-goals-and-metrics.md**

- R-2 header: `Supersedes` names the R-1 digest. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §4 WPH row: H2 (one item: Sonnet baseline, cp-S0) -> H2-measure (done in it-006), H2-repair (L-013: case prompt names "implement", `unit-check-ran` a NOTE on Sonnet, `plugin-fired` and `helper-ran` stay required, stop and report if the preflight still fails), H2-T2 (T2 at 3 runs/arm, tag cp-S0); seam adds `evals-preflight.mjs` (+ test) and the one case prompt; claims add the `judge` tests and a passing Sonnet preflight; note that the archived case is not in the T2 set, so the Opus T2 history is unaffected. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.

**02-loop-protocol.md**

- R-2 header and §3.2 template: `Supersedes` names the R-1 digest; `Plan revision: R-1` -> `Plan revision: R-2`. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §3.3: (list of allowed paths only) -> plus one named eval case file, `evals/evals-archived/typescript/p2-task-regression-fix/prompt.md`, and the rule that any other eval case file needs an owner-confirmed replan naming it. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §3.5 step 2: preflight required graders unstated in the plan -> `plugin-fired` and `helper-ran` required for both cases on every model; on Sonnet `unit-check-ran` of `p2-task-regression-fix` is a NOTE with its observed state, not gated; a preflight that still fails after the repair is a B2 stop with a label, no further grader dropped, no T2 behind it. The relaxation is data-driven (`suite.modelOverride` of the result), so Opus stays strict. Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.
- §4 table: new row for eval case files (only the file a confirmed replan names; G1 + preflight). Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.

**README.md**

- Revisions table: (rows rev 0, rev 1) -> added row rev 2 (2026-09-29, trigger R7: L-013 a+b; planDigest after computed by the owner after apply). Evidence: `labels.json` L-013, 2026-09-29T11:00:46.395Z; `gym/runs/R1/replan/R-2-2026-09-29T11-08-14Z.md`.

### Not revised (owner's call)

- The T3 floor is 0.0 (it-006 A/A, be-vs-6261), so T3 stability stays reported-only; a different floor is a threshold change (03 §2) and is not in this revision. Stale text listed under R-1 stays stale. L-013 (d) not answered: no new T1 case.

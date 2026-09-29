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

## R-3 (2026-09-29, trigger R7)

**01-goals-and-metrics.md**

- R-3 header: `Supersedes` names the R-2 digest. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z; `gym/runs/R1/replan/R-3-2026-09-29T11-59-31Z.md`.
- §4 WPH row, H2-repair: "the prompt of `p2-task-regression-fix` asks for the change with 'implement the fix'" -> the prompt names the ambicode task skill ("Find it. Use the ambicode task skill to implement the fix, and verify the fix."); `plugin-fired` and `helper-ran` stay required and test the skill's mechanics, not whether it triggers (T1's job); still-failing preflight: B2 stop with no fallback to dropping a grader or gating on `regression-ts` alone without a new owner label; after a Sonnet pass one Opus preflight; claims add "then one Opus preflight that passes"; seam note "its wording fixed by R-3". Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z; it-008 preflight 2 of 2 failed on "implement the fix" (`gym/runs/R1/it-008/decision.md`).

**02-loop-protocol.md**

- R-3 header and §3.2 template: `Supersedes` names the R-2 digest; `Plan revision: R-2` -> `Plan revision: R-3`. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z; `gym/runs/R1/replan/R-3-2026-09-29T11-59-31Z.md`.
- §3.3: the R-2 allowance for `p2-task-regression-fix/prompt.md` (wording not fixed; R-2's rationale was the verb "implement") -> the wording is fixed: "Find it, fix it, and verify the fix." becomes "Find it. Use the ambicode task skill to implement the fix, and verify the fix.", nothing else in the file changes; other eval case files still need their own confirmed replan. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z ("This wording is outside R-2's allowance (it names 'implement' only)"); it-008 preflight 2 of 2 failed on "implement the fix" (`gym/runs/R1/it-008/decision.md`).
- §3.5 step 2: (R-2 text) -> plus: the prompt names the skill, so `plugin-fired` and `helper-ran` of that case measure the skill's mechanics, never trigger evidence (T1's job); a still-failing preflight is a B2 stop that also forbids gating on `regression-ts` alone and editing the prompt again, until a new owner label; after a Sonnet pass the Opus preflight runs once before H2-T2. Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z.

**README.md**

- Revisions table: (rows rev 0, rev 1, rev 2) -> added row rev 3 (2026-09-29, trigger R7: L-015 b; planDigest after computed by the owner after apply). Evidence: `labels.json` L-015, 2026-09-29T11:58:24.482Z; `gym/runs/R1/replan/R-3-2026-09-29T11-59-31Z.md`.

### Not revised (owner's call)

- `unit-check-ran` on Sonnet stays a NOTE (L-013 a, R-2); if it passes on the first Sonnet preflight after this change, the iteration's decision says so and restoring the gate is the owner's call (03 §2). Stale text listed under R-1 stays stale; no T1 case (L-013 d default); the T3 floor is untouched.

## R-4 (2026-09-29, trigger R7)

**01-goals-and-metrics.md**

- R-4 header: `Supersedes` names the R-3 revision's digest `c2c756c67bbaf32eb70c26ccff900b8711c74e2af6b29de965411c4eed66dd64` (the `planDigest` at the start of R-4; trigger R7). Evidence: `labels.json` L-016, 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §3 T3 floor: "TBD: set from the A/A in item H2." -> "Floor (R-4, owner L-016 d): 0.3333 (1/3) on `ownStability`", a control only for a qualifying case (medium-and-above finding in at least 2 of the runs of each reference set), be-vs-6261-review-1141-f14493f1 stays reported and never a control, basis the lowest ownStability among the other 7 cases (0.3333, be-vs-3571 set 1 and fe-vs-6086-d1f112e5 set 2), raised only by the owner through a label, a control from the iteration after R-4 is applied. Evidence: `labels.json` L-016 (d), 2026-09-29T13:23:56.307Z; `baseline/metrics-R-1.json` T3.perCase; replan evidence file `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §4 WPH row: (H1, H2-measure, H2-repair, H2-T2, H3) -> plus item H4: the task sentence of `reviewPromptFile` (`evals/scripts/src/evals-bench.mjs`) "Review the change before it merges: ..." becomes "Use the ambicode review skill to review the change before it merges: ...", nothing else in that prompt changes; generated review cases regenerated by `npm run evals:select` with `selection.json` `chosen` names identical before and after; review-only Sonnet sweep (`--tag review --runs 3 --ablation with-without -j 4 --model claude-sonnet-5-5 --max-cost-usd 15`, must name 8 cases) stored as `T2review` in `baseline/metrics-R-1.json` beside `T2`, `T2` and the `cp-S0` tag untouched; the decision records prompt template vs model as the cause of with-arm helper-ran 0 of 24; with-arm helper-ran at most 2 of 24 afterwards is a B2 stop with no fallback without a new owner label; seam adds `reviewPromptFile` and `evals-bench.test.mjs`; claims add a unit test for the new sentence and for the byte-identical localize prompt, then the sweep. Evidence: `labels.json` L-016 (a), 2026-09-29T13:23:56.307Z; replan evidence file `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §4 Order line: "WP0 → WP1 → WP2 → WPH → WP3 → WP4 (cycle 1)" -> "WP0 → WP1 → WP2 → WPH (H1, H2, H3, then H4) → WP3 → WP4 (cycle 1)", plus "WP3's recorder half and cp-3 wait for H4 (R-4)". Evidence: `labels.json` L-016 (a) ("Order: this before WP3 item 2's T2 control is relied on"), 2026-09-29T13:23:56.307Z.
- §4 WPH row, H4 exit threshold: the owner's "still ~0" -> "review with-arm helper-ran at most 2 of 24" (the localize with-arm was 1 of 30). This reading of "~0" is lead-proposed, not an owner line, and needs the owner's confirmation at apply. Evidence: `labels.json` L-016 (a), 2026-09-29T13:23:56.307Z; replan evidence file `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`, question 5.

**02-loop-protocol.md**

- R-4 header and §3.2 template: `Supersedes` names the digest `c2c756c67bbaf32eb70c26ccff900b8711c74e2af6b29de965411c4eed66dd64` (the `planDigest` at the start of R-4); `Plan revision: R-3` -> `Plan revision: R-4`. Evidence: `labels.json` L-016 (a), 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §3.3: (allowances of R-2 and R-3 for `p2-task-regression-fix/prompt.md`) -> plus: the task sentence in `reviewPromptFile` (`evals/scripts/src/evals-bench.mjs`, already inside the list), its wording fixed by 01 §4 (H4), with its test in `evals/scripts/src/evals-bench.test.mjs`; the review cases under `evals/evals-core/cases` are regenerated by `npm run evals:select`, never hand-edited; `baseline/metrics-R-1.json` gains a `T2review` block. Evidence: `labels.json` L-016 (a), 2026-09-29T13:23:56.307Z ("Fix the wording in the plan text so the iteration has no discretion; name every file it may touch (02 section 3.3)"); `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §3.5 step 3: (T2 screening compared with the Sonnet baseline) -> plus: review recall of a screening or a decision sweep is compared with `T2review` of `baseline/metrics-R-1.json` once H4 is accepted; before that, and whenever the with-arm review `helper-ran` is 0, the review reading is "not measurable", never "within noise". Evidence: `labels.json` L-016 (a), 2026-09-29T13:23:56.307Z ("record it as the new review reference next to cp-S0"; review with-arm `helper-ran` 0 of 24 at cp-S0, `baseline/metrics-R-1.json` T2); `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §3.5 step 4: "T3 is not a control until the stability floor exists (01 §3)." -> "T3 stability is a control from the iteration after R-4 is applied, for qualifying cases, against the floor 0.3333 (01 §3); the findings counts stay reported." Evidence: `labels.json` L-016 (d), 2026-09-29T13:23:56.307Z ("from the iteration after R-4 cp-3 and cp-4 use it as a control"); `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.

**03-checkpoints-and-gates.md**

- R-4 header: `Supersedes` names the digest `c2c756c67bbaf32eb70c26ccff900b8711c74e2af6b29de965411c4eed66dd64` (the `planDigest` at the start of R-4; the earlier header named the R-1 digest). Evidence: `labels.json` L-016, 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §1 cp-3 go and no-go: "T3 stability not below the cp-S0 floor on more than 1 case (reported per case); T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0" / "stability below the floor on ≥ 2 cases" -> "T3 stability (`ownStability`) not below the floor 0.3333 (01 §3) on more than 1 qualifying case (reported per case, non-qualifying cases included); T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0, review recall against `T2review` (R-4)" / "stability below the floor on ≥ 2 qualifying cases". Evidence: `labels.json` L-016 (d), 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- §1 cp-4 go: "T3 stability not below the floor; T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0" -> "T3 stability (`ownStability`) not below the floor 0.3333 on qualifying cases (01 §3); T2 decision sweep 3 runs/arm on Sonnet within noise of cp-S0, review recall against `T2review` (R-4)". Evidence: `labels.json` L-016 (d), 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.

**README.md**

- Header: `Supersedes` names the digest `c2c756c67bbaf32eb70c26ccff900b8711c74e2af6b29de965411c4eed66dd64` (replan R-4; the earlier header named the R-1 digest). Evidence: `labels.json` L-016, 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.
- Revisions table: (rows rev 0, rev 1, rev 2, rev 3) -> added row rev 4 (2026-09-29, trigger R7: L-016 a and d; planDigest after computed by the owner after apply). Evidence: `labels.json` L-016, 2026-09-29T13:23:56.307Z; `gym/runs/R1/replan/R-4-2026-09-29T13-55-00Z.md`.

### Not revised (owner's call)

- L-017 (the `helper-ran` grader regex of `p2-task-regression-fix`) is not folded in and is asked separately.
- 01 §1 item 3 target text is unchanged: review with-arm helper-ran >= 6 of 8 was 0 of 8 at cp-S0; H4 measures it again.
- Stale text listed under R-1 and R-3 stays stale.
- The lead's "at most 2 of 24" reading of "still ~0" (01 §4 WPH row, H4) is lead-proposed, not an owner line, and needs the owner's confirmation at apply.

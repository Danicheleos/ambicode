# The three cases

Selection rule: significant drift on the most-drifted metrics, complete traces, no scorer or
replay artifacts, no i18n-heavy truth (10–15 locale files make fe-vs-6404/6292/438/5948/3571/6086/6141
noisy). Data: `eval-replay/evals/analysis/drift-2026-10-09/{audit.json,attempts/*.json}`, campaign
`notation` = runs 15_1241 and 16_1304 (one build, Sonnet 5.5; fe-vs-6406 is in 16_1304), campaign `17` = run 17_1451 (later build), bare = 30_2248.

| Case | Side / truth | Drift class | Why this one |
|---|---|---|---|
| **be-vs-6140-investigate** | BE-express, 3 files | precision (selection) | bare precision 1/1/1; the plugin drops it on every build. Recall 1 everywhere. All six plugin runs start with the same `read` (13,745 B) and diverge right after it. |
| **fe-vs-6406-investigate** | FE-angular, 21 files, 0 i18n | recall (scope decision) | bare recall .095 ×3, flat; the plugin flips .095 ↔ .238 in 05_0035, 16_1304, 26_1600 and 15_1241. Two of three runs never call `read`. |
| **be-vs-5973-investigate** | BE-express, 28 files | resources (bytes, cost, context) | recall steady .75–.82; agent cost $0.171 → $0.293 (72%), peak context 34k → 57k (66%), tools 5–9. Two runs use raw Bash only; one uses `read` and hits the 24 KB cut. |

Alternate/control: be-vs-5941 (recall .714 ×3, tools 5–10, cost 44%). Not chosen: be-vs-5075 (map 0
truth hits; 5 truth files unreachable from the request), fe-vs-5164 (every score ≤ .25 on bare too).

## Requests and truth

**be-vs-6140** — MO-NIOSH-12 "Support Proposals Mirroring Logic": proposal values must update when
original values are updated by Manual Override. Truth:
`src/features/score-types/niosh/{niosh.controller.spec.ts, niosh.controller.ts, niosh.service.ts}`.

**fe-vs-6406** — update `app-location-select` on Admin → Registered Users: replace the arrow with a
"Select" button as in AssessmentForm, widen the field. Truth (21, all under `main/`): ConfirmationDialog
(html/scss/ts), LocationSelectDialog (scss/ts), new-users-dialog (scss/ts), location-select component
(html/spec/ts) and its `select-location-button.directive{,.spec}.ts`, readonly-input (html/scss/ts),
edit-user-dialog (html/scss/ts), registered-users screen (html/scss/ts).

**be-vs-5973** — "Per Cycle" frequency unit for NIOSH and LM Push/Pull, Carry, Lift, Lower. Truth
(28): `ReportValidators.ts`, `est-niosh.service{,.spec}.ts`, for each lm-* feature the controller
spec, mocks, data DTO and validators, niosh (manual-override DTO, controller, controller spec,
service, validators), vlm DTO and schema, `Scoring.ts`, `UnitOfMeasure.ts`.

Full text: `evals/common/core/cases/<case>/prompt.md`, truth in `truth.json`.

## Bare reference (30_2248, agent cost from the traces)

| Case | recall r0/r1/r2 | precision | agent $ | tools | peak ctx | bare in drift band |
|---|---|---|---|---|---|---|
| be-vs-6140 | 1 / 1 / 1 | 1 / 1 / 1 | .163 / .180 / .184 | 4 / 5 / 8 | 36.4k / 38.7k / 39.6k | in |
| fe-vs-6406 | .095 ×3 | 1 ×3 | .110 / .109 / .100 | 7 / 6 / 5 | 24.3k ×3 | in |
| be-vs-5973 | .571 / .750 / .750 | .941 / .875 / .955 | .184 / .187 / .276 | 7 / 7 / 17 | 33.1k / 33.3k / 47.6k | OUT (recall, F1, cost 1.5×) |

Floors (recall ≥ bare point, precision ≥ bare − band): 6140 rec 1.0 / prec 1.0; 6406 rec .095 /
prec 1.0; 5973 rec .690 / prec .924. Band of a run = `evals:report` noise band (0.046–0.137 on past
runs). Lock: `evals/common/core/baseline.lock.json` (its `costUsd` includes judging).

Pinned plugin floors (`evals/common/core/reference.lock.json`): 6140 (05_0035) recall 1 / F1 .75;
6406 (26_1600) recall .143 / F1 .244; 5973 (26_1600) recall .810 / F1 .845.

## Plugin history per build

| Case | run | recall | precision | agent $ | tools | drift gate |
|---|---|---|---|---|---|---|
| be-vs-6140 | 05_0035 | 1/1/1 | .6/.6/.6 | .129/.136/.138 | 3/4/4 | in |
| | 15_1241 | 1/1/1 | 1/.5/.43 (R3 → .75 after the change-decision scorer fix) | .177/.195/.157 | 6/8/4 | OUT |
| | 17_1451 | 1/1/1 | .5/.6/.43 | .145/.162/.174 | 5/5/7 | OUT |
| fe-vs-6406 | 05_0035 | .238/.095/.095 | 1 ×3 | .145/.100/.107 | 5/4/4 | OUT |
| | 16_1304 | .238/.095/.095 | 1/1/.667 | .133/.106/.119 | 6/5/4 | OUT |
| | 26_1600 | .095/.095/.238 | 1 ×3 | .111/.095/.138 | 4/4/6 | OUT |
| be-vs-5973 | 05_0035 | .786/.821/.857 | .917/.821/.923 | .202/.229/.224 | 7/6/7 | in |
| | 26_1600 | .821/.786/.821 | .852/.88/.92 | .304/.232/.270 | 8/8/7 | OUT cost 1.31× |
| | 15_1241 | .75/.821/.786 | .955/.92/.88 | .171/.282/.293 | 5/9/9 | OUT cost 1.72× |

## Tool timelines (15_1241; fe-vs-6406 is from 16_1304, the same notation build; `read` = the plugin's command)

Every attempt received a byte-identical step message and map. "zsh" = `grep … --include=*.ts`
aborted with `(eval):1: no matches found` (the command chain continues, so nothing errors).

### be-vs-6140

| Run | id | sequence (class: target, bytes) | extras in `## Files` |
|---|---|---|---|
| R1 | e-VhEGk1 | T1 `read` service+override.service+dto 13,745 → T2 Grep `path:"src"` **cwd error** 97 → T3 grep **zsh** 42 → T4 Grep abs path 7,262 → T5 cat controller + sed ReportController + grep router 10,798 → T6 sed ReportHelper 120-260 + spec 4,166 | none (ReportHelper.spec "only if" stays in prose) |
| R2 | e-BK5z69 | T1 `cd … && pwd && wc -l` probe 317 → T2 `read` same 3 files 13,745 → T3 grep (zsh + controller) 861 → T4 `read` controller + **unbounded** grep → 46.8 KB **host-persisted, 2,220 B shown** → T5∥T6 Read controller 60+150 / Grep again 5,227 + 17,780 → T7∥T8 Read ReportHelper, spec 3,761 + 2,547 | niosh.service.spec.ts (never seen, "would be new"), ReportHelper.ts, ReportHelper.spec.ts ("only if") |
| R3 | e-OXdoVc | T1 `cd && read` 3 files 13,745 → T2 grep (zsh) + `read` controller 7,853 → T3 grep mapManual/MlPipelineHelper/router 6,102 → T4 `read ReportHelper.ts:120-260 niosh.controller.spec.ts:1-80` 7,461 | niosh-backup.service.ts ("I did not read it"); ReportHelper.ts, .spec, niosh.router.ts under "Files that need no change" (old scorer counted them; .43 → .75 after the fix) |
| 17 R1 | e-eOhY9L | T1∥T2 `read` 3 files / Grep count → T3 grep (zsh) → T4 `read` controller:1-215 9,659 → T5 `read ReportHelper.ts:130-260` 4,102 | backup.service (unread), ReportHelper.ts, .spec under "Possibly needed (assumption)" |
| 17 R2 | e-E8D4oE | T1 `read` 3 files → T2 Grep 7,248 → T3 `cd repo && read` **cd fails (already in repo)** 56 → T4 `read … ReportHelper.ts:130:260` **operand not found** 7,861 → T5 `read ReportHelper.ts:130-260 spec:1-60` 5,702 | ReportHelper.ts, .spec (plain entries; precision .6) |
| 17 R3 | e-k3BQtd | T1∥T2 `read` 3 files / Grep → T3–5 ∥ `read` controller / Grep ×2 → T6 `read` three `:a:b` operands **all not found** 189 → T7 same with `-` + ReportController 655-800 11,749 | backup.service (never seen), manual-override DTO, ReportHelper.ts, .spec |

Mechanism: all runs read ReportHelper; R1 keeps it as evidence, the others promote it. The extras
are files read only as evidence or unread assumptions; bare never lists them.

### fe-vs-6406

| Run | id | sequence | result |
|---|---|---|---|
| R1 | e-IdspwN | T1 `grep -rIl "app-location-select\|LocationSelect"` 2,176 (names LocationSelectDialog, new-users-dialog, directive files, edit-user-dialog.html) → T2 cat/grep 14,047 → T3 cat + grep (zsh) 2,508 → T4 grep **zsh only** 42 → T5 retry without `--include` 481 → T6 sed spec 1,691 | recall .24: proposes location-select html/ts/spec "(existing, optional)" |
| R2 | e-4YUrcy | T1 grep (zsh) 78 → T2∥T3 Grep / Glob `**/location-select/**` 1,515 + 755 → T4 cat batch 9,927 → T5 grep 748 | recall .10: "The shared component needs no changes" |
| R3 | e-WU4jXY | T1 ls + grep (zsh) 280 → T2 grep retry, still `--include=*.html` (zsh again) 1,238 → T3 `N=…; node "$N" read` 5 files 17,071 (engine receipt; the regex counter missed it) → T4 cat/grep 1,336 | recall .10: "removing the input would be out of scope"; adds the scss "only if" |

Mechanism: the same evidence, three scope decisions. ~15 truth files (ConfirmationDialog,
readonly-input, edit-user-dialog ts/scss, LocationSelectDialog scss) are never seen in any run.

### be-vs-5973

| Run | id | calls / API | `read` receipts | sequence | bytes total, peak |
|---|---|---|---|---|---|
| R1 | e-ZOoSSU | 5 / 6 | 0 | ls-files + grep (zsh) → grep -rli → cat enum + grep 8 files → sed Scoring spans + grep → sed/grep | 27,292 B, 34,040 |
| R2 | e-MG0sNP | 9 / 9 | 0 | probe (zsh) → Grep count → cat 4 EST files (zsh) → cat + grep → sed spans ∥ ls+grep (zsh) → grep (zsh) → sed → cat/sed | 58,078 B, 49,485 |
| R3 | e-Jnm86M | 9 / 7 | 3 (55,625 B served) | ls ∥ Grep → `read` **11 whole files, cut at 24,000 B** (5 truncated) → Grep 11,488 → `read` 9 spans (Scoring ×3, ReportValidators ×3, est-niosh…) 20,275 ∥ Grep → Grep ∥ Grep → `read` vlm spans + push-pull controller 7,984 | 74,830 B, 56,568 |

Mechanism: R2 is grep breadth with four zsh failures; R3 is a whole-file batch cut by the budget and
then re-read as spans. `est-niosh.service.ts` (a map lead) is seen in 3/3 and reasoned out in 3/3;
lm-lift/lm-lower controller specs are never seen; ReportHelper is promoted in 3/3.

## Running the ×5 checks

No rerun now; 15_1241 and 17_1451 are the "before". When a step says "paid check":

Runs use Sonnet 5.5 at **effort low** (user, 2026-10-09; the bare lock 30_2248 was low too):
`export CLAUDE_CODE_EFFORT_LEVEL=low` before `evals:run` (the harness has no effort flag and does
not record it; note it in the campaign report).

```
npm run build
npm run evals:select
npm run evals:run -- --case be-vs-6140-investigate --runs 5 --ablation none --model claude-sonnet-5-5 --max-cost-usd 5 -j 3
npm run evals:run -- --case fe-vs-6406-investigate --runs 5 --ablation none --model claude-sonnet-5-5 --max-cost-usd 5 -j 3
npm run evals:run -- --case be-vs-5973-investigate --runs 5 --ablation none --model claude-sonnet-5-5 --max-cost-usd 5 -j 3
```

`--case` takes one glob; there is no case list. Expected agent cost ≈ 5 × (0.18 + 0.12 + 0.25) ≈
$2.8 plus judging per campaign. Outputs: `../ambicode-evals-assets/outputs/core/<date>/<NN>_<HHMM>_…/`.
Offline afterwards: `npm run evals:report -- <dir>`, `npm run evals:gate -- <results/eval.json>
--reference evals/common/core/reference.lock.json --traces <dir>/traces`, plus the D0 drift table.

## Pass definition per case (all five repetitions)

| Check | be-vs-6140 | fe-vs-6406 | be-vs-5973 |
|---|---|---|---|
| `read` receipts | 5/5 | 5/5 | 5/5 |
| zsh glob failures, operand retries, cwd errors | 0 | 0 | 0 |
| recall ≥ bare point | ≥ 1.0 | ≥ .095 | ≥ .690 |
| precision ≥ bare − band | ≥ 1.0 − band | ≥ 1.0 − band | ≥ .924 − band |
| recall, F1 within 10% of the case best | yes | yes | yes |
| tool calls, served bytes, agent cost within 10% of the case cheapest | yes | yes | yes |
| agent cost vs bare (reported, debt row) | ≤ 1.1 × .176 | ≤ 1.1 × .107 | ≤ 1.1 × .216 |
| drift gate + case floors (reported) | — | — | — |

A blocked, open or unverified repetition fails the case. Three steady weak runs pass drift and
must still pass the floors.

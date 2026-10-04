# v1 → v2: what each review correction became

Numbering follows [../review-v1.md](../review-v1.md) §8. **Accepted** means the design text now
says the corrected thing; **accepted, changed** means the fix differs from the one proposed, with
the reason; **rejected** means not done, with the reason. Verified facts are marked.

| # | Level | Correction (short) | Resolution | Where in v2 |
|---|---|---|---|---|
| 1 | must | Pass 2 of `map` needs an index that is off | **Accepted.** Pass 2 harvests exported identifiers by regex (the `DECLARATIONS` patterns in `src/code-intelligence/dependents.ts:25-33`, verified) from the top 8 pass-1 files; the index is an optional pass-2 improvement measured against the regex harvest. | 10 §1, §2; 33 §3 |
| 2 | must | `git grep -w` does not exist in `locate` | **Accepted.** Verified: `src/git/git.ts:217-229` uses `-i -F -l`, no `-w`. v2 adds `grepWords` beside `grepFiles`. | 10 §1 L1 |
| 3 | must | No fall-through gate defaults | **Accepted.** A default is taken only with a recorded `--headless` on `route start` or `--default <gate>=<option>` on `route next`. Interactive and unanswered: the gate is re-printed twice; the third call records `default-taken {via: unanswered}` with the non-acting option, so the engine cannot wedge. | 12 §3.4, §5 |
| 4 | must | Acting defaults in init/task/review | **Accepted.** All defaults are non-acting: init writes nothing; task's review offer defaults to skip; review's estimate gate defaults to skip. Evals pass `--default` explicitly. | 20, 24, 25 |
| 5 | must | Stop hook blocks the first conversational stop | **Accepted.** The hook checks only: a stop after `route stop`; a last message carrying the report header; for note routes, the note file named by the latest `note` entry. All other stops allow. | 15 §3 |
| 6 | must | The last model step is never done | **Accepted.** A model step with `produces` is done when those kinds exist. No `route stop` on the happy path. | 12 §4 |
| 7 | must | Acceptance forgeable through `--accept` | **Accepted.** `acceptance {via: hook\|flag\|headless}`; `note save --kind plan` accepts `via: hook` always, `via: flag` only in a `--headless` route, else refuses with `plan-not-accepted`. | 12 §3, 13 §3 |
| 8 | must | Ground step fires once per MCP read | **Accepted.** The MCP hook captures the payload and records `rawHash` per read, nothing else; the ground step runs once on the model's `route next` after fetching. Ceremony counts updated (+1 `route next`). | 14 §3, 12 §3, 02 §5, 30 §1 |
| 9 | must | Who builds the envelope | **Accepted.** The hook captures raw payloads to `requirements/<key>.json`; `requirements normalize` builds the envelope from them; the model supplies `conflicts`/`resolution` via `route next --conflict`. `requirements-paraphrased` and the cross-server normalizer (P7) are dropped. A model-built envelope on `--evidence -` remains only for requirement text that arrived in the prompt (eval sandbox), labelled `via: model`. | 14 §3, §5; 32 §1 |
| 10 | must | 33 §0 incomplete | **Accepted.** Added: rewrite case prompts to typed commands; probe `UserPromptSubmit` in the sandbox; probes P2, P17, P21, P24 and LSP diagnostics push; `reuse-score.mjs` is in `stash@{0}` (verified: `git stash show --name-only stash@{0}` lists it and its test). | 33 §0 |
| 11 | must | Three investigate bars | **Accepted.** One bar everywhere: tie within the band at ≤ 1.15x and ≤ ceremony budget; investigate's expected win is stated as cost and the note that feeds plan; the quality win is claimed in plan and task. | 01 §1, 22, 33 §2 |
| 12 | must | "Kept byte-for-byte" false for five files | **Accepted.** The list names the touched seams per file. | 41 |
| 13 | must | `plan-body.md` denied by the guard | **Accepted.** Allow row added for `steps/plan-body.md` while the plan route is active. | 15 §1 |
| 14 | must | `check` repeat 3 below the happy path | **Accepted.** Repeat 5. | 12 §5 |
| 15 | must | Dedup swallows a second question | **Accepted.** Key = (slug, skill, epoch, hash(args)). A new route on the same slug records `exit {superseded}` on the open one. | 12 §2 |
| 16 | must | Fold has no session filter | **Accepted.** | 12 §4 |
| 17 | must | Ticket hook with no route | **Accepted.** No active route → the hook does nothing. | 14 §3, 30 §1 |
| 18 | must | Recorder labelled "complete" | **Accepted, changed.** Option B ships: the navigation line lists CLI calls and says "model reads not recorded". The recorder, the `tool` kind and `evidence.recordTools` are removed rather than extended to parse Bash (the structural parser would have to resolve `cat` targets; not worth it before a measurement asks). | 13 §5, 30 §1 |
| 19 | must | `refs --exact` process model contradiction | **Accepted, changed.** One child per `refs --exact` call, several symbols per call (the task route asks for all of a brief's symbols in one call), no resident process. `exactMaxFiles` counts `.ts/.tsx` files, 3,000. | 10 §3, P-list |
| 20 | must | DSL cannot express its example | **Accepted.** `when:` with a fixed vocabulary; gates only on `human` steps; the example rewritten. | 12 §1, 32 §3 |
| 21 | must | +2-turn kill at the floor | **Accepted.** Per-route ceremony budget computed from the route file; turns reported; cost ratio gated. | 33 §1, 02 §5 |
| 22 | must | Plan kill direction, cost, ACs | **Accepted.** Kill on the composite; tie on AC coverage expected; ACs hand-labelled for the 3 epics; ≈ $50–70 stated; one-process runner. | 33 §4 |
| 23 | must | Review has no kill | **Accepted.** Review's claim restated (safe publication, checked coverage, validated findings) with its measures, plus a kill for the "finder" claim. | 01 §1, 25, 33 §6 |
| 24 | should | Slim-body misquote | **Accepted.** The walk's numbers quoted. | 22 |
| 25 | should | Anchor counts misread | **Accepted.** | 23 P-list |
| 26 | should | LSP in task is passive diagnostics only | **Accepted.** Said plainly; probe added. | 24, 33 §0 |
| 27 | should | D2 sends natural-language review to the built-in | **Accepted.** Stated as the trade. | 25 |
| 28 | should | Index build in a hook, un-ignored dir | **Accepted.** Detached child; refuses unless `.ambicode/index/` is ignored. | 10 §4 |
| 29 | should | Red/green proves less than claimed | **Accepted.** `check` entries carry the runner summary; red needs ≥ 1 failing test, green ≥ 1 test run, else `limit {red-unproven}`. | 16 §2 |
| 30 | should | Context table misses variable parts | **Accepted.** Columns added; peak-context measurement scheduled. | 30 §3, 33 §7 |
| 31 | should | Dead hook rows | **Accepted.** `PostToolUse(Skill)` and `PostToolUse(Edit\|Write)` removed from the matrix (the latter returns when a pack sets `remindOnEdit`). | 30 §1 |
| 32 | should | Workers: ship runner + `plan check` only | **Accepted.** Scout, collector and the judge are an appendix "proposed after 33 §4". | 17 |
| 33 | should | Drop `wallMinutes` and `codeCalls` | **Accepted.** `wallMinutes` kept for `--headless` only. | 12 §5 |
| 34 | should | Effort total, point of no return | **Accepted.** | 41 |
| 35 | should | Task suite construction | **Accepted.** | 33 §5 |
| 36 | should | Headless chain release | **Accepted.** `task --from-draft`, recorded. | 24, 23 |
| 37 | could | Unsourced "$0.21 (n=5)" | **Accepted.** Marked as an example. | 17 |
| 38 | could | 6–7 KB vs 16 KB | **Accepted.** Labelled expected vs cap. | 02 §5 |
| 39 | could | Cite the repo's own `Stop` probe | **Accepted.** | P-list |
| 40 | could | Spawn formula | **Accepted.** 1.6 s. | 30 §1 |
| 41 | could | Skill body range | **Accepted.** | 02 §6 |

Items from the review's §4 and §6 that were not numbered corrections, also addressed: route
abandonment (`exit {superseded}` and `route stop --reason human`), which plan `task` opens
(latest accepted; `--plan <file>`; `--from-draft`), resuming iteration N (`note save --kind notes
--iteration N` writes a machine-readable header), Windows (the Bash tool runs Git Bash on Windows,
so the POSIX parser applies; stated as an assumption to verify), monorepo ambiguity at a hook-run
start (a gate whose release is `route next --project <id>`), the expansion-capped gate's headless
default (list only), the headless chain (C22), review dependents unchanged with `index: none`
(stated), M8's "0 of 12" corrected to 0 of 8.

Not changed, with reasons:

- The review suggests (§6) deleting `review --estimate`'s cost history. Kept as a one-line "no
  history" degrade: the size check is the value, the history costs nothing to print when present.
- The review suggests dropping `budget.codeCalls`. Dropped. `repeat`, same-error and
  identical-`route next` limits remain, as suggested.

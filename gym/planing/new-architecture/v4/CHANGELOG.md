# v3 → v4: the user's decisions and what each review-v3 correction became

Two inputs produced this version: six answers from the user (2026-10-04) to the open questions in
[../review-v3.md](../review-v3.md) §6, and the review's 26 corrections (#75–#100). **Accepted** means
the design text now says the corrected thing; **accepted, changed** means the fix differs from the
one proposed, with the reason; **rejected** means not done, with the reason. v3's changelog is
frozen in [../v3/CHANGELOG.md](../v3/CHANGELOG.md); the mismatches review-v3 found in it are in §C.

## A. User decisions (recorded as D14–D19 in 01 §3)

| Question | Answer | Decision | Where |
|---|---|---|---|
| 1 Revise vs `repeat` | 1a — the human's answer overrides the automatic bounds | D14: a gate-driven revise starts a new cycle and resets `repeat` on covered steps; the human is bounded by the gate's `maxRevises` (default 3), printed as "Revise (N left)"; a model `--revise` cannot consume it | 12 §1, §4, §5; 23 step 8; 32 §3; 33 §8; R15 |
| 2 `map --layers` | 2a — not for the model | D15: accepted only from a route step; the model's path is config | 10, 31 |
| 3 R13 scope | 3a — keep the generalisation | D16 | 33, R13 |
| 4 Sandbox predicate | 4a — rule in the engine, benchmark configs untouched | D17: headless `hasRequirement` only via `--requirement` | 14, 22, 24, 25, 30 §6, 33 §2 |
| 5 Python | "The plugin must be universal for any language; it describes a workflow, the target project's details are gathered at init and during work; TypeScript is used now because I can judge the results more precisely" | D18 + R16: language-agnostic by construction; ecosystem adapters detected by `init`; measurements on TypeScript, stated; Python neither non-goal nor measured | 01 §4, R16; 10 Purpose; 20 step 1; 32 §3; 33 "cannot show"; P57 |
| 6 Second baseline | "The last eval is current; no new run is needed" | D19 (supersedes D13's baseline): the naked `prompt.md` stays unchanged so the cached 2026-10-02 baseline remains the naked reference; the plugin arm gets `prompt.with.md`; the engine is judged by `evals:decide` (plugin arm, ≈ $14) against it; the single-baseline noise band is stated (P56) | 33 §0.2, §1, §2; 41 step 0; 01 §1; P56 |

## B. Review-v3 corrections

| # | Sev | Correction (short) | Resolution | Where in v4 |
|---|---|---|---|---|
| 75 | must | A human's *Revise* refused by `repeat` | **Accepted** via D14 (the review's option (a)): human cycles reset `repeat`; `maxRevises` on the gate; remaining count in the gate text; fixture "two check failures then Revise re-opens design". | 12 §4–5, 23 step 8, 32 §3, 33 §8 |
| 76 | must | `hasRequirement` true for 3 of 10 sandbox cases | **Accepted** via D17: headless → `--requirement` only. | 14, 22 step 1, 30 §6, 33 §2 |
| 77 | must | Fix round and review re-run cannot run twice | **Accepted.** `review-run` step (`repeat: 2`) whose tail evaluates findings → `onFail: revise fix` (`fix` repeat 2); `check-only-unauthorized` registry entry `onAnswer: {approve: revise $raisedBy}`; `recheck` dropped from 12 §4's example. | 24 steps 6–7, 25 step 5, 12 §3.5, §4, 32 §4, 16 §2 |
| 78 | should | Pre-answers invalidated by a revise; fixture conflict | **Accepted.** New ledger kind `preanswer`, consulted outside the evidence window, consumed into `acceptance {via: prompt}` when the gate is reached; the D11 fixture reads "before any plan-accept **acceptance**". | 12 §2.4, §4; 13 §1; 33 §8; P42 |
| 79 | should | "Resumes from the fold" contradicts the session filter | **Accepted** (adopt, not restart): `route start` from another session appends `route {resumes}` and folds over the chain; `--fresh` restarts. | 12 §2.3, §4; 30 §8; 31; P54 |
| 80 | should | Registry incomplete; `default: null` | **Accepted.** Every raised gate listed; `requirements-not-captured-twice` named; `project-ambiguous` default *stop*; a missing default fails the build. | 32 §4, 12 §3.5, 14, 15 §4 |
| 81 | should | Expansion gate fires after the reads | **Accepted.** The template says "JQL > 10 hits → stop and `route next`"; ground raises the gate before the child reads; +1 in 22's table. | 14 §2, 22 |
| 82 | should | "Ceremony turn" undefined, applied inconsistently | **Accepted.** Defined once in 12 §3.1 (ceremony = `route next`, `note save/promote`, gate asks; work = `check`, `format`, `review`, `plan check`, `policy check`, `rules apply`, `init --apply`); plan → 3 + N ceremony + 1 work; `check-only-unauthorized` rows added; 00 says "1–4 + gates". | 12 §3.1, 22–24, 02 §5, 00 |
| 83 | should | Model can choose layers | **Accepted** via D15. | 10, 31 |
| 84 | should | `check --approve` acts on a model flag | **Accepted.** Honoured only under 12 §3.4 (acceptance on record, or headless); the guard allows the command, the CLI applies the rule. | 16 §2, 12 §3.4, 15 §1, 31 |
| 85 | should | Worker proposal gate belongs to no class | **Accepted.** `plan check` is plain code with no gate; the proposal gate is declared on `worker` steps when a model worker ships; the example text moved to the appendix. | 17 §1, appendix; 23 step 7; 32 §3 |
| 86 | should | DSL cannot express free-text `onAnswer`; `repeat` defaults name non-steps | **Accepted.** `"*"` key with `$answer`; defaults name step ids (`ground 2`, `design 2`, `plan-write 3`, `draft 3`, `fix 2`, `review-run 2`); `ground: repeat: 2` shown. | 12 §1, §5; 22 step 3–3a; 32 §3 |
| 87 | should | Step-0 baseline vs a non-existent 10-case two-arm tier | **Accepted** via D19: no new baseline; the sequence is walk → `evals:decide` (26 cases, plugin arm, ≈ $14) against the cached baseline; the "$11" tier is gone. | 33 §1–2, 41 steps 0 and 3, 22 |
| 88 | should | Hook time understated; start work unquantified | **Accepted.** Typical ≈ 0.5 s, maximum ≈ 2.5 s from the matrix; both spawn figures cited (89 vs ~190 ms); start work "I'd guess 1–3 s", measured in 33 §7. | 30 §1, 12 §2.5, 33 §7 |
| 89 | should | Python absent | **Accepted, changed** via D18: not a non-goal and not a walk case — the design is language-agnostic by construction (R16) and says every measurement is on TypeScript (P57). | 01 §4, R16, 33, P57 |
| 90 | could | MCP hook spawns in every session | **Accepted.** | 14 §1, 30 §1, P53, 33 §7 |
| 91 | could | `prepare.ts:138` is not a ledger kind | **Accepted.** "Today's one kind is `note`." | 13 §1, 41 Compatibility |
| 92 | could | Replay-miss counts | **Accepted.** "10/24 and 15/24 (16 by the text's count)". | 01 §1 |
| 93 | could | 65/179 labelled logged | **Accepted.** | 10 §3 |
| 94 | could | Two ids for the conflict gate | **Accepted.** `requirements-conflicting` only. | 12 §3.3, 14 §3 |
| 95 | could | Evidence-writing list incomplete | **Accepted.** One list in 12 §3.1; 31's ⤵ mirrors it. | 12 §3.1, 31 |
| 96 | could | *Adjust* values not on record | **Accepted.** Re-print with the human's text quoted; ask *Apply as adjusted*. | 20 step 3 |
| 97 | could | Model-typed `--default` bypasses the re-prints | **Accepted.** Only in headless or with `gate.asked ≥ 1`. | 12 §3.3 |
| 98 | could | `gate.<id>.is()` window undefined | **Accepted.** "The latest answer in the step's current evidence window." | 12 §1, 32 §3 |
| 99 | could | Detectable effect assumes independence | **Accepted.** "≥ 20 pp, more if runs within a case agree." | 33 §5 |
| 100 | could | Backlog row without an entry condition; P24 in 20 | **Accepted.** "none: dropped"; P24 removed from 20. | 50, 20 |

## C. v3 CHANGELOG mismatches the review found (recorded, v3 left frozen)

- #45 "ceremony turn defined": it was not; now defined in 12 §3.1 (#82).
- #43 "iterates both": the registry listed six gates; now complete (#80).
- #42 "the fix round is a step": it was unreachable; now `review-run` → `revise fix` (#77).
- #68 "today's two kinds": one kind, `note` (#91; the reviewer's own v2 claim corrected too).
- #66 free-text `onAnswer`: DSL form was undefined; now `"*"` + `$answer` (#86).

## D. Not changed, with reasons

- The review (§5.6) read D13's "run on an explicit go" as a second approval. The user then ruled
  no new run at all (D19), so the question is moot; the harness change stays in step 0 without a spend.
- The review's scenario C counts the *Revise* round as "+3"; v4's table says +2 ceremony + 1 work,
  because `plan check` is a work command under the definition in 12 §3.1.

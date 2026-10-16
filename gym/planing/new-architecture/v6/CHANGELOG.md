# v5 → v6: the external review's six findings and the execution contract

Input: the independent external review of v5
([../../../plan/gpt-review-architecture-v5/README.md](../../../plan/gpt-review-architecture-v5/README.md),
2026-10-04, verdict **REWORK**: 2 critical, 4 high, G1–G6; its `spec-witnesses.mjs` encodes each
reading and reproduces from the v5 text) and its follow-up recommendations (one execution contract,
records bound to executions, recovery, a concurrency model, completion ≠ success, end-to-end
scenarios). Reviewed against the v5 text by the author: all six hold. No user decision was asked or
changed (D1–D19 as in v5); nothing from the backlog moved. Every item below names the contracts it
touches and the 33 §8 scenario that verifies it. v5 is frozen in [../v5/](../v5/CHANGELOG.md).

| # | Cat | Finding (short) | Resolution | Contracts touched | Verified by |
|---|---|---|---|---|---|
| G1 | critical | A model-typed `--headless` turned its own `--answer` into an acting preanswer (the mode flag carried authority) | **Accepted.** Mode and authority split: `route {mode, channel, trusted}`; `trusted` iff `channel: hook` (the user's prompt, also in `claude -p`) or `channel: harness` (per-run token, **P58**). Acting preanswers and acting `--answer` flags are honoured only in trusted routes; from `channel: cli` they are `declined {acting-needs-human}` whatever the flags. Consequence stated: the sandbox fallback start (P37(b) fails) is untrusted; review/task evals that need `estimate=run`/`review-offer=run` are conditional on P37(b) or P58. **Deviation from the proposed fix**: the reviewer asked for "an explicitly authorized external headless input"; v6 makes that concrete as the harness channel with a token and marks its feasibility unknown rather than assuming it. | 12 §2.4, §3.3, §3.4, Interfaces, P2; 13 §1 `route`/`preanswer`; 16 §2; 20 step 4; 24 step 5; 25 step 4; 30 §6; 31; 33 §0.4; 40 P58; R17 | S1, S2 |
| G2 | critical | Consent was not bound to the draft: `note promote` took the latest `plan-draft` on any `plan-accept` acceptance; two sessions could race the draft | **Accepted.** Gates may declare `object: kind{value}`; the engine prints the gate for one artifact and the answer carries `object {kind, path, contentHash}`; `note promote` (route step or typed) requires the latest `plan-accept` answer to be an honoured Accept for a hash equal to the latest draft's, promotes once (`plan-already-promoted`), refuses otherwise with a reason (`object-changed`, `superseded`), and recovers a crash between rename and entry. A second live `plan` route on one slug from another session is `route-busy` (**P59**; `plan-body.md` and drafts stay per task). **Deviation**: the reviewer offered isolating artifacts per route as an alternative; v6 chose the refusal because the one model-writable path is named by the guard row and the skill grant (#57). | 12 §2.3, §3.4, Failure modes; 13 §1 `gate`/`acceptance`, §3, Failure modes; 23 steps 1, 8, 9; 30 §8; 31; 32 §2, §3; 40 P42, P59, P60; R17 | S3, S11, S12 |
| G3 | high | "repeat of each covered step" let `plan-check`'s default 1 refuse the first `revise plan-write`; same for `plan-step` under `--revise design` and `policy check --drafts` under `revise draft` | **Accepted, changed.** The bound is the **target** step's `repeat`; covered steps re-run without consulting theirs (the reviewer's first option, raising every downstream `repeat`, would have to be repeated for every route and still leaves the rule surprising). The build validator refuses a revise target with `repeat: 1` that is not a `human` step. 23 step 7 says "3 writes and 3 checks". | 12 §1 `repeat`, §3.2.3, §4 Bounds, §5; 23 step 7; 32 §3 comment + schema rule; 41 steps 6, 9 | S4, S5 |
| G4 | high | Every route start required a config; `/ambicode:init` on a clean repository looped on `config-missing` | **Accepted.** `route start` exempts `skill: init`: repository resolution only, missing config is the normal input, unparsable → init's `config-unparsable` gate (with the backup made before regeneration); ledger under `.ambicode/task/init-<date>/`. Every other skill fails closed. | 12 §2.1, Failure modes; 20 step 1, Scenarios; 30 §8; 41 step 9 | S6 |
| G5 | high | Review could continue without the requirement it asked for: only `server-disconnected` had `policy {review: stop}`; partial coverage of several `--requirement` was undefined; a list-only `search*` hit passed as a capture | **Accepted.** `normalize` computes `missingAsked` before choosing the branch and records `asked`/`missingAsked` on the envelope; `requirements-partial` is a notice for investigate/plan/task and ⛔ `requirements-missing` (exit, sources named) for review; `policy {review: stop}` added to `requirements-server-ambiguous` and `requirements-not-captured-twice`; a list-only hit is not a capture. A quality review is an explicit start without `--requirement`. | 13 §1 `envelope`; 14 §3, Interfaces, Failure modes; 25 step 2; 32 §4; 41 steps 4, 8 | S7, S8 |
| G6 | high | A code step with empty `produces` was vacuously done; "start/advance run reachable code" did not define reachable after the fold had skipped it | **Accepted.** `step {status: completed}` is written after a code step's outputs; the fold's code line requires it (plus `produces`); 12 §8 defines the sequence (fold → prerequisites → execute the position and following code steps → record → deliver) for all five entry points. review-v5 §7's "compensated" reading is withdrawn. | 12 §3.2, §4, §8; 13 §1 `step`; 32 §2 example; 41 step 3; R18 | S9, S10 |
| C | — | Reviewer's follow-up: one algorithm, bound records, recovery, concurrency, completion ≠ success, end-to-end scenarios | **Accepted** as 12 §8 (contract + six invariants) and 33 §8's twelve scenarios S1–S12; 30 §8 gains seven week-one rows. Not done: a separate "state machine" file — the contract lives in 12 to keep the 25-file set and the per-file structure. | 12 §8; 33 §8; 30 §8; 01 R17–R18 | S1–S12 |

Not changed: review-v5 §7's other "not raised" items; review-v4 §6's items; D1–D19; 50-backlog.

**Post-approval edits, round 1 (review-v6, 2026-10-04, verdict APPROVE WITH EDITS: 0 critical, 3 high,
13 medium, #132–#148; applied in place with the reviewer's text).** #133 12 FM/S3 agree with 13 §3
(A is dead once B exists); #134 `promote` gains `onFail: revise plan-accept` (a code revise targeting
a human step, bounded by the same-error counter); #135 a model step without `produces` is completed
by its own `step {completed}` from `route next`/a command tail, re-print and re-injection are
deliveries, not advances; #136 P37(c) `claude -p`; #137 15 §1 `--approve` row; #138 23 Open problems;
#139 S4 third failure; #140 validator refuses `onFail`/`revisable` targets with `repeat: 1`; #141 "live"
= no `exit`, never age; #142 init ledger `init-<date>`, Cancel leaves that directory; #143
`requirements-missing` is a refusal of `ground`, not an `exit`; #144 `policy: {<skill>: stop}` replaces
default and release, other options still offered; #145 `gate` entries for declared gates with an
object, `object {kind, value, id, path, contentHash}`; #146 untrusted non-acting preanswers; #147
`preanswers` in traces; #148 a model-set headless mode is visible. **#132's delegation reading
("a trusted `--headless` start delegates the run's acting answers to the model's flags") was applied
and then withdrawn by round 2, C1 below.**

**Post-approval edits, round 2 (independent external review of v6,
[../../../plan/gpt-review-architecture-v6/README.md](../../../plan/gpt-review-architecture-v6/README.md),
2026-10-04, verdict APPROVE WITH EDITS after re-checking the round-1 staged text; its
`spec-witnesses.mjs` reproduces C1, C2, H1, H2 from the pre-round-1 text).** No user decision asked or
changed; no backlog item moved; no new file.

| # | Cat | Finding (short) | Resolution | Contracts touched | Verified by |
|---|---|---|---|---|---|
| C1 | critical | A trusted headless route honoured **any later** acting `via: flag` the model typed (`route next --answer review-offer=run` in a user's `claude -p` run without that answer) | **Accepted.** `trusted` is the origin of the input record, not a licence: acting answers come from a hook answer bound to a printed instance or from a preanswer the user/harness gave at a trusted start; a model-typed acting flag is `declined {acting-needs-human}` in every route, mode and channel; in headless the gate then takes its non-acting default and the report names the declined request. Commands that execute an already honoured answer ask nothing again. Supersedes #132's reading. | 12 §3.3 `--answer` row, §3.4 acting bullet, §8 Standalone, invariant 1, Interfaces, FM, P2; 13 §3 step 2; 15 §1; 16 §2; 20 step 4; 30 §6, §8; 31 `note promote`; 40 P2; R17 | S14 |
| C2 | critical | P60 bound a gate answer to the **latest** `gate` entry for the id: an *Accept* on print A, arriving after print B, took B's object and B was promoted without consent | **Accepted.** Every gate print appends a `gate` entry; its ledger id is the **instance** in the marker `[ambicode gate <id> <instance>]`; the hook binds the answer to that entry and copies its `object`; an unresolvable marker is `unbound` (not a gate answer), re-printed, never acted on; preanswers convert at the print; "latest answer wins" applies among bound answers. P60 closed. | 12 Inputs, §3.4 (marker, binding bullet, re-answer), §3.5, §4 human line, §8 step 1, FM; 13 §1 `gate`/answers rows, FM; 23 step 8; 30 §1 hook row, §8; 32 §2 example; 40 P60; R17 | S12, S13 |
| H1 | high (editorial after round 1) | 12 §8 "Records, three kinds" still described completion for code only | **Accepted.** The paragraph names the model step's own completion record (#135) and says the fold reads "produces or its own completion record" for model steps. | 12 §8 | S9 |
| H2 | high | Same-args adoption bypassed `route-busy`: two people typing one plan command shared `steps/plan-body.md`; "live" by idle age was already withdrawn (#141) but takeover did not revoke the former owner | **Accepted.** Ownership is checked **before** args: a live `plan` route from another session is `route-busy` whatever the args; the release is typed — `--adopt` (position kept; the restart after a crash), `--fresh` (restart) or `--task <slug>-2`; after a takeover the former session is refused `route-taken-over` at write time (`route next`, `note save --from`, `plan check`, `note promote`, the guard's `Write(plan-body.md)` allow). Skills owning no file keep shared adoption. Cost: one extra turn after a crash (P59). New invariant 7. | 12 §2 synopsis, §2.3, §8 What differs / Standalone / Concurrency, invariant 7, Interfaces, FM, P54, P59; 13 §3 step 1, FM; 15 §1; 23 step 1; 30 §8 (two rows); 31 `route start`; 40 P54, P59 | S11 |
| M1 | medium | Three scenario oracles contradicted the contracts: S3 (fixed in round 1, #133), S6 (`config-missing` expected **after** *Apply*), S9 (`revise ground` expected to re-run `template`, which is before the window) | **Accepted.** S6 checks `config-missing` before init and a loaded config after *Apply*; S9 keeps `template` completed under `revise ground` and re-runs it through a fixture route with `revisable: [template]`. | 33 §8 S6, S9 | S6, S9 |

**Post-approval edits, round 3 (external review, round 2:
[../../../plan/gpt-review-architecture-v6_2/README.md](../../../plan/gpt-review-architecture-v6_2/README.md),
2026-10-04, APPROVE WITH EDITS: 0 critical, 1 high, 2 medium; all three valid, applied in place).**
H3: `note promote` looked for the latest draft in the `plan-accept` window, which `revise plan-accept`
moves past the draft — the re-ask after `object-changed` could never promote; the object is now
resolved in the **producer's** (`plan-check`) current window, the consent in the gate's (12 §3.4, 13 §3
step 3, 32 §3 comment, S3). M2: `gate` = logical id, `id` = ledger entry id in every gate/answer
record (12 §3.4, §3.5; 13 §1; 23 step 8); `route.adopts?` listed (13 §1). M3: S7 expects the `ground`
refusal with no `exit` and the recovery through `route next` (33 §8).

Also: 33 §8 gains S13 and S14 (C2, C1); 41 step 6 cites S11's `plan` half and S13; 00-README status and
the version paragraph name C1, C2, H2. Not done, as the reviewer allowed: no gate-instance scheme other
than the ledger id; no separate state-machine file; no new baseline; nothing from 50-backlog.

---

# v4 → v5: the twelve review-v4 corrections, applied as written

Input: [../review-v4.md](../review-v4.md) (#101–#112), the first round under the user's approval
criteria (critical / high / medium; APPROVE at 0/0/≤ 8). Verdict was **REWORK — narrow** on "any
critical". No user decision was asked or changed; every review-v3 item (#75–#100) and D7–D19 were
found landed and faithful. Every finding came with exact replacement text; v5 applies each one and
nothing else. v4 is frozen in [../v4/](../v4/CHANGELOG.md). The v3 → v4 record follows below.

| # | Cat | Correction (short) | Resolution | Where in v5 |
|---|---|---|---|---|
| 101 | critical | `evals:gate` compares the **recorded** `promptMarkdown`, not `prompt.md`; a `prompt.with.md` run is refused | **Accepted as written.** Step 0 records the naked `prompt.md` as `promptMarkdown` and the served prompt as a new `pluginPromptMarkdown`; `withBaseline` unchanged, so the cached baseline is accepted and a changed naked prompt still refused; harness change with its test, no run (D19 holds). | 33 §0.2; 41 step 0 (both cells) |
| 102 | critical | `preanswer {via: prompt}` honoured as acting although the model can run `route start` | **Accepted as written.** Preanswers are written only for `channel: hook` or `--headless`; a model-run interactive `route start --answer` naming an acting option records `declined {via: flag, reason: acting-needs-human}`; non-acting kept. §3.4's acting bullet names the restriction; `--answer` flag row and 13 §1 `preanswer` row say the same. | 12 §2 step 4, §3.3, §3.4; 13 §1 |
| 103 | high | DSL rule "targets are earlier step ids" forbids `revise fix` and `revise $raisedBy` | **Accepted as written.** Targets: an earlier step, the firing step (`$raisedBy`), or the step that consumes a tail-evaluated `onFail` result; later than the next step refused at build. 24 step 6 says the first `revise fix` is how `fix` is entered and counts as its first execution; table row relabelled. | 32 §3; 24 step 6, ceremony table |
| 104 | high | Cross-session adoption dropped the `hash(args)` condition; contradicts 30 §8 | **Accepted as written.** Adopt only with the same `hash(args)`; different args from another session → a new route beside the open one, never superseding it; 30 §8 row says "in any session". | 12 §2 step 3; 30 §8 |
| 105 | high | Kind-level `produces` marks `plan-step` and `promote` done before they run | **Accepted as written.** `produces` entries may be qualified `kind{value}` on a field 13 §1 lists; the fold matches `(kind, qualifier)`; `plan-step → policy{before-report}`, `plan-check → note{plan-draft}`, `promote → note{plan}`; task `fix` → `check{green}`. | 12 §1, §4; 32 §3; 24 step 7 |
| 106 | medium | 13 failure row "folds are per session" stale after adoption | **Accepted as written.** | 13 Failure modes |
| 107 | medium | P33 still says ≈ 1.6 s | **Accepted as written** (0.5 s typical / 2.5 s max; 89 vs ~190 ms noted). | 40 P33 |
| 108 | medium | `rules apply` and `init --apply` lack ⤵ although 31 claims a mirror of 12 §3.1 | **Accepted as written.** | 31 rows `rules`, `init` |
| 109 | medium | Two leftovers name `map` as a step with its own repeat | **Accepted as written** (`ground` repeat 2). | 22 step 4; 13 §4 |
| 110 | medium | "Today's one kind is `note`" wrong: `bundle.ts:391` writes `review` | **Accepted as written.** Two kinds at HEAD; "Ledger 2 → 21 kinds"; 41 Compatibility; §B #91 and §C #68 below corrected rather than left as frozen text, because they are this file's own claims. | 13 §1, What changes; 41 Compatibility; CHANGELOG §B #91, §C #68 |
| 111 | medium | `ground` comment names a human scope answer as the automatic re-run | **Accepted as written.** | 32 §3 comment |
| 112 | medium | `--layers` listed as a CLI flag with no legitimate caller | **Accepted as written.** Flag removed from 31; Purpose cell says a typed `--layers` is refused and a route step passes `layers` in-process. | 31 `map` row |

**Post-approval edits (review-v5, 2026-10-04, verdict APPROVE: 0 critical, 0 high, 3 medium).** The three
medium items were applied in place with the reviewer's exact text, no new version: #113 README line on
the ledger kind count; #114 two Failure-modes rows in 12 now carry the `hash(args)` condition of §2.3;
#115 the fold's human line and §3.4 say a `declined {acting-needs-human}` is not a gate answer.

Not changed from review-v4 §6 ("Not raised"): the "§2.3/§2.4" cross-references, the leftover "v3"
labels, the ecosystem names inside 10 §1–§2 (adapter content under D18), the 25 step 5 double
approval. None was a finding; they stay as they were.

---

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
| 91 | could | `prepare.ts:138` is not a ledger kind | **Accepted**, but the proposed count was wrong: HEAD has `note` and `review` (#110, v5). | 13 §1, 41 Compatibility |
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
- #68 "today's two kinds": two kinds at HEAD, `note` and `review` (review-v4 #110; review-v3 #91's "one kind" was wrong too, see the v4 → v5 section).
- #66 free-text `onAnswer`: DSL form was undefined; now `"*"` + `$answer` (#86).

## D. Not changed, with reasons

- The review (§5.6) read D13's "run on an explicit go" as a second approval. The user then ruled
  no new run at all (D19), so the question is moot; the harness change stays in step 0 without a spend.
- The review's scenario C counts the *Revise* round as "+3"; v4's table says +2 ceremony + 1 work,
  because `plan check` is a work command under the definition in 12 §3.1.

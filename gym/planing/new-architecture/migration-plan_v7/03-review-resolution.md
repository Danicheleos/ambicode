# Traceability: old migration review and architecture v6

This plan is a replacement hand-off, not approval of the historical v5 plan.
Sources: `review-migration-plan.md` (removed from the tree) and
[v6/CHANGELOG.md](../v6/CHANGELOG.md), with current v6 module contracts overriding historical text.

## All old migration findings

| Finding | Resolution in this plan |
|---|---|
| #116 critical, unsafe “free” schema eval | 00 bans eval execution for schema discovery; actual dry-run never spawns; all probes need named spend |
| #117 high, missing review with-prompt producer | 00 exports prompt mechanism; 08 explicitly owns all 8 review prompt.with.md and dry-run tests |
| #118 wrong gate documentation edit | 00 updates operational evals-core README and gate usage, never frozen v6 |
| #119 contradictory withBaseline exclusion | 00 retains version/prompt/model/case/arm refusals; the historical bypass is superseded |
| #120 forced twins/flags/counts | 00 removes forced flag from six scripts, adds regenerate, records 18 current/new baseline vs 26 historical; A uses 10 matching localize cases |
| #121 P21 graph contradiction | 00-README/10: P21 only for authorized appendix collector revival |
| #122 search→init default dependency | Serial 05→09; pending index evidence means propose none |
| #123 decided 0-V treated open | Original exception superseded by user-authorized new baseline;00/03 preserve version refusal and update gate command |
| #124 double-build acs/refs/find/ecosystem table | Ownership table:03 first implementation;04/05/09 extend same symbols/files |
| #125 unreadable-ledger/headless ask outcomes absent | Contracts/03/07 include ledger-unreadable and permission-denied with releases |
| #126 missing worker CLI/invalid output | 06 explicitly owns worker run, model-free fixture, invalid artifact inline failure and outcomes |
| #127 sandbox reviewer error/baseline missing | 07 records 0-R/trust prerequisite, reviewer-error cost/incomplete, baseline-first recovery |
| #128 inaccurate B3 fixture/no-import claim | 01 uses synthetic regression proposed by §6 row B3; minimal route-state import interpretation and timing |
| #129 tool name/config ambiguity | 04 fixes observed-name fallback; acceptanceField marked additive reading, schema owner04/writer09 |
| #130 review output caps absent | 08 built output/body/instruction/estimate byte tests; contracts cap units |
| #131 reminder backlog built prematurely | 10 presents condition/cost only; no re-registration without new approved assignment |

## v6 corrections translated to implementation obligations

| Contract | Where implemented | Proof |
|---|---|---|
| G1/C1: headless mode grants no authority; later acting flags always refused | 03 consent/origin;06/07/08 consumers | S1/S2/S14 plus standalone flags |
| G2/C2: bound gate instance and exact producing object | 02 notes;03 hook/context;06 plan | S3/S12/S13, same-hash different-object negative |
| H2: ownership before args, explicit plan adoption, stale writes refused | 01 guard;03 claim/context;06 real integration | S11, concurrent claims and takeover/write |
| H3: producer and consent windows separate | 02 predicate;03 object resolution;06 recovery | S3 reaccept B with no new write/check |
| M2: persisted gate field vs ledger id | 02 schemas;03 writer/hook;06 real gate | gate.id stays unique, acceptance.instance exact |
| G3: target repeat, human cycles | 03 bounds;06/07/09 routes | S4/S5, fix/rules loops |
| G4/M1: init bootstrap and own step completion | 03 bootstrap/fold;09 init | S6/S9 |
| G5/M3: every review source outcome, recoverable ground refusal | 03/04 normalize/policy;08 route | S7/S8 |
| G6/H1/R18: completed/delivered/verified distinct, one algorithm | 03 engine/tail; all handlers | S9/S10, entry parity |
| D11: draft before acceptance and durable recovery | 02 notes;06 plan check | S2/S4/S10 and saved-on-failed-check |
| R16: ecosystem adapters, no runtime LSP | 03/05/09; backlog excluded | neutral route/step tests, unknown ecosystem fallback |
| D19 baseline choice superseded; immutable neutral prompt retained | 00/03/08 harness | immutable naked bytes + baseline refusal tests |

## Explicit implementation readings and scheduling deviations

1. Current HEAD already tracks four reuse files; validate instead of restoring unrelated stash.
2. Runtime config reader and minimal ecosystem table move to 03; writing/detection remain 09.
3. Step 09 executes after 05 and before 06 so first install/format are available for skill integrations.
4. Route association, context port, coordinated id/owner writes and acting metadata make v6's
   implicit chain/authority contracts executable; they create no alternate route database.
5. Caller session must be bound; newest slug route cannot be a fallback identity.
6. Worker definition id cannot overwrite common ledger id; use non-conflicting workerId field.
7. AC ids stay AC-key-nn deterministic for unchanged text; no new insertion-stability promise.
8. The user subsequently authorized a new working naked baseline on 2026-10-04 and declined
   its paid equivalence test. Use that reference with the assumption visible; no further baseline
   or equivalence run is authorized. Required plan/task/live-review experiment arms remain separate.
9. Review-run code actor evaluates the model-run review command; no unsolicited engine model call.
10. Cost figures are estimates. The live tier's 24 reviewer calls do not cover all session-arm cost.
11. Runtime tests embed synthetic contracts, not filesystem reads of gitignored design documents.
12. Decision A's proposed population is localize (10 selected cases), preserving the 18-case
    generator; the user confirms this deviation from v6/33 before paid decide. This resolves
    v6's investigate-only engine versus later live review dependency;
    report the subset and never compare different cost populations.
13. Preserve the existing persisted note subtype field `note`; design shorthand note{plan}
    is a qualifier, not permission to replace the common kind:'note' discriminator.

These readings must appear in implementation reports with actual evidence. They are not new
user decisions or permission to add future features. If a reading cannot satisfy v6, stop only
the dependent work and present the exact conflict.

## Eval update integrated into the hand-off (2026-10-04)

Commit ae45901 already delivers naked-arm, automatic reference-arm selection, forced-to-neutral
compatibility and infrastructure validity checks. Step 00 reuses these seams; it still owns
per-arm prompts, actual dry run, neutral-only selection, scoped A and ledger scoring.
Working reference is eval-2026-10-04T19-44-56-791Z.json on 2.1.289,18 cases/54 runs.
The old 0-V bypass and fixed 0.101 band are removed from current instructions.
Frozen v6 documents remain historical inputs; this explicit later user instruction wins where
baseline policy differs. No new architecture revision is necessary for the route contracts.

## Independent migration review #149–#161

Source: [review-migration-plan-v6.md](../review-migration-plan-v6.md). These are hand-off edits;
implementation and platform probes remain pending.

| Finding | Resolution / remaining decision |
|---|---|
| #149 session transport | 00 owns P-S; user chooses 0-S; 03 implements chosen adapter. No binding → session-unbound; injected-session work continues. Single-open-route fallback deliberately rejected because it does not establish caller/consent identity |
| #150 worktrees and inputs | PRIMARY protocol, authorized commits or named patches for prerequisites/plan; NDA generation and paid runs only after integration in primary |
| #151 review target | 08 removes --branch and tests uncommitted scaffold selection |
| #152 decision provenance | 00 records dated user quotes; operational README updated now; step 00 owns tested gate equivalence-unverified notice |
| #153 version drift | 0-V pending early; no pin/re-baseline authorized; mismatch blocks A measurement until new instruction |
| #154 duplicate kind seam | Existing --tag localize; per-kind gate unchanged; subset regression assigned to 00 |
| #155 decision A scope/options | Population explicitly proposed, confirmation before paid decide; all v6 fallback choices restored; user decides with probe limitations visible |
| #156 naked prompt contamination | 00 strips per-arm files/selectors, refuses outstanding swaps and tests clean control prompt |
| #157 guard ownership | 01 creates pure ownerOf, guard keeps fs reader; 03 uses same predicate; 1 MiB startup proof |
| #158 shared ownership | 03 raises schema reader version, 02 creates context types then transfers file, one ledger lock with non-reentrant append seam |
| #159 investigate diagnostics | Temporary omission explicit in 03; 07 adds diagnostic text, gate/default/re-entry tests |
| #160 free text | Explicit onAnswer wildcard exception; free text never acting |
| #161 trigger retirement | 03 removes trigger release gate; each migrating skill owner converts positives to negatives; paid execution stays separately authorized |

Editorial cleanup removes fused prose numbers and stale restore/cost instructions. Document
validator checks structural identifiers and commands rather than exact explanatory sentences.

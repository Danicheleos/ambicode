# Mandatory scenario matrix — v6/33 §8

These are implementation tests to build, **not tests executed while preparing this plan**.
Each scenario uses a materialized synthetic repository and actual Engine/CLI/hook entry points.
Unit stubs may isolate module failures; they do not replace whole-route integration.
Owners create fixtures/tests in tracked source test directories; no NDA inputs or gym runtime
dependency. Step03 may use fixture-only plan/init/review routes before live routes ship.
The final owner reruns against shipped route YAML. Reports link actual tests and outcomes.

## Coverage and exact assertions

| Id | Mechanism owner → final integration owner | Trigger and required result |
|---|---|---|
| S1 | 03 → 06 | Interactive model CLI start plan --headless --answer Accept. route channel cli/trusted false, acting-needs-human declined; no promoted note; report names model-set mode. A printed gate/headless default is not consent. |
| S2 | 03 → 06 | Same line is USER prompt through UserPromptSubmit. trusted true, preanswer, draft exists before conversion, acceptance binds reached instance/hash and promotion occurs. Platform assertion conditional on P37(c); synthetic adapter test unconditional. |
| S3 | 02/03 → 06 | Accept draft A, save B, promote refuses object-changed. Reask plan-accept WITHOUT another plan-write/check; B stays discoverable in plan-check producer window. Bound Accept B → exactly one plan for B; second promote exit0 plan-already-promoted, no rename/entry duplication. |
| S4 | 03 → 06 | Two bad checks then passing third write: three deliveries, three plan-check completions, two via:code revises. Third failure attempts fourth write → repeat limit on plan-write and Known limitations; default1 plan-check does not veto covered reruns. |
| S5 | 03 → 06 | Model revise design then human Revise. Model consumes target repeat, not human allowance. Human resets covered counters, reruns plan-step and design without false limit. Untrusted start non-acting Revise is via:model, not human cycle. |
| S6 | 03 bootstrap → 09 | Fresh git repo/no config: investigate config-missing; init proposal/gate; Cancel/default leaves ONLY task/init-<date>, reports untracked directory/cleanup. Second init Apply writes config+ignore, doctor, then investigate loads it. No owned-directory cleanup outside requested path. |
| S7 | 04 → 08 | Two requirements, one fully captured. missingAsked contains other, ground requirements-missing refusal, no exit/reviewer. Capture second then next → normalize complete → estimate. Explicit stop separate exit. Also list-only hit and unrecognized payload remain missing. |
| S8 | 03/04 → 08 | Bound server but no recognized captures after two advances → not-captured-twice gate, policy review:stop, no quality reviewer. Disconnected/ambiguous defaults tested too; interactive ambiguous still offers servers. |
| S9 | 03 | Code template has empty produces. completed once; two next/resume do not rerun. Scope revise ground keeps earlier template completed. A fixture route explicitly revisable template/repeat2 reruns once with second completed record. |
| S10 | 02/03 → 06 | Inject crash after code outputs/before completed: next entry reruns once and report uses latest. Inject after promotion rename/before note entry: next promote repairs entry, no new consent/rename. Inject command-result-before-delivery: resume only delivers. |
| S11 | 03/01 → 06 | Non-owning investigate same args adopts, different args separate chains. Plan SAME or different args other session refuses route-busy. Explicit adopt resumes/adopts; old owner next/save --from/check/promote and guard plan-body write refuse taken-over. Exited route permits fresh plain start; idle60 min opens nothing. Test simultaneous starts/takeover-write as well as sequential scenario. |
| S12 | 03 → 06/08 | Bound late answer after never-asked default supersedes default and applies onAnswer. Uses answered instance, not latest print; a late answer with stale object cannot promote new draft. |
| S13 | 03 → 06 | Print A instance19, new draft B print27; answer A binds19/hashA. Promote refuses, reprints B; answer new instance promotes only B. Repeat after default and resume. Instance99, foreign chain or logical-id mismatch → unbound, no effect, reprint. |
| S14 | 03 → 07/08/06 | Trusted headless start WITHOUT acting preanswer. Model next --answer review-offer=run or plan-accept=Accept declines on every channel, default skip/draft, no spend/promotion. WITH trusted preanswer → honoured at gate; execution after honoured answer asks nothing again. Add check/review --approve exact-key equivalent. |

## Full gate table

Enumerate every declared gate from all shipped routes plus every registry entry including
decision:*; do not maintain a manually selected subset. Drive accept, release, non-acting
--answer, acting flag decline, --default before/after asked, headless default, three advances
with asked0, late bound answer, free text, every onAnswer/onFail revise and bounds.
Assert default/release exist and default never writes config/promotes/runs reviewer/check.
Test registry policy overrides for review, dynamic options, $raisedBy key isolation.
Build must fail on acting default, object without earlier producer, invalid onFail target,
automatic target repeat1 (except human reask/$raisedBy), or unknown qualified kind.

## Supporting assertions

- All five advancing entry points share one algorithm; same-session reprint/reinjection is
  delivery-only. Counts detect duplicate ground/checker/reviewer executions.
- Legacy notes/reviews are readable but cannot authorize an acting effect.
- Every command-tail runs once; handlers inside engine never recursively invoke CLI/tail.
- Null runner summary, zero tests and syntax error are not red/green proof.
- Standalone consumers enforce same consent/key/set/object/owner predicate as route consumers.
- Every scenario's failure reports code+release, missing evidence and final Not verified.
- Stop fixtures: bad citation report blocks once; conversational stop allows; second failure
  allows; note route checks actual saved file; unreadable transcript diagnostic/fail-open.
- Delivery overflow/read-back, status orphan list, conflicting target, permission-denied,
  config-missing and ledger-unreadable recovery paths are explicit tests.
- Simultaneous ledger appends include same-session writers and full16 KiB cap boundaries.

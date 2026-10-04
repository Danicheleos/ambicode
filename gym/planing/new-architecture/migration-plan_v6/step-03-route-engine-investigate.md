# Step 03 — Shared engine, hooks and investigate; decision A

## Assignment and prerequisites

00–02 integrated; use their APIs/reports, never build replacements. Default spend $0.
Read 01-contracts and 02-scenarios in full, v6/12 whole (especially §8), v6/22,
v6/30–33, v6/14 intake, v6/10 no-index layers, v6/11 stage projection and v6/15 Stop.
Inspect existing run-hook, prepare-on-skill, markers, CLI prepare, contracts/hook, locate,
dependents, git grepFiles, policy resolve, requirements normalize, config/load/defaults,
skill-content tests, build and package-candidate.
Owner: generic engine/context/consent/ownership/tail, config reader foundation, minimal
requirements/search/policy used by investigate, hooks, registry, investigate route/body.
No live plan/task/review/init/rules route yet. Synthetic fixture routes may exercise all actors.

## Work sequence

### 1. P2/P48 platform support

When separately authorized (≤ $1 combined), use synthetic interactive AskUserQuestion with
a printed marker containing logical gate AND instance. Observe actual hook key paths for
question, marker, option, session and object lookup. A headless auto-answer alone does not
prove human answer binding. P48 separately records whether additionalContext reaches next turn.
Fixtures contain observed structure with synthetic values, never benchmark payloads.

If unrun, implement/test adapters against synthetic supported and unsupported payloads, but
runtime defaults to unsupported. If P2 fails, only **non-acting** --answer fallback is available;
acting options require a trusted-start preanswer. No “headless authorizes it” or re-confirmation
through a model flag. Present this limitation at A before dependent skills proceed.
P48 unsupported → explicit next instruction, +1 ceremony turn per gate.

### 2. Config and adapter foundation (pulled forward from 09)

Extend strict config reader with schemaVersion 3 fields from v6/32; read v1/v2 with notices
and in-memory defaults. Do not write/migrate user's file. Search lists are explicit defaults,
printed as defaults until init writes them. Drop obsolete lsp/exact fields in normalized view
with notices; preserve unrelated existing config/review fields.
`SUPPORTED_SCHEMA_VERSION` becomes 3 here for reading; step 09 adds writing/migration.
Create minimal src/config/ecosystems.ts for current declaration filters/source globs; harvest
reads it. Step 09 extends this SAME table and detection, never creates another.
No language names in routes, engine or step instructions. Existing ecosystem-specific runner
adapters stay in their appropriate adapter module; do not move them into route logic.

### 3. Route schema, loader, build and gates

Implement src/route/routes.ts with v6/12 §1 and v6/32 §3 validation:
fixed when vocabulary including gate predicates; actors; qualified needs/produces;
instruction inclusion ≤ 1,500 chars; gate only human (future workers deferred);
non-acting default/release; acting metadata; target ordering/repeat exceptions; earlier
producer for object; maxRevises; budget and exits.
Reject duplicate/missing step ids, unknown handlers/predicates and invalid revision targets.
Keep normalized DSL and persisted gate fields distinct.

Create complete routes/gates.yaml from v6/32 §4. All three review missing-source gates have
policy review:stop. decision:* default/release keep open and no acting/object metadata.
Dynamic projects/servers/keys options are instantiated before validation/printing.
Build validates every route/registry/step file. package-candidate includes routes/*.yaml,
routes/gates.yaml and routes/steps/*.md and validates from candidate. No runtime gym imports.

### 4. Engine, fold and reusable context

Implement Engine, RouteContextPort, consent and ownership from 01-contracts §1–7 exactly.
Use v6/12 §8's one six-step algorithm for every advancing entry point.
Record outputs before completed; reprints/reinjection only deliver; completion is not verified.
Fold route chains with step windows and qualified outputs; preanswers outside windows until
reached; bound answers only; onAnswer/onFail execute through revise and central bounds.
Read-only status does not mutate position or consume preanswers.

Start resolves repository/config, except init repository-only bootstrap even before init's
live route is built. Test bootstrap with fixture handler. Slug follows design helper.
Canonical args preserve behavioral flags (requirement/project/plan/from-draft and answers)
while excluding launch-only fresh/adopt identity where appropriate. Do not hash only free text
and lose changes to requirement/target. Record normalization as an implementation reading.
Same session same args reprints; owning-file skills check live other-session ownership FIRST;
adopt/fresh/taken-over rules and non-owning side-by-side chains as v6/12 §2.3.

The session adapter implements the transport chosen by 0-S from P-S (step 00 §6).
If 0-S is pending, implement and test injected sessions only; paid walk/decide waits.
Missing/stale/ambiguous bindings refuse session-unbound with the 0-S release.
No single-open-route or latest-owner inference substitutes for caller identity. Harness trust requires validated run token (P58); no public channel flag.
Cache active-route in existing hook state; fall back to scanning this session's ledger routes.
Pointer is not route authority. Measure 50-task scan; <20 ms is a proposal to remove pointer,
not an automatic decision. Clear pointer on exit/completion but retain ledger.

Serialize competing plan claim/takeover/write operations using step 02's one ledger lock
and step 01's pure ownerOf predicate through the shared ownership port; never reacquire the
lock during append or create another lock/fold.
Even without live plan route, fixture tests cover two simultaneous claimants and stale writes.
Default-1 code steps rerun when covered by revise; target bound alone decides.
For same-error ×2 offer blocked release; missing produces ×3 records limit/advance.
For partial review requirements refuse ground without completion/exit; generic onError must
not overwrite this explicitly recoverable refusal with stop. ledger-unreadable names new slug.
Permission-denied after headless guard ask records blocked with detail and report lead.
Status includes sessions/owner, outstanding steps, cycles, limits, layers and orphan files.

### 5. Central CLI tails

Create command-tail.ts; route next and evidence-writing wrappers use it once.
Module handlers invoked inside engine are tail-free. Test recursion/double-run prevention.
In this step wire requirements normalize and note save; expose extension seam for later commands.
Register route start/next/status/stop, map, refs, find, requirements template/normalize/acs,
policy --stage and report via existing SPECS/USAGE. All support --json without mixed invalid JSON.
Prepare becomes one-release deprecated adapter through same start API; keep its existing
activity/options translation documented. Model-run prepare is CLI/untrusted, never hook.
CLI flags match v6/31; reject --layers with search-layers-not-for-model.

### 6. Minimal requirements handlers (extend in 04)

Implement hasRequirement exactly v6/14. Template includes server binding, field lists,
one-level expansion and >10 early stop BEFORE child reads, completion command with task.
Capture synthetic observed get/search/fetch/read shapes, NOT_THE_TICKET stripping,
rawHash/relations/derivedFrom, list-only reduction and no hook advance.
Normalize captures or args; asked/missingAsked fields, list-only not a capture, orphan notice,
not-captured first/second behavior, partial-source notice/refusal by skill. Complete requirement
coverage semantics belong here before review consumes them; 04 expands tests and stable ACs.
Implement first acs splitter now because investigate ground needs it; 04 extends it, not replaces.
Expose deterministic AC-<key>-<nn> quote units as signal, not validated recall truth.

### 7. No-index Search and Policy (extend in 05/07/09)

Reuse locate scoring. Add grepWords beside grepFiles. Harvest globally over top 8 pass-1 files,
adapter-owned filters, names/declaration counts. Map runs configured list in order:
prompt shortlist→harvest→shortlist; context grep→harvest; records per-layer ms/hits and terms
by pass; skips unavailable index layers with explicit limitation. No model layer selection.
Code-shaped terms first, UI/i18n adapter path next, prose only with <3 identifiers; breadth >60%
dropped with limitation. First refs/find commands ≤4 KiB append search. Step 05 adds project-wide
collision census, relates and index; no duplicate command/module.
Policy.stage projects existing resolver; before-work ≤4 KiB and before-report ≤1.5 KiB,
overflow behind show. All but code-style for plan contexts; investigate omitted counts visible.
No resolver rewrite. No check or model worker needed for this assignment.

### 8. Hooks and Stop

Use exact v6/30 matrix: session lifecycle/epoch, prompt launch/reinjection, mcp__.* capture only,
AskUserQuestion binding, guard, Stop. Remove Skill and Edit|Write post-hooks; reminder code remains
unregistered until separately approved entry condition.
Prompt launch uses hook channel from actual user text. Plain questions/ticket reads with no
route launch nothing. Main-thread routes/Stop only; agent_id present is ignored.
Ask hook binds exact instance, not latest print; unbound diagnostic and reprint.
decision:* hook may mint instance+answer together, with no acting options.
Stop reads report-shaped main-thread stops or newly saved note file; conversational stop allows.
Validate cited path/line, generated section hash/normalized diff, supported consent/test claims,
red-before-green. Block once and record limit; second failure allows. Transcript unreadable
fails open with diagnostic/limit, tail ≤1 MiB. Until P17 probe, retain bounded reason and
stop-check.md fallback; do not claim unsupported Stop fields work.
Update hook contracts, outcomes, compatibility and release checklist with actual hook count.

### 9. Investigate route and body

Ship only routes/investigate.yaml and its texts matching v6/22:
template/fetch conditionally; ground with envelope/map/before-work policy and repeat 2;
scope when map.empty, default/release search anyway, free text revises ground;
read model without required search output; report-step before-report; write produces
note{investigation}. budget modelSteps 6. Ground auto-runs on no-requirement start.
Read guidance: map hypothesis, batched then spans, two hypotheses, collision import verification,
reuse find and partial navigation record.
Shrink body ≤2 KiB with judgment/read-only reason/fallback and disable-model-invocation.
Delete old shared prepare-output/requirements-mcp and READING_ORDER; remove dangling references
from unmigrated bodies with equivalent inline guidance only. Their full rewrite belongs later.
In evals/evals-triggers, flip investigate's positive cases to “no AMBICODE skill fires”.
Remove evals:triggers:gate from package.json; retain suite execution and invalid-run checking.
Update its README: this suite becomes a negative-only check as each remaining skill migrates;
it is no longer a release gate for description edits. Steps 06/07/08/09 convert their skill's
positive cases in the same change as disable-model-invocation. Editing cases is model-free;
executing the suite is a separately authorized paid item. Package route/step files.
Until step 07 supplies check --only, omit the diagnostic invocation from investigate's read
text and report the temporary deviation. Step 07 owns restoring v6/22 Diagnostics and tests.

## Model-free proofs

Tests: schema rejects invalid DSL; full declared/registry gate matrix; all counters/releases;
entry-point parity and code/model own completion; trusted/untrusted launch; session lookup;
producer-object resolution; simultaneous ownership; crash replay; JSON output and tail once;
no plain-question launch; Stop fixtures and map layers. 02-scenarios assigns S1, S9, S11,
S12 and S14 core tests here; plan-shaped fixture routes also validate S2/S3/S4/S5/S10/S13
mechanisms without shipping plan.
Materialized ts-feature-boundary synthetic investigate: start→ground→read→next→report→
note save→complete; no-requirement ceremony 2, with-requirement3; no search call required to finish read.
Caps on built outputs: body 2/start 4/ground 8/report-step 2/map 6/search 4 KiB,
CLI chars 8,000/hook 9,800/file preview 300; no limit raised.
20-spawn timing medians: guard≤50 ms, hook≤120 ms, MCP no-route≤90 ms;
synchronous no-requirement start≤3s on available three repos. Missing snapshots = pending,
not made-up timing. Run affected tests and npm run verify before paid runs.

## Authorized walk, decide and A

Requires step 00 prompt mechanism/probe report and named run authorization.
Walk first; fix mechanics through synthetic regression before decide.
Both use --prompt with, --tag localize, pinned claude-sonnet-5-5, --no-publish and explicit
max-cost-usd. Execute from the integrated primary checkout, with its absolute benchmark root.
Before paid decide, the user confirms the proposed 10-case population for A.
After twins removal selection still generates 18 cases. For this investigate-only decision,
use step 00's existing --tag localize filter: 10 cases ×3 plugin runs against the same cached naked
subset from the new 2026-10-04 naked baseline. Old v6 estimate $14/26 is historical;
estimate about $5.40 at $0.18/run here, not an
authorization. Record actual counts/cost and this scheduling interpretation. Review measurements
wait for 08; do not invent an early review route before A permits dependent implementation.

Gate command:
```sh
npm run evals:gate -- <result>.json --baseline "$PRIMARY/evals/evals-core/results/eval-2026-10-04T19-44-56-791Z.json" --max-cost-ratio 1.15 --max-extra-turns 1000
```
If actual turns exceed that reporting-only sentinel, report and rerun the **offline gate**
with an explicit larger sentinel; turns never decide A. Do not change default gate thresholds.
Report measured localize recall/cost against matching cached naked cases, ceremony, peak context,
permission failures, launch channel and baseline/reference-arm/version provenance. Compute the
noise band from both compared arms' repetition means through the existing gate; 0.101 belongs
to the historical baseline, not a new threshold. Keep infrastructure absences out of metric means
while enforcing absent-share/validity checks; own turn/time-limit outcomes remain scored.
The new control is naked's recorded with arm, automatically selected by withBaseline.
Report naked/true-without equivalence as unverified; do not rerun the declined paid comparison.
A version mismatch refuses rather than falling back to the old baseline or an exception flag.
A requires recall within band AND cost≤1.15x. Passing criterion is evidence; proceeding is the
user's decision. Failing criterion lists both arms/loser detail and pass 2-only/text guidance options.
An unrun measurement cannot be reported as criterion met. Present failed or unrun P2/P58
with its actual limitation: unproven/unsupported interactive acting answers; acting options
require a proven trusted-start preanswer path, and sandbox harness trust requires P58.
The user decides continuation with these limitations; consent checks are never relaxed.
Present proceed, cut down, or abandon with steps 4–5 on v0.4.0's hooks. A chosen fallback
requires a new step file before dispatch.
No agent starts 04–09 until the user authorizes continuation at A.

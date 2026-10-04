# Shared contracts — mandatory for every implementing agent

This file fixes implementation readings left implicit by v6. Architecture decisions remain
unchanged except the baseline choice superseded by the later user instruction in 00-README:
use the 2026-10-04 working baseline and do not run the declined equivalence test.
Normative inputs: v6/modules/12 §2–8, 13 §1–4, 14 §3, 15 §1–3, 16 §2 and v6/32.
If an implementation cannot satisfy these contracts, report the precise conflict rather than
creating a fallback with weaker evidence or authority.

## 1. Persisted identity and route context (owners 02 then 03)

Use the existing append-only task ledger. Its 21 kind values are:
`route, step, gate, acceptance, declined, default-taken, preanswer, revise, limit, exit,
requirement, envelope, map, search, policy, baseline, check, format, review, worker, note`.
Schema version 3 for config and route format is independent of the architecture folder's v6.
Do not rename them to version 6.

Common ledger fields retain `id, at, kind`. Add route association to new route-scoped records
as an additive field `route: <route-entry-id>`; include calling session where needed to
resolve ownership. This is an implementation reading of v6's “entries of those routes”.
Legacy records lack that field and remain readable; they cannot grant new route authority.
A route start record's own ledger id is its route identity. Adoption points `resumes` at
the prior route entry; the fold includes the transitive chain. Unrelated records on the same
slug never satisfy a step's needs, consent or producer lookup.

`id` always means ledger entry id. `step` means logical step id.
Persisted `gate` means logical gate id; a gate print's `id` is its instance.
The DSL may use `gate.id` for a logical definition, but normalize it at the writer boundary.
The `worker` kind's worker-definition id must likewise not overwrite the common ledger id:
use an additive `workerId` internally and serialize a documented non-conflicting field.
v6/13's worker row overloads “id”; record this interpretation and retain old artifacts.

Likewise common `kind` remains the ledger discriminator. Preserve the existing note writer's
`{kind: 'note', note: 'plan-draft'|'plan'|'investigation'|'notes', ...}` shape from
src/cli/commands/note.ts. The design's `note{plan}` qualifier reads the `note` field;
do not serialize `{kind: 'plan'}` or overwrite `kind` with the note subtype. ArtifactRef
`value` is that subtype. Other qualified kinds use an explicit schema-owned field mapping,
not a guess that every kind uses the same field. Tests cover mixed legacy/new note records.

Resolve session from an explicit hook input, a platform-proven Bash-child session binding,
or a session-specific association written by the hook. **Never infer the calling session
from the latest route on the slug.** That would impersonate the owner after takeover.
A routeless standalone write may use a new random writer id; an owned-plan write with no
reliable session association fails closed with a release naming a trusted route start.
Session transport is a step-03 platform-adapter responsibility; tests inject explicit sessions.

Ids are `<session8>-<n>`; allocate n monotonically per session namespace. One complete JSON
line per append. O_APPEND alone does not prevent same-session read-increment collisions:
step 02 owns serialization for id allocation plus append using existing filesystem ports
(extend a port if required), with tests for two sessions and concurrent same-session calls.
No database or second route-state store. A transient lock is coordination, not authoritative
route state; document its crash recovery. Size cap is 16 KiB per serialized ledger line.
Unknown kinds are skipped; unreadable route state must not fold as empty/new.
Warn at 1 MiB ledger; recovery names a separate task slug.

## 2. Engine-facing ports (owner 03; step 02 implements predicates against injected views)

Freeze typed exports in `src/route/context.ts` before other skills integrate:

```ts
type StartChannel = 'hook' | 'cli' | 'harness';
type Cause = 'route-next' | 'gate-hook' | CommandName;
interface RouteView {
  routeId: string;
  chainIds: readonly string[];
  session: string;
  mode: 'interactive' | 'headless';
  channel: StartChannel;
  trusted: boolean;
  position: string | 'complete';
}
interface RouteContextPort {
  resolve(task: string, session: string): Promise<RouteView | null>;
  assertOwner(view: RouteView): Promise<void>;
  window(view: RouteView, stepId: string): Promise<readonly LedgerEntry[]>;
  object(view: RouteView, gateId: string): Promise<ArtifactRef | null>;
  consent(view: RouteView, gateId: string, binding?: object): Promise<ConsentResult>;
}
```

Use explicit types for the existing design fields when implementing these schematic signatures.
`ArtifactRef` is `{kind, value, id, path, contentHash}`; its id is the producing ledger entry.
`ConsentResult` is honoured or refused with reason and source entry, not a boolean that loses
provenance. Step 02 tests notes/report with synthetic ports; step 03 supplies the ledger-backed
implementation. Do not make Evidence import Engine or create a second fold in notes.ts.

`Engine.start` accepts design fields including `adopt` and channels hook/cli/harness;
`advance` accepts cause and the v6 next flags; status and stop match v6/12 Interfaces.
CLI wrappers never expose a channel/trusted override. Hook and harness are platform adapters,
not user-selectable flags. Module handlers receive RouteContextPort and explicit input; handlers
do not parse CLI flags, call CLI wrappers or recursively advance the engine.

## 3. One advance algorithm (owner 03)

Implement one orchestration path for start, next, command tail, bound gate hook and cross-session
resume. Sequence: record input → fold → needs/when/bounds/budget → run reachable code →
record outputs then code completion → deliver next model/human instruction.

For a model position without produces, next/command tail writes its own completed record.
For one with produces, qualifying outputs satisfy it; delivery never proves completion.
A code step needs its own completed record AND all qualified outputs.
A false when records skipped once in the window. Empty produces proves nothing for code.
Human completion excludes unbound answers and acting-needs-human declines.
Workers need their own result. “Verified” means check/review/worker result, never completed.

Same-session reprint and compaction re-injection only fold/deliver: no code, no completion.
Cross-session adoption runs fold/execute/deliver and repairs interrupted work.

CLI evidence-writing wrappers append their result and invoke command-tail exactly once:
route next, requirements normalize, check, format, review, plan check,
policy check --drafts, rules apply, init --apply, note save, note promote.
The engine calls underlying module handlers without tails. Guard against recursion and assert
counts in tests. Successful read-only commands and review --estimate do not acknowledge a
model step just because they were run. Failed commands do not create successful outputs.
Failure handling enters the declared refusal/gate/onFail path; no completion for failed ground.

For externally executed work (plan check, check, review), the registered code step consumes
the result or executes the designated deterministic follow-up; it must not run the check/
review twice at the command tail. Record completion for the matching code step after its
expected outputs. Test plan-check exactly once per write and one reviewer per authorized run.
The engine never launches format/source edits itself. A code actor named review-run evaluates
the model-run command's recorded result; it does not independently spend on the reviewer.
This is the implementation reading that reconciles skill tables' “model → code” with 30 §9.

## 4. Windows, revisions and counters (owner 03)

Per-step evidence begins at the latest revise whose target index is at/before that step.
Windows are per route chain, not whole slug. Qualified outputs match the specified field value.
An automatic revise checks only the target's repeat within its human cycle. Covered steps rerun
without consulting their own repeat. A human revise resets covered counters and consumes only
that gate's maxRevises. Model revises never spend the human allowance.
Defaults: ground/design 2; plan-write/draft 3; fix/review-run 2; check 5 per phase; others 1.
Validate automatic/revisable targets repeat ≥ 2; human-target reask such as promote →
plan-accept is exempt and bounded by same-error count. $raisedBy is resolved at runtime.
Model budget: investigate 6, plan 14, task 18, review 6; wall 45 minutes headless only.
Never add an idle timeout or an interactive wall timeout.

Preanswers live outside step windows until consumed at their reached gate; consume once and
record the instance/object then. They survive earlier revises but are not perpetually renewed
after artifact changes. Late bound answers may supersede defaults, retaining their original
printed object's identity. Maximum human revises 3; exhausted option names fresh restart.

## 5. Consent: origin, instance, object (owner 03; consumers enforce it)

Trusted route start means hook input from the user's own prompt, or harness input whose
per-run token has been validated by the harness adapter. Headless is only mode.
If token transport is unproven, CLI fallback stays untrusted.
Token validation binds run, session and intended start; reject absent/mismatched/replayed
bindings. Do not store token values in ledgers, output or artifacts. This is process
provenance, not a claim that the plugin is a security sandbox against arbitrary host access.

Acting options are explicit metadata in the normalized gate definition (`acting: [...]`),
an additive implementation reading needed to validate non-acting defaults. Mark Accept,
Apply, reviewer run, propose-command approve and other actual side-effect permissions.
Known key/options resolve from the full registry and declared route. Unknown options refuse.
Non-acting selection can still revise model work; origin then determines automatic/human bounds.

Every print writes `gate {gate, class, raisedBy?, question, print, object?}`.
Marker is `[ambicode gate <logical-id> <ledger-id>]`.
Hook answers resolve that exact instance within the chain, verify its logical gate id, and
copy its object. Missing/foreign marker or instance → unbound, no effect, reprint.
Only decision:* can mint a print and answer together without an incoming instance, because
it has no acting option or object.

Acting consent is honoured from:
- bound hook answer for the printed instance; or
- preanswer recorded at trusted start, converted at the reached print into via:prompt acceptance.

**Never from a model-typed flag**, including route next --answer, check --approve and
review --approve, on every channel and in every mode. They record acting-needs-human decline.
Consumer commands independently call consent, including standalone invocations; route position
is not permission. An already honoured answer is executed without another question.
Key-bound checks and exact accepted init --set values must match. No acceptance from legacy
notes, delivered steps, raw flags or a globally latest unrelated route.

Interactive unanswered gates reprint; third advance records non-acting never-asked/unanswered.
Headless records non-acting default. --default is legal headless or after asked ≥ 1 only.
asked counts hook-written answers including unbound, not prints. Completion with defaults,
declined checks, failed/skipped reviewer or limits reports Not verified and cannot claim success.

## 6. Promotion and ownership (owner 02 predicate, 03 context, 06 real integration)

Find calling session's open/last plan chain, assert current ownership, then evaluate latest
bound plan-accept answer in its consent window. It must be Accept with honoured origin.
Resolve the latest draft in **plan-check's producer window**, not plan-accept's window.
Require producing entry id, kind/value, path and content hash to match acceptance.object;
hash actual file. Identical bytes from an unrelated draft are not the same object.
A newer draft, changed bytes, superseding Reject/Revise/default, foreign chain or unbound
answer refuses. Reask plan-accept for the current producer object without redoing plan-write/
plan-check. Revising design moves the producer window; old drafts then cannot satisfy it.

Rename accepted draft to plan with same timestamp, append promotedFrom reference, preserve
the authoritative hash. Repeat call returns plan-already-promoted exit 0 without rename.
Crash after rename/before append repairs the note entry without another consent or rename;
test this before route tails are wired. No direct save --kind plan after step 06.

Plan owns plan-body and drafts task-wide. Check live ownership **before args comparison**.
Any second session, even same args, gets route-busy. --adopt appends resumes/adopts and keeps
position; --fresh records superseded and restarts; another slug is independent.
Former owner is refused at write time by next, save --from, plan check, promote and guard
plan-body writes. Age/idle time is irrelevant. Other skills may adopt same args automatically,
and different args coexist in separate chains. Context lookup must not identify old session
as new owner by reading the newest route.

Step 03 owns coordination for concurrent starts/takeover and ownership checks. Reuse filesystem
ports; serialize competing plan claim/write operations where the check and mutation must be
one operation. No new persistent route authority. Test simultaneous start and takeover/write,
including guard decision before a later CLI write. Do not assert O_APPEND grants exclusivity.

## 7. Requirements and bootstrap (owners 03/04/09)

Headless hasRequirement only from explicit --requirement. Interactive URL/explicit flag,
or a bare key with bound server; key-shaped prose alone is false.
Capture hook binds server and records payload only; no map/advance.
Compute asked/missingAsked before envelope branch. Search lists never count as full captures.
Derived sources must chain to asked key. Args envelope only when no promised source or explicit
gate release allows it; distinguish captures/args in report and scorer.

Review registry policy: stop on disconnected, ambiguous and not-captured-twice defaults/releases;
interactive ambiguous still offers actual servers. Partial captures → requirements-missing
**refusal at ground, no exit**. Second capture plus next resumes normalization and estimate.
Explicit route stop creates exit; never silently run a quality review instead.

Init bootstrap uses openRepository, not openWorkspace. Missing config normal; ledger at
task/init-<date>. Cancel/default changes nothing outside that directory and names cleanup.
Apply needs exact accepted values, writes config+ignore through CLI, then doctor.
Unparsable backup requires acting consent and occurs before regeneration.
No hooks/code steps rewrite source; formatting and doctor command execution follow their
existing command policy, with null and failures reported honestly.

## 8. Caps and compatibility conventions

KiB byte tests use 1,024 bytes; characters count separately. Do not equate 9,800 chars to bytes.
Model instructions ≤ 1,500 chars after inclusion. CLI inline ≤ 8,000 chars; hook inline ≤ 9,800.
Overflow → step file + 300-char preview and explicit whole-file read instruction.
Body caps: init 1,536; rules/plan/task 2,560; investigate/review 2,048 bytes.
Start caps: investigate/plan/task 4 KiB; review 3 KiB. Largest payload: investigate 8 KiB,
plan/task 9 KiB via file as necessary; review estimate 2 KiB.
Policy stages 4/1.5/1.5 KiB; search map 6 KiB; refs/find/relates 4 KiB.
Report steps investigate 2 KiB, plan/task 3 KiB. Worker artifacts 64 KiB.

Do not import gitignored architecture docs into shipped runtime tests. Encode these fixtures
synthetically in tracked tests; plan validation checks its source links/manifest separately.
Protected paths from v6/41 remain byte-identical relative to the dispatch baseline; compare
actual bytes or Git diff, not only unchanged test counts. Review runner may move through its
named seam, but invocation behavior must be identical. Exceptions are enumerated in step files.

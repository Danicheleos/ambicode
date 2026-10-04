# Step 02 — Typed evidence, task directory, notes and bound promotion

## Assignment and inputs

Prerequisites: 00 and 01 integrated. Default spend $0. Own `src/task/`, note/report CLI,
legacy note/review writers' task-directory seam, guard command names, affected tests and outcomes.
Read shared contracts in full; v6/13 whole; v6/32 §1–2, §7–8; v6/12 §2.3, §3.4, §4, §8;
existing `appendLedger/readLedger`, `mintTaskSlug`, note command, review bundle ledger writer,
review-name helpers, `findSessionRepository`, filesystem/clock/id ports and CLI dispatch.
No engine implementation here. Create src/route/context.ts with the types of 01-contracts
§2 only; this is the explicit exception to the src/task ownership boundary. Step 03 owns
that file from then on and implements it. Reuse step 01's ownership types/predicate.

## Work in order

### 1. Kinds and identity

Implement `src/task/kinds.ts` with zod schemas for all 21 kinds in 01-contracts.
Required authority fields: route channel/trusted/mode/session/epoch/resumes/adopts;
step step/actor/status/cause; gate gate/class/print/question/raisedBy/object;
answers gate/instance/answer/via/object/reason/unbound; preanswer gate/option/via/trusted.
ArtifactRef includes kind/value/id/path/contentHash. Add additive route association.
Do not overload common id for gate/step/worker identifiers; document workerId interpretation.
Check summaries allow null; missing source arrays are not optional in new envelopes.

Keep extensibility for fields, skip unknown kinds, and preserve legacy note/review records.
Distinguish nonexistent/legacy ledger from unreadable route state. Unknown data must not grant
consent. Test malformed/torn line behavior and explicit ledger-unreadable failure for route use.
No runtime/test dependency on files under gym.

### 2. Append and concurrency

Implement session-scoped monotonic ids, dedupe by full id, maximum 16 KiB JSON line,
warn at 1 MiB ledger. Reuse fs.appendText and its O_APPEND port. Serialize allocation/append
for simultaneous calls in the same session as well as across processes.
Test two sessions × 200 lines and same-session concurrent calls; every line parses,
ids are unique, counters monotonic per session. Inject sessions explicitly in tests.
Do not use latest route session as caller identity. Step 03 supplies real binding.
A crash must not leave a permanent lock or silently reset an existing session's counter.

### 3. One task-directory resolver

Create `src/task/task-dir.ts` using `findSessionRepository`, TASKS_DIR and existing path helpers.
Own requirements/, steps/, plan-body, workers/, reviews/ and stop-check paths.
All module writers use it. Preserve above-repo/session resolution and reject traversal/foreign
task path for --from. Existing review writer changes directory resolution/append only;
review artifact fields remain compatible.

### 4. Notes and promotion

Extend existing CLI multiword dispatch with note save/promote/list and report, all --json.
Save kinds investigation/plan-draft/notes; --from only same task's steps/plan-body.md,
stdin otherwise, existing note size cap retained. --iteration only for notes, with exact
`<!-- ambicode iteration: N done -->` header. Draft timestamp and content hash recorded.
Retain old save --kind plan only as a transitional deprecation until step 06, with tests
and report naming the sequencing exception. It cannot be used by the new plan route.

Promotion is the **entire shared predicate in 01-contracts §6**, implemented now against
a RouteContextPort fake, not a loose “acceptance exists” scan:
owner + same chain + latest bound Accept in consent window + honoured hook/prompt origin +
same producer entry/object + current file hash + not consumed. No via:flag on any mode.
Producer window is plan-check; consent window is plan-accept. Reask does not lose draft.
Rename exact accepted draft, append promotedFrom, recover crash between rename and append,
second call plan-already-promoted exit 0. No draft → plan-draft-missing.
Object change → plan-not-accepted naming both objects/hashes; supersession → same code/reason.
Lost owner → route-taken-over before any mutation.
Keep Draft/Accepted label rendering consistent with recorded acceptance and hashing; never
alter bytes after hash verification without updating the final artifact record coherently.

Update guard reason to investigation|plan-draft|notes plus note promote.
Document errors including ledger-entry-too-large, ledger-unreadable, plan-not-accepted,
plan-draft-missing, plan-already-promoted and route-taken-over.
note list shows both legacy/new notes, promotion, iteration and first heading in stable order.

### 5. Generated report and navigation

Create deterministic report Evidence/Not verified from explicit scoped records.
Use exactly v6/13 §4 structure and hash comment. Never claim tests pass from delivery,
completion, exit zero with zero tests, or null summary. Declines, limits, missing sources,
failed/skipped reviewer, never-asked/unanswered defaults and model-set headless are visible.
Superseded evidence remains labelled historical; current evidence follows per-step windows.
A missing kind says none recorded. Once 03 ships, route reports use RouteContextPort windows;
standalone/legacy report stays usable without inventing a chain.
Navigation comes only from search entries and always says model reads not recorded.
Implement report --json and preserve bounded model-facing rendering.

## Required tests and acceptance

Add kinds, ledger, task-dir, notes, report and navigation-line tests beside source.
Promotion tests use synthetic records with real gate instance and producing note id:
S3 object swap and reaccept B (producer-window half), S10 rename recovery; Reject/default after
Accept; changed file hash; identical hash/different note identity; via:flag in trusted headless;
foreign chain/instance; missing owner; already promoted. No bare acceptance fixture grants consent.
No real route is required until 03; no fake promotion shortcut remains in product code.
Reports: same records = same bytes; scoped latest evidence; absent summaries visible;
legacy mixed ids read and new append works. A 20-entry synthetic report ≤ 3 KiB.

Run affected unit tests then npm run verify. Hand off exact kind schemas, append serialization,
RouteContextPort requirements, promotion predicate/test fixtures, error releases and legacy notices.
Implementation is ready only when every model-free proof passes; no paid eval is required here.

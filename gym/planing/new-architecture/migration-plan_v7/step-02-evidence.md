# Step 02 — Evidence: typed ledger, lock, task directory, notes, promotion, report

> Prerequisites: steps 00 and 01 integrated. Spend: $0. Read [05-working-rules.md](05-working-rules.md)
> first; it governs this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §1, §2,
> §6, §8; [v6/13](../v6/modules/13-evidence.md) §1, §3, §4, §5 and Failure modes; [v6/32](../v6/32-artifacts.md)
> §1–2; [v6/12](../v6/modules/12-route.md) §2.3 (ownership) and §3.4 (gates and objects).

## Goal

Every later step writes evidence through this step's code. Build four things: typed ledger records,
safe concurrent appends, one resolver for the task directory, and the note commands. `note promote`
implements the exact promotion predicate. Build the generated report as well. There is no engine
yet: route context is a typed port, and tests use a fake.

## Starting point

Recheck these at dispatch. Use the actual paths if step 01's integration moved them.

- `src/task/ledger.ts` (47 lines): `LEDGER_FILE`, `LedgerEntry`, `appendLedger(fs, dir, now, entry)`
  with `L<n>` ids, and a lenient `readLedger` that skips torn lines and unknown kinds.
- `src/cli/commands/note.ts` (84 lines): `note save --task --kind investigation|plan|notes`. It
  reads stdin (262,144-byte cap), writes `<stem>_<localTimestamp>.md` with `createExclusive` and a
  collision suffix, and appends `{kind:'note', note, path, contentHash}`.
- `src/review/bundle.ts`: builds the task directory with `path.join(root, TASKS_DIR, slug)` in two
  places, and appends the `review` entry.
- `src/composition/session-repository.ts`: `findSessionRepository`. `src/ports/filesystem.ts`:
  `createExclusive` (O_EXCL), `appendText` (O_APPEND), `rename`, `remove`. `src/ports/ids.ts`: `IdSource`.
- `src/util/hash.ts`: `contentHash()` → `sha256:<32 hex>`. `src/review/review-name.ts`:
  `taskSlugFor`, `localTimestamp`.
- `src/cli/main.ts`: `SPECS`, `USAGE`, `dispatch`. The multiword names are resolved at the
  `const name = …` line (`policy check`, `note save`).
- From step 01: `src/route/ownership.ts` provides `ownerOf(entries, slug)` → `owned | none | unknown`,
  with `takenOver`. `src/hook/guard/guard-core.ts` provides `noteSaveReason()`. The guard has a
  strict ledger reader and a 1 MiB `LEDGER_LIMIT`, in `src/hook/guard/guard-state.ts`.
- `src/util/skill-content.test.ts` "F3 documented outcomes": every literal
  `new AmbicodeError('<code>'` must appear in a skills Markdown file.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). As a guide, tests for this step
should total about 1,500 lines.

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/task/kinds.ts` | create | 260 | zod schemas for the 21 kinds, `ArtifactRef`, `parseEntry` |
| `src/task/ledger.ts` | change | 170 | session ids, the cap, the lenient and strict readers, `appendLedger` on the lock |
| `src/task/ledger-lock.ts` | create | 100 | `withLedgerLock`: one lock per task ledger |
| `src/task/task-dir.ts` | create | 70 | task directory paths and the `--from` check |
| `src/task/notes.ts` | create | 260 | `saveNote`, `promotePlan`, `listNotes` (no CLI parsing) |
| `src/task/report.ts` | create | 200 | `buildReport` |
| `src/task/navigation-line.ts` | create | 40 | `navigationLine` |
| `src/route/context.ts` | create | 70 | types only (01-contracts §2); step 03 owns this file from then on |
| `src/cli/commands/note.ts` | change | 150 | the `save`, `promote` and `list` wrappers and their rendering |
| `src/cli/commands/report.ts` | create | 50 | the `report` wrapper |
| `src/cli/main.ts` | change | +30 | `note promote`, `note list`, `report` in SPECS, USAGE and dispatch |
| `src/ports/ids.ts` | change | +3 | `writerId()`: 8 lowercase hex characters |
| `src/review/bundle.ts` | change | ±10 | task directory from `task-dir.ts`; append via the new `appendLedger` |
| `src/hook/guard/guard-core.ts` | change | ±4 | the `noteSaveReason` text only |
| `skills/review/references/outcomes.md` | change | — | the new codes (see Contract) |

Unchanged in this step: `skills/*/SKILL.md`, `hooks/hooks.json`, the guard's parser and decisions,
`src/route/ownership.ts`.

## Contract

```ts
// src/task/kinds.ts
export const KINDS = ['route','step','gate','acceptance','declined','default-taken','preanswer','revise',
  'limit','exit','requirement','envelope','map','search','policy','baseline','check','format','review',
  'worker','note'] as const;
export type Kind = typeof KINDS[number];
export interface ArtifactRef { kind: string; value: string; id: string; path: string; contentHash: string }
export type TypedEntry = /* discriminated union on `kind`, one member per schema below */;
export function parseEntry(raw: unknown):
  | { ok: true; entry: TypedEntry }
  | { ok: false; unknownKind: true }                 // skipped by every reader
  | { ok: false; unknownKind: false; reason: string };

// src/task/ledger.ts
export function appendLedger(fs: FileSystem, taskDir: string, now: Date, writer: string,
  entry: NewEntry): Promise<{ entry: LedgerEntry; ledgerBytes: number; warning: string | null }>;
export function readLedger(fs: FileSystem, taskDir: string): Promise<LedgerEntry[]>;          // lenient
export type StrictRead =
  | { state: 'absent' }
  | { state: 'ok'; entries: TypedEntry[] }
  | { state: 'unreadable'; reason: string; line: number | null };
export function readLedgerStrict(fs: FileSystem, taskDir: string): Promise<StrictRead>;
export const MAX_ENTRY_BYTES = 16 * 1024;   export const WARN_LEDGER_BYTES = 1024 * 1024;

// src/task/ledger-lock.ts
export interface LockedLedger { append(entry: NewEntry): Promise<LedgerEntry>; read(): Promise<StrictRead> }
export function withLedgerLock<T>(fs: FileSystem, taskDir: string, now: () => Date, writer: string,
  body: (ledger: LockedLedger) => Promise<T>): Promise<T>;

// src/task/task-dir.ts
export interface TaskDir { slug: string; root: string; repositoryRoot: string; where: string;
  ledger: string; steps: string; planBody: string; requirements: string; workers: string;
  reviews: string; stopCheck: string }
export function taskDirFor(repositoryRoot: string, slug: string, where?: string): TaskDir;   // pure
export function resolveTaskDir(runtime: Runtime, slug: string): Promise<TaskDir>;           // session-aware
export function resolveFrom(fs: FileSystem, dir: TaskDir, from: string): Promise<string>;   // only planBody

// src/route/context.ts — 01-contracts §2, plus `skill` on RouteView (decided reading D5)
export type ConsentResult =
  | { state: 'honoured'; source: AcceptanceEntry; object: ArtifactRef | null }
  | { state: 'refused'; reason: 'no-answer' | 'superseded' | 'unbound' | 'acting-needs-human' | 'not-accepted';
      source: LedgerEntry | null };

// src/task/notes.ts
export interface NoteDeps { runtime: Runtime; session: string | null; context: RouteContextPort | null;
  ledger?: LockedLedger }   // present = the caller already holds the lock (02-L7)
export function saveNote(deps: NoteDeps, input: { task: string; kind: 'investigation' | 'plan-draft' | 'notes' | 'plan';
  body: string | null; from: string | null; iteration: number | null }): Promise<SavedNote>;
export function promotePlan(deps: NoteDeps, task: string): Promise<
  { outcome: 'promoted' | 'plan-already-promoted' | 'repaired'; path: string; promotedFrom: string }>;
export function listNotes(runtime: Runtime, task: string): Promise<NoteRow[]>;

// src/task/report.ts
export function buildReport(entries: readonly LedgerEntry[], options?: { current?: (e: LedgerEntry) => boolean }):
  { evidence: string; notVerified: string; hash: string; text: string };
```

**Persisted fields.** Every entry has `id`, `at` and `kind`. Every schema is `passthrough()`, so
additive fields survive. The optional common fields are `route` (the route entry id, 01-contracts
§1) and `session`.

| kind | required | optional |
|---|---|---|
| route | skill, args, mode `interactive\|headless`, channel `hook\|cli\|harness`, trusted (must equal `channel !== 'cli'`), session, epoch ≥ 1 | resumes, adopts: true |
| step | route, step, actor `code\|model`, status `delivered\|completed\|skipped`, cause | channel, bytes, file |
| gate | route, gate, class `declared\|raised\|decision`, question, print ≥ 1 | raisedBy, object |
| acceptance, declined, default-taken | route (unless `unbound: true`), gate, instance (string or null), answer, via `hook\|flag\|prompt\|headless\|never-asked\|unanswered` | object, reason, unbound: true |
| preanswer | route, gate, option, via `prompt`, trusted | — |
| revise | route, from, via `gate\|code\|model`, cycle, reason | — |
| limit | route, which, count | step |
| exit | route, reason | detail |
| requirement | key, via, rawHash, bytes, relation, capture | derivedFrom (string or null) |
| envelope | sources[], builtFrom `captures\|args`, asked[], missingAsked[], hash | — |
| map, search, policy, baseline, format | the fields in the v6/13 §1 row, loosely typed (`unknown` where v6 gives no type) | — |
| check | key, argv[], only[], exit, phase, summary (`{ran, failed}` or null), ms | mutations |
| review | reviewId (the existing writer's fields stay as they are) | — |
| worker | worker (the definition id, D3), outcome, ms, artifact | costUsd |
| note | note `investigation\|plan-draft\|plan\|notes`, path, contentHash | iteration, promotedFrom, from |

Ids match `^L\d+$` (legacy) or `^[0-9a-z]{8}-\d+$`.

**New error codes**, each documented in `skills/review/references/outcomes.md` with its release:
`ledger-entry-too-large`, `ledger-unreadable` (release: `--task <slug>-2`), `ledger-busy`,
`session-unbound` (release: names decision 0-S), `route-busy`, `route-taken-over`,
`plan-not-accepted` (with `reason`), `plan-draft-missing`. `plan-already-promoted` is a
successful outcome, exit 0; it is documented, not raised.

## Rules

**K — kinds and reading**
- 02-K1 `parseEntry` accepts every row of the field table, and rejects a known kind that is missing
  a required field or has a wrong enum value. A record of an unknown kind is skipped by both
  readers, never rejected.
- 02-K2 Legacy records still parse: `L<n>` note entries (with `note: 'plan'|'investigation'|'notes'`)
  and the existing `review` entries. A ledger that mixes legacy and new ids reads in file order.
- 02-K3 `readLedger` (lenient) keeps the current behaviour: it skips a torn line, a non-object line,
  an unknown kind and a known kind that fails its schema. On a repeated id it keeps the first.
- 02-K4 `readLedgerStrict` returns `absent` when the file does not exist. It returns `unreadable`,
  naming the line, for a read error, a torn or non-object line, a line without `id`/`kind`, a known
  kind that fails its schema, or a repeated id. Otherwise it returns `ok`, with unknown kinds
  dropped. This matches the guard's reader and `ownerOf`'s repeated-id rule.
- 02-K5 No consumer gives authority to a field outside the schema. Passthrough fields are preserved
  on read and ignored by every predicate in this step.

**A — appending**
- 02-A1 A new id is `<writer8>-<n>`. `writer8` is the first 8 `[0-9a-z]` characters of the writer
  (the session id lowercased, or `IdSource.writerId()` for a routeless write). `n` is 1 plus the
  highest `n` already in the ledger for that `writer8`, computed under the lock. Legacy ids never
  take part in that count.
- 02-A2 One `fs.appendText` call per entry, with exactly one JSON line ending in `\n`.
- 02-A3 If the serialized entry, without the newline, is longer than 16,384 bytes,
  `appendLedger` throws `ledger-entry-too-large` and writes nothing.
- 02-A4 When the ledger is at least 1,048,576 bytes after an append, the result carries `warning`.
  The CLI prints it to stderr and names `--task <slug>-2`. The append still succeeds.
- 02-A5 `appendLedger` = `withLedgerLock(…, l => l.append(entry))`. Existing callers
  (`note.ts`, `bundle.ts`) move to it with a writer id.

**L — lock**
- 02-L1 One lock per task ledger: `<taskDir>/ledger.lock`, created with `fs.createExclusive` and
  holding `{pid, acquiredAt}`. Within one process, calls for the same ledger also queue on a
  promise chain, so two calls never compete for the lock file.
- 02-L2 When the lock is held, retry with a 10–50 ms jittered wait for up to 5 s, then throw
  `ledger-busy`. The release says to retry, and to delete `ledger.lock` only after making sure no
  ambicode process is running.
- 02-L3 A stale lock is removed and acquisition retried. A lock is stale when its `pid` is not a
  live process (`process.kill(pid, 0)` → `ESRCH`), or when its content stays unparsable for 1 s
  of this waiter's own wait. Liveness is injectable for tests.
- 02-L4 The lock is released in `finally`, including when `body` throws.
- 02-L5 Inside `body`, appends go through `ledger.append`. A nested `withLedgerLock` on the same
  ledger in the same async context throws at once (detected with `AsyncLocalStorage`). It never
  waits on itself.
- 02-L6 The lock coordinates writers; it is not route state. Nothing reads it except to acquire it.
- 02-L7 `saveNote` and `promotePlan` run their ownership check, re-read and mutation on
  `deps.ledger` when it is present and acquire no lock; without it they take exactly one
  `withLedgerLock`. CLI wrappers pass no `ledger`. A caller that already holds the lock (step 03's
  engine handlers, through `HandlerInput.ledger`) passes it, so a handler never nests an acquisition
  (02-L5).

**D — task directory**
- 02-D1 `taskDirFor` is the only place that joins `TASKS_DIR` and the slug.
  `resolveTaskDir` = `findSessionRepository`, falling back to `openRepository`, exactly as
  `note.ts` does now (the note lands below the session directory, G26). `note.ts`, `bundle.ts`,
  `notes.ts` and `report.ts` use it.
- 02-D2 A slug that sanitizes to empty, or that contains `/`, `\` or `..`, is refused with
  `bad-argument`. This is the existing `taskSlugFor` behaviour; keep its test.
- 02-D3 `resolveFrom` resolves a relative `from` against the task directory. The result must equal
  `dir.planBody` and must not be a symbolic link (`lstat`). Anything else is refused with
  `bad-argument` (field `from`). An absolute path is compared after `realpath`.

**N — note save and list**
- 02-N1 `note save --kind investigation|plan-draft|notes` takes the body from stdin, or, for
  `plan-draft` only, from `--from`. The 262,144-byte cap stays.
- 02-N2 `--iteration N` (an integer ≥ 1) is allowed only with `--kind notes`. The file's first line
  becomes `<!-- ambicode iteration: N done -->`, replacing an existing header, and the entry records
  `iteration: N`.
- 02-N3 A `plan-draft` is written as `plan-draft_<localTimestamp>.md`, with the existing collision
  suffix. Its label is `**plan draft** — acceptance is recorded by \`note promote\`, not in this file.`
  The entry is `{kind:'note', note:'plan-draft', path, contentHash, from?}`.
- 02-N4 Ownership on every `plan-draft` save goes through `ownerOf(strict entries, slug)`:
  - `none` → allowed (routeless).
  - `owned` with `session` equal to the owner → allowed; the entry carries `route` = the owner's
    `routeId`.
  - `owned`, session `null` → `session-unbound`.
  - `owned`, session in `takenOver` → `route-taken-over`, naming the owner.
  - `owned`, any other session → `route-busy`.
  - `unknown` → `ledger-unreadable`.

  The check and the append run inside one `withLedgerLock`. Nothing is written before a refusal.
- 02-N5 `--kind plan` keeps working until step 06. It prints a deprecation line to stderr and writes
  a legacy-shaped plan note with the old "**plan** — accepted" label. Such a note never satisfies,
  and never blocks, a promotion (02-P5 compares `promotedFrom` only).
- 02-N6 `note list --task <slug> [--json]` prints one row per `note` entry, in ledger order, legacy
  and new alike. Each row has: id, note kind, path, `at`, the first `#` heading of the file (or
  `—` when the file is missing), `iteration`, and the promotion link (`promoted → plan_…` on a
  draft, `from plan-draft_…` on a plan).

**P — promotion** (01-contracts §6, v6/13 §3; the checks run in this order)
- 02-P1 `session === null` → `session-unbound`.
- 02-P2 `view = context.resolve(task, session)`. If it is null or `view.skill !== 'plan'` →
  `plan-not-accepted {reason: 'no-plan-route'}`. Then `context.assertOwner(view)`, whose
  `route-taken-over` / `route-busy` passes through unchanged.
- 02-P3 `draft` is the last `note` entry with `note: 'plan-draft'` in
  `context.window(view, 'plan-check')`, the producer window (H3). If there is none →
  `plan-draft-missing`. Drafts outside that window never count.
- 02-P4 `consent = context.consent(view, 'plan-accept')`. It must be `honoured`. Its source must be
  an `acceptance` with `answer: 'Accept'`, `via` either `hook` (with a non-null `instance`) or
  `prompt`, and no `unbound`. Otherwise → `plan-not-accepted` with the consent's reason, or with
  `not-accepted`. `via: 'flag'` is refused on every channel and mode, even when the fake port
  wrongly reports it as honoured.
- 02-P5 `consent.object` must equal `{kind:'note', value:'plan-draft', id: draft.id, path:
  draft.path, contentHash: draft.contentHash}` on all five fields. Otherwise →
  `plan-not-accepted {reason: 'object-changed'}`, naming both paths and both 12-character hash
  prefixes. Identical bytes in a different draft entry do not match.
- 02-P6 If a `note` with `note: 'plan'` and `promotedFrom === draft.id` exists → outcome
  `plan-already-promoted`, exit 0. Print the plan path, rename nothing, append nothing.
- 02-P7 Mutation, inside one `withLedgerLock`, with `assertOwner` re-run first:
  - Draft file present: its bytes must hash to `draft.contentHash` (else `object-changed`). Rename
    it to `plan_<same timestamp and suffix>.md`, bytes unchanged. Append `{kind:'note', note:'plan',
    path, contentHash: draft.contentHash, promotedFrom: draft.id, route: view.routeId}`.
  - Draft file absent and plan file present with that hash (a crash between rename and append):
    append the same entry, rename nothing → outcome `repaired`.
  - Neither file present → `plan-draft-missing`.
- 02-P8 A refusal leaves the draft file and the ledger untouched, so re-asking `plan-accept` can
  still promote the same draft without another plan-write or plan-check.

**R — report and navigation**
- 02-R1 `buildReport` prints the v6/13 §4 skeleton: an `Evidence` block with the lines
  Requirements, Map, Navigation (CLI calls), Baseline, Checks, Review, Decisions and Revisions, in
  that order, then a `Not verified` block. A line with no records reads `<Name>: none recorded`.
  `text` ends with `<!-- ambicode report <hash> -->`, where `hash = contentHash(evidence + '\n' +
  notVerified)`.
- 02-R2 Checks: for each `key`, the entries in order, joined by `→`. A test count is shown only from
  `summary`. These go into `Not verified`: `summary: null` (exit only, test count unknown),
  `summary.ran === 0`, a declined key, and a nonzero last exit. Nothing ever says tests passed from
  a `step` record, a delivery or an exit code alone.
- 02-R3 These also go into `Not verified`: each `declined`; each `default-taken`, with its `via`
  (`never-asked`, `unanswered`, `headless`); each `limit`; each `envelope.missingAsked` item; a
  `review` with `reviewerRan: false` or a non-complete status, with its omissions; and a `route`
  with `mode: 'headless'` and `channel: 'cli'` ("headless set by an untrusted start").
- 02-R4 When `options.current` returns false for an entry, the report still shows it, suffixed
  `(historical)`. Without `current` every entry is current. Step 03 supplies `current` from its
  windows; this step invents no chain.
- 02-R5 The same entries give the same bytes. For 20 typical entries, `text` is at most 3,072 bytes.
- 02-R6 `navigationLine` reads only `search` entries: `Navigation (CLI calls): refs x1 (3 names),
  find x2 — model reads not recorded`, or `Navigation (CLI calls): none recorded — model reads not
  recorded`.
- 02-R7 `report --task <slug> [--json]` prints `text` (with `--json`: `{evidence, notVerified, hash}`).

**G — guard text**
- 02-G1 `noteSaveReason` names `note save --task <slug> --kind investigation|plan-draft|notes` and
  `note promote --task <slug>`. Update its test. No other guard change.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 The writer id for a routeless write comes from `IdSource.writerId()`. No session is ever
  inferred from the ledger (01-contracts §1).
- D2 In this step the CLI always passes `session: null` and `context: null`. Session transport is
  step 03's (0-S). So at runtime a `plan-draft` save on a task with a live plan chain refuses with
  `session-unbound`, and `note promote` always does. Tests inject sessions and a fake port.
- D3 The `worker` kind serializes its definition id as the field `worker`, the same pattern as
  `gate` and `step`. Internally it is `workerId`. Common `id` stays the ledger id.
- D4 Module kinds whose writers come later (map, search, policy, baseline, format) get only the
  v6/13 field list, loosely typed. Their owning step tightens the schema in `kinds.ts`.
- D5 `RouteView` gains `skill: string`. This is an explicit type for an existing design field,
  needed by 02-P2. All other `RouteView` and `RouteContextPort` members are exactly as written in
  01-contracts §2.
- D6 Promotion does not change bytes. The draft label never claims acceptance, so the renamed file
  stays truthful. The plan's `contentHash` is the draft's (01-contracts §6, "preserve the
  authoritative hash").
- D7 A lock steal can race when a holder crashed and two or more waiters see it stale at the same
  moment. This is accepted and documented in a code comment; it is a non-goal.

## Non-goals (a reviewer may not raise these)

- No engine, fold, step windows, consent evaluation or ownership resolution beyond calling `ownerOf`.
  `RouteContextPort` has no implementation here; fakes live in tests only.
- No session transport, no hook changes, no `active-route` writer.
- Report windows are not computed here: `current` is a parameter.
- No Stop hook, step payload files, requirement captures, workers or `plan check`.
- No change to any `SKILL.md`; `--kind plan` remains (step 06 removes it).
- No ledger compaction or rotation. No migration or rewrite of existing lines. No change to legacy ids.
- No multi-host or network-filesystem locking, no lock fairness, no protection against a hostile
  local process (01-contracts §5). The steal race of D7 stays as it is.
- No change to guard parsing or guard decisions; only the reason text (02-G1).
- No `task --plan`, `--from-draft`, `route status` or `report` route scoping.

## Tests

Name each test after its rule. Use real temporary directories for files and the lock. Inject
clocks, writers, sessions and the context port. No test reads anything under `gym/`.

1. `kinds.test.ts`: one valid and one invalid record per kind (02-K1, table-driven); legacy note and
   review records (02-K2); a passthrough field is preserved and ignored (02-K5).
2. `ledger.test.ts`:
   - lenient versus strict on the same corrupted fixtures: torn last line, non-object line,
     repeated id, schema violation, unknown kind (02-K3, 02-K4);
   - `absent` versus legacy-only `ok` (02-K4);
   - id allocation per writer, legacy ids ignored (02-A1);
   - 16,384 bytes accepted and 16,385 refused with nothing written (02-A3);
   - the warning at 1 MiB (02-A4).
3. `ledger-lock.test.ts`:
   - two child processes × 200 appends with different writers, then the same writer, then 50
     concurrent in-process calls. Every line parses, ids are unique, and `n` is contiguous per
     writer (02-L1, 02-A1);
   - a stale lock with a dead pid, and an unparsable lock (02-L3);
   - a held lock times out with `ledger-busy`, with a shortened timeout injected (02-L2);
   - `body` throws and the lock is released (02-L4);
   - nested acquisition throws (02-L5).
   - `saveNote` and `promotePlan` with `deps.ledger` inside one `withLedgerLock` succeed and
     append through it; without `deps.ledger` they acquire the lock themselves (02-L7).
4. `task-dir.test.ts`: paths (02-D1); slug refusal (02-D2); `--from` accepted for `planBody`;
   refused for another task, a traversal, an absolute path elsewhere, and a symlink (02-D3).
5. `notes.test.ts`, save and list (02-N1 … 02-N6): kinds; iteration header and refusal on other
   kinds; draft label and entry; every `ownerOf` branch with the nothing-written check; deprecation
   of `--kind plan`; list ordering over a mixed legacy and new ledger.
6. `notes.test.ts`, promotion (02-P1 … 02-P8). Fixtures are synthetic ledgers with real gate
   instances and real producing note ids, plus a fake `RouteContextPort` driven by them:
   - accept A → promoted; a second call → `plan-already-promoted`, exit 0, no second entry (S3, end);
   - accept A, save B → `object-changed`, naming both. Re-accept bound to B → promoted, with no new
     plan-write or check entry (S3, producer half);
   - Reject, Revise or default after Accept → `superseded`;
   - `via: 'flag'` reported as honoured by a wrong port → refused (02-P4);
   - changed file bytes → `object-changed`;
   - an identical hash from a different note id → `object-changed` (02-P5);
   - a foreign chain or instance, no plan route, `assertOwner` refusal, and a null session;
   - crash injected after the rename, before the append → the next call reports `repaired`, renames
     nothing, needs no new consent (S10);
   - a draft outside the plan-check window is ignored (02-P3).
7. `report.test.ts`: the skeleton and `none recorded` lines (02-R1); every 02-R2 and 02-R3 case;
   `(historical)` (02-R4); byte-identical output, and the 20-entry ≤ 3,072-byte check (02-R5);
   the navigation line, both forms (02-R6).
8. CLI tests (extend `note.test.ts` and `cli.test.ts`): `note promote` → `session-unbound` (D2);
   `note list --json` and `report --json` shapes (02-R7); the 1 MiB warning on stderr.
9. The guard reason test (02-G1). The F3 outcomes test passes with the new codes documented.

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass.
- [ ] `npm run verify` is green; the report states the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff` of `skills/*/SKILL.md`, `hooks/hooks.json` and `src/route/ownership.ts` is empty.
- [ ] The report follows 05-working-rules §4.

## Hand-off to step 03

- Step 03 owns `src/route/context.ts` and implements `RouteContextPort` over `readLedgerStrict` and
  `ownerOf`. It must not write a second ledger reader or a second ownership predicate.
- Step 03 replaces `session: null` / `context: null` in the CLI wrappers with the 0-S transport and
  the real port. Wrappers then add the command tail (01-contracts §3).
- Claims and writes run inside `withLedgerLock` and append through `ledger.append`. Code that
  already holds the lock calls `saveNote`/`promotePlan` with `deps.ledger` (02-L7).
- The promotion fixtures (S3 and S10 halves) are reused against the real port in step 03 and the
  real route in step 06.
- Interplay: the guard denies plan-body writes when the ledger exceeds 1 MiB (step 01). The 02-A4
  warning fires at the same size; both name `--task <slug>-2`.

## Coverage of the v6 brief

| v6 step-02 requirement | Here |
|---|---|
| zod schemas for all 21 kinds; the listed authority fields; ArtifactRef; route association | Contract table, 02-K1 |
| Do not overload `id` for gate, step or worker; document the worker id | Contract table, D3 |
| Check summaries allow null; envelope source arrays required | Contract table, 02-R2 |
| Extensibility; skip unknown kinds; preserve legacy note and review records | 02-K1, 02-K2, 02-K5 |
| Missing or legacy ledger versus unreadable route state; unknown data grants no consent; torn-line tests | 02-K3, 02-K4, 02-K5 |
| No runtime or test dependency on `gym/` | Tests preamble |
| Session ids, dedupe by full id, 16 KiB, warn at 1 MiB, reuse `appendText` | 02-A1 … 02-A4, 02-K3 |
| Serialize same-session and cross-process; two sessions × 200; injected sessions | 02-L1, test 3 |
| Never use the latest route's session; step 03 supplies binding | D1, D2 |
| No permanent lock after a crash; no counter reset | 02-L3, 02-A1 |
| One task-directory resolver owning the listed paths; all writers use it; above-repo resolution; `--from` traversal | 02-D1 … 02-D3 |
| Review writer changes directory resolution and append only | Files (`bundle.ts`), 02-A5 |
| `note save`, `promote`, `list` and `report`, all `--json` | 02-N1, 02-N6, 02-R7, Contract |
| Kinds; `--from` only `plan-body`; stdin; cap; `--iteration` header; timestamp and hash | 02-N1 … 02-N3 |
| `--kind plan` transitional until step 06, not usable by the new route | 02-N5 |
| Full shared predicate against a fake port; producer and consent windows; no `via:flag`; re-ask keeps the draft | 02-P1 … 02-P8 |
| Rename, `promotedFrom`, crash repair, `plan-already-promoted`, `plan-draft-missing`, `object-changed`, superseded, `route-taken-over` before mutation | 02-P2, 02-P5 … 02-P7 |
| Labels consistent with acceptance and hashing | 02-N3, D6 |
| Guard reason update | 02-G1 |
| Document the new codes | Contract (error codes), test 9 |
| `note list` contents and stable order | 02-N6 |
| Deterministic report; v6/13 §4 structure and hash comment; never claim tests pass | 02-R1, 02-R2 |
| Declines, limits, missing sources, reviewer failure, defaults and model-set headless visible | 02-R3 |
| Historical evidence labelled; `none recorded`; route windows from step 03; standalone report works | 02-R1, 02-R4 |
| Navigation only from `search` entries, "model reads not recorded" | 02-R6 |
| Tests beside source; S3 and S10 mechanisms; no bare-acceptance fixture; no fake promotion shortcut | Tests 1–9, 02-P4 |
| Same records give same bytes; scoped latest evidence; absent summaries; mixed ids; 20 entries ≤ 3 KiB | 02-R2, 02-R4, 02-R5, 02-K2 |
| `context.ts` types only, then owned by step 03; reuse step 01's predicate | Files, 02-N4, Hand-off |

# Step 2 — Evidence: ledger kinds, session-scoped ids, notes (draft first, promote, list), report

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: none needed — `confirmed`

## Why this step exists

Every later module writes evidence and the route engine folds over it (R3). The ledger exists at
HEAD with two kinds (`note` from `src/cli/commands/note.ts:78`, `review` from
`src/review/bundle.ts:391`) and ids `L<n>`. v5 needs 21 kinds with declared fields, ids that two
sessions can append without colliding, a plan that is a draft before anyone is asked (D11),
promotion on record, a note list, and a generated report skeleton. Design:
[../v5/modules/13-evidence.md](../v5/modules/13-evidence.md) (whole),
[../v5/32-artifacts.md](../v5/32-artifacts.md) §1, §2, §7; [../v5/41-migration.md](../v5/41-migration.md) step 2.

## Read first

1. `CLAUDE.md`.
2. `../v5/modules/13-evidence.md` whole; `../v5/32-artifacts.md` §1, §2, §7; `../v5/modules/12-route.md`
   §3.4 (which `acceptance` honours an acting option — `note promote` depends on it) and §4 (the
   fold reads what you write; you do not build the fold here); `../v5/01-goals-and-constraints.md`
   D11, R3, R5, M20.
3. Code: `src/task/ledger.ts`, `src/task/ledger.test.ts`, `src/task/slug.ts`, `src/cli/commands/note.ts`,
   `src/cli/commands/note.test.ts`, `src/review/bundle.ts:385-400` (the `review` writer),
   `src/review/review-name.ts` (`taskSlugFor`, `localTimestamp`), `src/composition/session-repository.ts`
   (`findSessionRepository`: where a task directory is resolved from the session directory),
   `src/cli/main.ts` (`SPECS`, `USAGE`, the `note save` two-word command handling at `:217-218`),
   `src/hook/guard-core.ts` `noteSaveReason` (the deny message names the kinds), `src/config/defaults.ts`
   (`TASKS_DIR`, `IGNORE_ENTRIES`).

## Deliverables

### 1. `src/task/kinds.ts` — the 21 kinds (13 §1)

A zod schema per kind with the fields 13 §1 lists (unknown extra fields allowed on write; readers
skip unknown **kinds**, not unknown fields). `KINDS` exported as a const array; a test asserts
`KINDS.length === 21` and that every kind named anywhere in `../v5/modules/13-evidence.md` §1 is
present (parse the table in the test with a regex over the design file so the two cannot drift —
the design file is read-only input to the test). Fields that matter to other steps and must be
spelled exactly: `acceptance|declined|default-taken` carry `gate`, `answer`, `via` with the six
values `hook|flag|prompt|headless|never-asked|unanswered`; `preanswer` carries `gate, option, via: 'prompt'`;
`revise` carries `from, via: 'gate'|'code'|'model', cycle, reason`; `note` carries
`kind, path, contentHash, iteration?, promotedFrom?`; `check` carries `key, argv, only[], exit, phase,
summary: {ran, failed} | null, ms, mutations`; `map` carries `layers: [{name, ms, hits}]`.

### 2. Ids `<session8>-<n>` (13 §1, #53)

Change `appendLedger` so an id is `<key>-<n>`: `key` is 8 lowercase hex/alnum characters derived
from the session; `n` is monotonic **per key** over the entries already in the file. Readers dedupe
on the full id. Resolution of the session key, in this order (the design says ids carry the session
but not how a CLI process learns it; this order is the implementation's reading — put it in the
report under Deviations/interpretations):

1. an explicit `session` passed by the caller (the hook knows `session_id`; the engine passes it);
2. `process.env.CLAUDE_SESSION_ID` if Claude Code sets it for Bash tool children — check the
   documentation once and record the answer (yes/no, source) in the report;
3. the `session` field of the latest `route` entry in the same ledger (the engine writes it in step 3);
4. a per-process random 8-character token.

Legacy ids `L<n>` keep reading. Two writers appending concurrently must not tear a line: open with
`O_APPEND` (`fs.appendText` already does; verify the port) and write each line in one call; test
with two processes appending 200 lines each and assert every line parses and ids are unique.
No entry over 16 KB (32 §2): a payload larger than that goes to a file under the task directory and
the entry holds `path` and `hash`; `appendLedger` refuses a larger entry with `ledger-entry-too-large`.

### 3. Notes (13 §3)

CLI, replacing today's `note save` and adding two commands (register in `SPECS`; keep the two-word
command handling pattern of `main.ts:217`):

```
$A note save --task <slug> --kind investigation|plan-draft|notes [--from <path>] [--iteration N] [--json]
$A note promote --task <slug> [--json]
$A note list --task <slug> [--json]
```

- `--kind plan` **stays accepted in this step** with a one-line stderr deprecation notice naming
  `plan-draft` + `note promote`; it is removed in step 6 when the plan route ships (the v0.4.0 plan
  skill still saves `--kind plan` until then). Record this sequencing choice in the report.
- `plan-draft`: stem `plan-draft`, stamped, label `**plan draft** — not accepted`. Promotion renames
  the latest `plan-draft_<ts>.md` to `plan_<ts>.md` (same timestamp) and appends
  `note {kind: 'plan', path, contentHash, promotedFrom: <draft path>}`.
- `note promote` runs **only** when the ledger holds an `acceptance {gate: 'plan-accept'}` with
  `via: 'hook' | 'prompt'`, or `via: 'flag'` **and** the latest `route` entry of the task has
  `mode: 'headless'` (12 §3.4). Otherwise `plan-not-accepted` (code), message naming the gate. No
  draft → `plan-draft-missing`, release text "write `steps/plan-body.md`; the route saves the draft".
  In this step nothing writes `acceptance` or `route` entries; the predicate is implemented over
  ledger entries and tested with synthetic ledgers.
- `--from <path>` accepts only `.ambicode/task/<slug>/steps/plan-body.md` of the same task (absolute
  or repository-relative); anything else → `bad-argument` naming the one allowed path. Body from
  stdin otherwise (as today, `MAX_NOTE_BYTES`).
- `--iteration N` is valid with `--kind notes` only; it writes the first line
  `<!-- ambicode iteration: N done -->` (machine-readable header, 13 §3) and the usual label after it.
- `note list` prints, per note: kind, path, local time, first heading, iteration header if any,
  `promotedFrom` if any; `--json` gives the same as an array. Sorted by time.
- Guard: update `noteSaveReason` in `src/hook/guard-core.ts` to name
  `note save --task <slug> --kind investigation|plan-draft|notes` and `note promote`; update its test.
- `USAGE` in `main.ts` documents the three commands; `skills/review/references/outcomes.md` gains
  `plan-not-accepted`, `plan-draft-missing`, `ledger-entry-too-large`.

### 4. Task directory (32 §1)

`src/task/task-dir.ts`: one function that resolves `.ambicode/task/<slug>/` from a `Runtime` through
`findSessionRepository` (the same way `note save` does today), creates it on first write, and knows
the sub-paths `ledger.jsonl`, `requirements/`, `steps/`, `steps/plan-body.md`, `workers/`,
`reviews/`, `stop-check.md`. Every writer in later steps uses it; `note.ts` and `bundle.ts` switch
to it now.

### 5. `src/task/report.ts` and `$A report --task <slug> [--json]` (13 §4)

Generates **Evidence** and **Not verified** from the ledger, with the line shapes of 13 §4's
example. A section whose kind has no entry prints the line as absent (`Map: none recorded`), never
omits it (CLAUDE.md "never let a change make the output look cleaner than the reality"). Output ends
with an HTML comment carrying a hash of the two sections (`<!-- ambicode report <sha256-12> -->`),
which the Stop hook (step 3) uses when present (P6). Keep it deterministic: same ledger → same text.

### 6. `src/task/navigation-line.ts` (13 §5)

`navigationLine(entries)` from `search` entries only:
`Navigation (CLI calls): refs x1 (3 names), find x2 — model reads not recorded`. With no `search`
entry: `Navigation (CLI calls): none — model reads not recorded`. Used by `report` and, in step 3,
by the report step.

### 7. Compatibility

A v0.4.0 task directory (ids `L<n>`, kinds `note`/`review`) must still: be read by `note list`,
appear in `report` as what it has, and accept new entries with the new ids beside the old ones.
Test with a fixture ledger that has both id styles.

## Proofs

- `npm run verify` green; tests: `src/task/kinds.test.ts`, `ledger.test.ts` (ids, dedupe,
  concurrency, size cap, legacy ids), `note.test.ts` (kinds, `--from` rule, `--iteration`, promote
  with/without an honoured acceptance incl. the headless `via: flag` case, list ordering,
  deprecation of `--kind plan`), `report.test.ts` (absent sections present, hash comment,
  determinism), `navigation-line.test.ts`.
- Byte check: `$A report` on a 20-entry synthetic ledger ≤ 3 KB (30 §3 report step cap for task).
- `node fixtures/materialize.mjs ts-feature-boundary <tmp>`, then in `<tmp>`: `note save --kind
  investigation` from stdin, `note save --kind plan-draft --from .ambicode/task/<slug>/steps/plan-body.md`
  (create the file first), `note promote` → `plan-not-accepted`; append a synthetic
  `acceptance {gate: plan-accept, via: hook}` line by test code (not by the CLI) → `note promote`
  renames and appends. Show the ledger in the report (synthetic, not NDA).

## Do not

- Do not implement the fold, `route status`, gates, or any `route`/`step`/`gate`/`acceptance`
  **writer** (step 3). Writing those kinds from tests is fine.
- Do not remove `--kind plan` yet (step 6).
- Do not add `--layers`, `map`, or `search` writers (step 5); do not touch `prepare.ts` beyond
  pointing it at `task-dir.ts` if it resolves the directory itself.
- Do not change the `review` entry's fields in `bundle.ts` ("unchanged fields", 13 §1).
- Do not write hook code (the Stop hook reads the report hash in step 3).

## Done when

All six deliverables exist with their tests, the fixture walk-through in Proofs is shown, `verify` is
green, and the report lists the session-key resolution order and the `--kind plan` sequencing under
Deviations/interpretations.

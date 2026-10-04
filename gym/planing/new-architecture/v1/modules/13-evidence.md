# Module: Evidence (ledger, notes, task directory, report)

## Purpose

Turn claims into records (R3). Everything the report says about what ran, what was found, what
was decided and what was skipped must point at a ledger line written by code. The module also
owns the one directory a task lives in, so investigate, plan, task and review share it (G16).

## Inputs

- Writes from modules and hooks: Search (`map`, `search`), Requirements (`requirement`), Policy
  (`policy`), Checks (`baseline`, `check`, `format`), Reviewer (`review`), Route (`route`, `step`,
  `gate`, `acceptance`, `declined`, `default-taken`, `limit`, `exit`, `worker`), the model through
  `note save` (`note`) and through recorded tool calls (`tool`).
- Reads from the Route engine (fold), `report`, `route status`, the Stop hook, and the next skill
  (`note list`).

## Outputs

- `.ambicode/task/<slug>/ledger.jsonl`, append-only, CLI-written, agent-unwritable (guard).
- `.ambicode/task/<slug>/{investigation_<ts>.md, plan_<ts>.md, plan-draft_<ts>.md, notes.md}`.
- `.ambicode/task/<slug>/steps/<id>.md` for payloads over the inline window.
- `.ambicode/task/<slug>/reviews/<reviewId>/…` (unchanged).
- `$A report --task <slug>`: the **Evidence** and **Not verified** sections, generated.
- The **navigation line**, generated from `search` and `tool` entries, never typed by the model.

## Workflow

### 1. Ledger kinds (v2)

| kind | written by | fields | used for |
|---|---|---|---|
| `route` | Route | skill, args, budget, epoch, mode | fold start |
| `step` | Route | id, channel, bytes, file? | position, context accounting |
| `gate` / `acceptance` / `declined` / `default-taken` | Route, AskUserQuestion hook | gate, question, answer (human's words), via | releases, "accepted" claims |
| `limit` / `exit` | Route | which, count / reason, detail | stop reason first in the report |
| `requirement` | Requirements | id, url, via, rawHash, normalizedHash, relation (`asked`/`child`/`parent`/`link`), bytes | envelope integrity, expansion evidence |
| `map` | Search | terms, pass (1/2), layers used, candidates[path, score], index {tool, builtMs, fresh}, bytes | shortlist discipline, index freshness |
| `search` | Search | command (`refs`/`find`/`relates`), symbol, files, ms, tool | the navigation line |
| `tool` 🆕 optional | PostToolUse recorder on `Read\|Grep\|Glob\|LSP` | tool, path or pattern, bytes | the navigation line for model-made calls; see §5 cost |
| `policy` | Policy | stage, packs, rules count, omitted | "rules applied" claims |
| `baseline` | Checks | head, dirty[], at | task scoping (F5) |
| `check` | Checks | key, argv, only[], exit, phase (`red`/`green`/`review`), ms, mutations | red/green proof |
| `format` | Checks | key, files, exit | formatter ran |
| `review` | Reviewer | reviewId, status, reason, reviewerRan, findings, omissions, waiting[] | unchanged |
| `worker` | Workers | id, outcome, costUsd?, ms, artifact | subagent evidence |
| `note` | `note save` | kind, path, contentHash | note exists |

Readers skip unknown kinds (unchanged rule). Ids `L1…`, timestamps from the clock, `O_APPEND`.

### 2. Slug

Unchanged from v0.4.0 slice 4: ticket key, else kebab of the request, else `task-<hash>`. The route
engine mints it once at `route start`; every later command takes `--task <slug>`. A review without a
route (`/ambicode:review` on uncommitted work) names its directory as today.

### 3. Notes

```
$A note save --task <slug> --kind investigation|plan|plan-draft|notes   (body on stdin)
$A note list --task <slug> [--json]
```

- `plan-draft` 🆕: labelled "**plan draft** — not accepted". Written when the plan route ends with
  `default-taken` on the acceptance gate (M13). `plan` is written only when the ledger holds an
  `acceptance` for that route; otherwise `note save --kind plan` refuses with `plan-not-accepted`
  and names the draft kind. This is the G13 check, done by the CLI at save time instead of by a
  hook with a time window (which was built and reverted).
- `note list` prints kind, path, time, first heading; `plan` reads it, `task` reads it.
- The guard's command parser (15-guard §2) must accept every shape of `note save` the model produces
  (`cd X && …`, heredoc bodies with `=>` and `.ambicode/task` inside). M12 is the regression test.

### 4. Report skeleton

```
$A report --task <slug> [--json]
```

Prints, from the ledger only:

```
Evidence
  Requirements: ORD-17 (asked), ORD-18, ORD-19 (children) — hashes recorded
  Map: pass 1 (3 terms, 15 candidates), pass 2 (5 identifiers, 9 candidates); index codeindex, 0.5 s
  Navigation: refs x3, find x2 (CLI); Read x7, Grep x2 (recorded)       <- generated, not typed
  Baseline: a1b2c3d, dirty: README.md
  Checks: web/unit --only validate.spec.ts  red exit 1  → green exit 0
  Review: local_2026-10-03T11-02 complete, 2 findings
  Decisions: "Accept and save" (AskUserQuestion, 11:04)
Not verified
  web/e2e: declined by the human (key web/e2e)
  Map pass 2 skipped: repeat limit (2)
  Review omitted 1 file: main/assets/i18n/en.json (over 262,144 bytes)
```

The model writes **Done** and **Remaining** (or Confirmed facts / Assumptions / Unresolved for an
investigation) and pastes the two generated sections unchanged. The Stop hook checks they are present
and unchanged (hash of the generated text embedded as an HTML comment).

### 5. The recorded navigation line

Code-made search calls are in the ledger already (`search`). Model-made `Read`/`Grep`/`Glob`/`LSP`
calls are visible only to a `PostToolUse` hook. Two options, to be chosen by measurement:

| Option | Cost | Evidence quality |
|---|---|---|
| A. Recorder hook on `Read\|Grep\|Glob\|LSP` | one node spawn per call: 34 ms standalone (M15); 25 calls/run ≈ 0.85 s; no model context | complete |
| B. No recorder; the line lists CLI calls only and says "model reads not recorded" | 0 | partial, honest |

Default **A**, standalone bundle (no imports, like `guard.mjs`), appending one JSON line, no reading.
Kill criterion: if the recorder adds more than 2 s to a 30-call run, fall back to B.

## Interfaces

```ts
interface Evidence {
  append(task, entry): Promise<LedgerEntry>;
  read(task): Promise<LedgerEntry[]>;
  fold(task, route): Position;                 // used by Route
  report(task): { evidence: string; notVerified: string; hash: string };
  navigationLine(task): string;
  notes: { save(task, kind, body): Promise<Path>; list(task): Promise<NoteRef[]> };
}
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| Two sessions append at once | `O_APPEND` keeps lines whole; ids may collide; the fold tolerates duplicate ids (first wins) |
| Ledger over 1 MB (a long task) | `report` and `fold` still read it whole; a 1 MB cap warns; `route start --task <slug>-2` is the release |
| `note save` from outside the repository | resolved like the hook (G26, fixed) |
| The model edits a note file directly | denied by the guard; the deny names `note save` |
| The generated report sections are edited by the model | the Stop hook sees the hash mismatch and blocks once with "paste unchanged" |

## What changes from v0.4.0

- Ledger grows from 2 kinds to 16. `plan-draft` kind. `note list`. `report`. Navigation line generated.
- `plan` save refuses without an acceptance entry (CLI check, not a hook).

## Open problems

- P5 The recorder hook (option A) spawns on every read. 34 ms each was measured for the guard; the
  recorder is similar, but 0.85 s per run is a guess until timed.
- P6 "Hash of the generated section embedded in the report" assumes the model pastes the comment too;
  Sonnet may strip it. Fallback: the Stop hook compares the section text by normalized diff.

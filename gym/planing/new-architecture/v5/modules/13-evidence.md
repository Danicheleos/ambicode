# Module: Evidence (ledger, notes, task directory, report)

## Purpose

Turn claims into records (R3): what ran, what was found, what was decided, what was skipped, what
was revised, each a ledger line written by code. Own the one directory a task lives in (G16).

## Inputs

Writes from modules and hooks (Search `map`/`search`; Requirements `requirement`/`envelope`; Policy
`policy`; Checks `baseline`/`check`/`format`; Reviewer `review`; Route `route`/`step`/`gate`/
`acceptance`/`declined`/`default-taken`/`revise`/`limit`/`exit`/`worker`; `note save` and `note
promote` → `note`). Reads from the Route fold, `report`, `route status`, the Stop hook, `note list`.

## Outputs

- `.ambicode/task/<slug>/ledger.jsonl`, append-only, CLI-written, agent-unwritable.
- Notes: `investigation_<ts>.md`, `plan_<ts>.md`, `plan-draft_<ts>.md`, `notes.md`.
- `steps/<id>.md` (payloads over the window; `steps/plan-body.md`, the one model-writable file).
- `requirements/<key>.json` (captured payloads, 14 §3). `workers/…`. `reviews/<id>/…` (unchanged).
- `$A report --task <slug>`: **Evidence** and **Not verified**, generated.
- The navigation line, generated from `search` entries, labelled "CLI calls; model reads not recorded".

## Workflow

### 1. Ledger kinds (v4: 21)

| kind | written by | fields |
|---|---|---|
| `route` | Route | skill, args, mode, session, epoch |
| `step` | Route | id, channel, bytes, file?, skipped?, cause (`route-next` \| command name \| `gate-hook`) |
| `gate` | Route, AskUserQuestion hook | id, class (`declared\|raised\|decision`), raisedBy?, question, asked (count) |
| `acceptance` / `declined` / `default-taken` | Route, AskUserQuestion hook | gate, answer (human's words), **via: hook\|flag\|prompt\|headless\|never-asked\|unanswered** |
| `preanswer` 🆕 | Route (`route start --answer`) | gate, option, via: `prompt`; consumed into `acceptance {via: prompt}` when the gate is reached (12 §2.4); written only for a hook-channel or headless start (#102) |
| `revise` | Route | from (stepId), via (`gate\|code\|model`), cycle, reason |
| `limit` / `exit` | Route | which, count, step? / reason, detail |
| `requirement` | MCP hook | key, via (tool), rawHash, bytes, relation, derivedFrom, capture (path) |
| `envelope` | Requirements | sources[], builtFrom: `captures\|args`, hash |
| `map` | Search | terms by pass, **layers [{name, ms, hits}]**, candidates, collisions, index status, bytes |
| `search` | Search | command, names, files, ms |
| `policy` | Policy | stage, packs, rules, omitted |
| `baseline` | Checks | head, dirty[] |
| `check` | Checks | key, argv, only[], exit, phase, **summary {ran, failed} or null**, ms, mutations |
| `format` | Checks | key, files, exit, via (`model`) |
| `review` | Reviewer | unchanged fields |
| `worker` | Workers | id, outcome, costUsd?, ms, artifact |
| `note` | `note save`, `note promote` | kind, path, contentHash, iteration?, promotedFrom? |

Readers skip unknown kinds. **Ids are `<session8>-<n>`** (`a1b2c3d4-9`), monotonic per session,
unique across sessions appending to one file; readers dedupe on the full id (#53). Clock timestamps,
`O_APPEND`. Removed from v1: the `tool` kind (no recorder ships, §5). Today's **two** kinds are `note`
(`src/cli/commands/note.ts:78`) and `review` (`src/review/bundle.ts:391`, written when a review runs
with a task directory); `prepare.ts:138` is a `policyProvenance` entry, not a ledger line (#91, #110).

### 2. Slug

Unchanged: ticket key, else kebab, else `task-<hash>`; minted at `route start`.

### 3. Notes

```
$A note save --task <slug> --kind investigation|plan-draft|notes [--from <path>] [--iteration N]   (body on stdin or --from)
$A note promote --task <slug>                       # latest plan-draft → plan, on acceptance
$A note list --task <slug> [--json]
```

- **A plan is always a draft first (D11).** The plan route's code step saves `plan-draft` from
  `steps/plan-body.md` as soon as the body exists — before `plan check` and before the acceptance
  gate — so an unexpected end of the session loses nothing. `note promote` renames the latest
  `plan-draft_<ts>.md` to `plan_<ts>.md` and appends `note {kind: plan, promotedFrom}`; it runs only
  when the ledger holds an `acceptance {gate: plan-accept}` with `via: hook|prompt`, or `via: flag`
  **in a headless route** (12 §3.4). Otherwise `plan-not-accepted`. `note save --kind plan` does not
  exist; the only way to a `plan` is promotion.
- `--from <path>` accepts only `steps/plan-body.md` of the same task (the guard allows that one write,
  15 §1): the plan is emitted once (M20).
- `--iteration N` on `notes` writes a machine-readable header `<!-- ambicode iteration: N done -->` that
  the task route reads when resuming.
- `note list` prints kind, path, time, first heading, iteration header, promotion. `task` opens the
  latest `plan` by default, `--plan <file>` picks another, `--from-draft` accepts a `plan-draft` on record.

### 4. Report skeleton

```
$A report --task <slug> [--json]
```

```
Evidence
  Requirements: ORD-17 (asked), ORD-18, ORD-19 (children) — captured, hashes a1b2c3d4-2…4
  Map: layers shortlist→harvest→shortlist (0.9 s); pass 1 (3 terms, 15 candidates), pass 2 (5 names, 9 candidates); 1 colliding name; index none
  Navigation (CLI calls): refs x1 (3 names), find x2 — model reads not recorded
  Baseline: a1b2c3d, dirty: README.md
  Checks: web/unit --only validate.spec.ts  red exit 1 (1 ran, 1 failed) → green exit 0 (1 ran, 0 failed)
  Review: local_2026-10-03T11-02 complete, 2 findings
  Decisions: plan-accept "Accept" (via hook, 11:04); review-offer "run" (answered in the prompt, before the artifact existed)
  Revisions: plan-write ×2 (plan check: 2 bad anchors → 0)
Not verified
  web/e2e: declined (key web/e2e)
  Ground: repeat limit (2)
  Review omitted: main/assets/i18n/en.json (over 262,144 bytes)
  Gate scope-expanding: default-taken (never-asked) → out of scope
```

The model writes **Done** and **Remaining** (or Confirmed facts / Assumptions / Unresolved) and
pastes the generated sections. The Stop hook compares them by normalized diff (P6; a hash comment is
embedded too, used when present).

### 5. The navigation line

Only code-made calls are recorded (`search` entries). Model reads through `Read`, `Grep`, `Glob` and
Bash `cat/sed` are **not** recorded, and the line says so. The v1 recorder (a `PostToolUse` hook on
`Read|Grep|Glob|LSP`) is dropped: it would have missed the majority of reads, which go through Bash
(M7), and labelled the line complete. If a measurement ever needs the model's reads, the recorder
returns with a `Bash` matcher and the structural parser.

## Interfaces

```ts
interface Evidence {
  append(task, entry): Promise<LedgerEntry>;
  read(task): Promise<LedgerEntry[]>;
  fold(task, session, route): Position;
  report(task): { evidence: string; notVerified: string; hash: string };
  navigationLine(task): string;
  notes: { save(task, kind, body | from, iteration?): Promise<Path>; promote(task): Promise<Path>; list(task): Promise<NoteRef[]> };
}
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| Two sessions append | lines whole; ids carry the session, so no collision; a fold spans sessions only through a `route {resumes}` chain (12 §2.3), otherwise it is per session (#106) |
| Ledger > 1 MB | warn; release `route start --task <slug>-2` |
| `note save` above the repo | resolved like the hook (G26) |
| Model edits a note or the ledger | denied; the deny names `note save` |
| Generated sections edited | Stop hook blocks once with "paste unchanged" |
| `note promote` with no draft | `plan-draft-missing`; release: write `steps/plan-body.md`, the route saves the draft |

## What changes from v0.4.0

Ledger 2 → 21 kinds; `plan-draft` always first, `promote`; `note list`; `--from`; `--iteration`;
`report`; generated navigation line labelled partial; session-scoped ids.

## Open problems

- P6 The model may strip the hash comment; normalized diff is the fallback.
- P38 "Model reads not recorded" makes the navigation line weaker than v0.4.0's self-report in
  coverage and stronger in honesty; a reviewer of the report may want more. Accepted until measured.

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
| `route` | Route | skill, args, mode (`interactive\|headless`), **channel (`hook\|harness\|cli`), trusted (bool, = channel ≠ cli; G1)**, session, epoch, resumes?, adopts? (a `plan` takeover, 12 §2.3, H2) |
| `step` | Route | step (the step id; `id` stays the entry id), actor (`code\|model`), **status (`delivered\|completed\|skipped`; G6)**, channel?, bytes?, file?, cause (`route-start` \| `route-next` \| command name \| `gate-hook`); `completed` is written by the engine after a code step's outputs are on record, or by `route next`/a command tail for the model step at the position (12 §8, #135) |
| `gate` | Route (every print), AskUserQuestion hook (decision gates only) | gate (the logical gate id; `id` is the ledger entry id, M2), class (`declared\|raised\|decision`), raisedBy?, question, print (n-th print of this id in the window), **object? {kind, value, id (the producing ledger entry), path, contentHash}** — the artifact the gate was printed for (12 §3.4, G2, #145). **The entry's ledger id is the gate instance the marker carries** (C2); `asked` is derived: the hook-written answers for this id in the window |
| `acceptance` / `declined` / `default-taken` | Route, AskUserQuestion hook | gate, **instance** (the `gate` entry's id the answer binds to; `null` for a flag or headless default with no print), answer (human's words), **via: hook\|flag\|prompt\|headless\|never-asked\|unanswered**, **object?** copied from that `gate` entry (G2, C2), reason? (`acting-needs-human\|max-revises\|…`), **unbound?: true** with reason (hook-written when the marker or its instance cannot be resolved; not a gate answer in the fold, 12 §3.4) |
| `preanswer` 🆕 | Route (`route start --answer`) | gate, option, via: `prompt`, trusted (copied from the `route` entry, #146); consumed into `acceptance {via: prompt, object: <the gate's object at that moment>}` when the gate is reached (12 §2.4); an **acting** option is written only for a trusted start (`channel: hook\|harness`, #102, G1); a non-acting one on any channel |
| `revise` | Route | from (stepId), via (`gate\|code\|model`), cycle, reason |
| `limit` / `exit` | Route | which, count, step? / reason, detail |
| `requirement` | MCP hook | key, via (tool), rawHash, bytes, relation, derivedFrom, capture (path) |
| `envelope` | Requirements | sources[], builtFrom: `captures\|args`, **asked[], missingAsked[]** (asked URLs with no complete capture; 14 §3, G5), hash |
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
  gate — so an unexpected end of the session loses nothing. **Promotion is bound to the accepted
  draft (G2, R17).** `note promote` runs the same predicate whether the `promote` step or a typed
  command calls it:
  1. the task's open (or last) `plan` route is found and the calling session owns it (no later
     `route {adopts}` or `exit {superseded}` from another session, 12 §2.3, H2 → else
     `route-taken-over`); its `plan-accept` window (12 §4) is the scope;
  2. the **latest bound** `acceptance|declined|default-taken` for `plan-accept` in that window is an
     `acceptance` with `answer: Accept` and an honoured `via` (`hook` bound to a printed instance, or
     `prompt`; never `flag`, 12 §3.4, C1) — a later *Reject*/*Revise* or a default supersedes an
     earlier Accept → `plan-not-accepted {reason: superseded}`;
  3. its `object.contentHash` equals the `contentHash` of the latest `note {plan-draft}` in the
     **current window of the `plan-check` step** of that route chain (the producer's window, 12 §3.4;
     a `revise plan-accept` does not move it, a `revise design` does, H3) — the draft itself is
     `object.id` — and that file still hashes the same → else `plan-not-accepted {reason: object-changed}`
     naming both hashes ("the accepted draft is `plan-draft_<ts>.md` a1b2…; the latest is …; ask again");
  4. no `note {plan}` with `promotedFrom` = that draft exists → else `plan-already-promoted` (no-op,
     exit 0, prints the plan path).
  Then it renames `plan-draft_<ts>.md` to `plan_<ts>.md` (same timestamp) and appends `note {kind:
  plan, path, contentHash, promotedFrom}`. **Recovery**: if `plan_<ts>.md` exists for the accepted
  draft and no `note {plan}` names it (a crash between rename and append, 12 §8), the next call
  appends the entry and renames nothing. A draft saved **after** the acceptance is a new object: it
  needs its own gate print and answer (the route's `revise design` cycle or `route start --fresh`).
  `note save --kind plan` does not exist; the only way to a `plan` is promotion.
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
  notes: { save(task, kind, body | from, iteration?): Promise<Path>; promote(task): Promise<Path>; list(task): Promise<NoteRef[]> };   // promote: the bound predicate of §3 (G2)
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
| `note promote` on a draft newer than the accepted one | `plan-not-accepted {reason: object-changed}`, both hashes named; release: `onFail: revise plan-accept` re-prints the gate for the new draft (32 §3, 12 §4, G2, #134) |
| `note promote` after a later *Reject* / *Revise* / default on `plan-accept` | `plan-not-accepted {reason: superseded}`; the draft stays |
| `note promote` twice for one accepted draft | `plan-already-promoted`, exit 0, path printed; nothing renamed |
| *Accept* answered on an older print (print A, print B, answer to A) | the answer is bound to A's instance and carries A's hash; the latest draft is B → `plan-not-accepted {reason: object-changed}`; the gate re-prints for B (12 §3.4, C2) |
| `note save --from`, `plan check` or `note promote` from a session whose `plan` route another session took over | ⛔ `route-taken-over` naming the new session (12 §2.3, H2) |
| Crash between the rename and the `note {plan}` entry | the next `note promote` appends the entry for the existing `plan_<ts>.md` (12 §8) |
| A file exists under the task directory with no ledger entry (orphan) | `route status` lists it; the producing step is not done and re-runs; the orphan is overwritten or left beside (notes keep both) |

## What changes from v0.4.0

Ledger 2 → 21 kinds; `plan-draft` always first, `promote`; `note list`; `--from`; `--iteration`;
`report`; generated navigation line labelled partial; session-scoped ids.

## Open problems

- P6 The model may strip the hash comment; normalized diff is the fallback.
- P38 "Model reads not recorded" makes the navigation line weaker than v0.4.0's self-report in
  coverage and stronger in honesty; a reviewer of the report may want more. Accepted until measured.

# Module: Policy (rules for planning, writing, reviewing)

## Purpose

Resolve which rules apply to an activity and a set of paths, deliver them at the step where they
act (not all up front: M16, M17), decide which project commands may run, and keep the authoring
path (`rules`) honest: verbatim quotes, staged drafts, confirmation before anything is live, a
revert.

## Inputs

- Config: `projects[].packs`, `projects[].policyFiles`, `projects[].commands`, `checks` (unchanged).
- Built-in packs under `policies/` (12 packs, 823 lines) and project packs under `.ambicode/policies/`.
- A request: `{project, activity, paths[], stage}` from the route engine.
- For `rules`: source documents (CLAUDE.md, CONTRIBUTING.md, docs, `.cursor/rules`, a Confluence page
  via the Requirements module), and drafts under `.ambicode/policies/drafts/`.

## Outputs

- `policy.stage(stage)`: the rules and prompt content for **one** stage: `before-work`,
  `before-checks`, `before-report`, `before-review`; command decisions with `before-checks`.
- `policy check`: validation of packs (unchanged) plus 🆕 quote verification and built-in duplicate
  detection.
- `rules discover|apply|revert` 🆕.
- Ledger `policy {stage, packs, rules, omitted}` per delivery.

## Workflow

### 1. Resolution (unchanged)

`load.ts` + `resolve.ts` stay: packs apply by `activities` and `appliesTo`; precedence
`forbid > propose > run`; `undeclared` refuses like forbid; `remindOnEdit` only on path-scoped packs;
provenance by hash. Nothing measured says these are wrong.

### 2. Staged delivery (new)

Today `prepare` carries all rules once (task: 33 rules, 11.5 KB of a 16.5 KB payload, M16), above the
inline window. The route delivers per stage:

| Stage | Delivered at | What | Size target |
|---|---|---|---|
| `before-work` | the step after the map | rules with category `architecture`, `correctness`, `security`, `workflow` for the mapped paths; pack prompts of that stage | ≤ 4 KB; the rest behind `$A policy --stage before-work --show` |
| `before-checks` | the step before `check`/`review` | command decisions (`run/propose/forbid`), check-related rules | ≤ 1.5 KB |
| `before-report` | the report step | presentation rules, `code-style` for `task` | ≤ 1.5 KB |
| `before-review` | reviewer prompt only (unchanged) | all review rules | reviewer's budget |

`investigate` gets `before-work` and `before-report` with `rulesOmitted` counts as today (it edits
nothing). `plan` gets all but `code-style`. `task` gets all, across three deliveries. Each delivery is
a ledger `policy` entry, so "rules applied" in the report is checkable.

Rules are rendered as text (`pack/rule (authority): instruction`), not JSON: estimated ~2 KB less per
delivery than the JSON shape (G6 estimate, unmeasured; measured when built).

### 3. Command policy additions

- `format` command slot (run/propose/forbid like the others), filled by `init` when prettier/black/ruff
  format is found; used by `task`'s format step (F6).
- `check --only <file>` is authorized by the same `authorizeCommand` seam under the same key as the
  check; no new runner ([16-checks-review.md](16-checks-review.md) §2).

### 4. `rules`: authoring (C5, F7)

```
$A rules discover [--json]                 candidate sources with size and heading counts
$A policy check --drafts --project <id>    validates .ambicode/policies/drafts/*.yaml
$A rules apply [--project <id>]            moves drafts live, wires policyFiles, runs scope probes
$A rules revert <pack-id>                  unwires and removes one pack (files kept under drafts/)
```

Each drafted rule carries `source.quote` (verbatim, ≥ 20 chars) and `source.location`. `policy
check --drafts` fails a rule whose quote does not occur in the named local file (Confluence sources
get `rawHash` from the Requirements hook and the quote is checked against the recorded text). It
also flags a draft whose instruction is within a normalized edit distance of a built-in rule's
(threshold set on the 12 built-ins: no false positive among them, tested).

The route for `rules` puts the disposition table and the human's confirmation **before** `apply`
(F7). `apply` writes YAML through the `yaml` document API (comments kept) and runs one covered-path
and one uncovered-path probe per pack, printing both. Bounded: 3 validation rounds, then the rule is
listed as "not migrated: <reason>".

## Interfaces

```ts
interface Policy {
  resolve(req: { project; activity; paths }): ResolvedPolicy;        // unchanged
  stage(req: { project; activity; paths; stage }): StagePayload;     // new projection
  commands(project): CommandDecisions;                               // run/propose/forbid/undeclared
  check(files, { drafts?: boolean; project }): Diagnostics;
  rules: { discover(); apply(project); revert(packId) };
}
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `preparation-blocked` | an applicable prompt or pack cannot be delivered | unchanged: stop, name the file and hash |
| `pack-quote-missing` 🆕 | quote not found in source | fix the quote or drop the rule; after 3 rounds "not migrated" |
| `pack-duplicates-builtin` 🆕 | near-duplicate of a built-in | warning; the table shows the built-in id |
| `rules-apply-unconfirmed` 🆕 | `apply` called with no `acceptance {gate: rules-table}` in the ledger | the message names the gate; headless default is *do not apply* (drafts stay) |

## What changes from v0.4.0

- Staged delivery replaces the single `policy` block in `prepare`.
- `format` slot. `rules` gets discover/apply/revert, drafts, quotes, confirmation-before-wiring.
- No change to the pack schema except `source.quote` (optional for built-ins, required for drafts).

## Open problems

- P15 Staged delivery means a rule can arrive after the model already did the thing it governs (an
  `architecture` rule at `before-work` is fine; a `code-style` rule at `before-report` is late for
  `task`). The task route delivers `code-style` with `before-work` for the mapped paths when the count
  is under 8; otherwise at `before-checks`. The threshold is a guess.
- P16 Duplicate detection by edit distance is crude; the threshold is tuned on 12 packs.

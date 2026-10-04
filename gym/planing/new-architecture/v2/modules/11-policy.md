# Module: Policy (rules for planning, writing, reviewing)

## Purpose

Resolve which rules apply to an activity and paths, deliver them at the step where they act (M16,
M17), decide which project commands may run, and keep the authoring path (`rules`) honest: verbatim
quotes, staged drafts, confirmation before anything is live, a revert.

## Inputs

Config (`packs`, `policyFiles`, `commands`, `checks`, unchanged); built-in packs (12, 823 lines) and
project packs; a request `{project, activity, paths[], stage}` from the route; for `rules`: source
documents and drafts under `.ambicode/policies/drafts/`.

## Outputs

- `policy.stage(stage)`: rules and prompt content for **one** stage (`before-work`, `before-checks`,
  `before-report`, `before-review`); command decisions with `before-checks`.
- `policy check` (unchanged) plus quote verification and built-in near-duplicate detection.
- `rules discover|apply|revert` 🆕. Ledger `policy {stage, packs, rules, omitted}` per delivery.

## Workflow

### 1. Resolution (unchanged)

`load.ts` + `resolve.ts` stay: `activities` and `appliesTo`; precedence `forbid > propose > run`;
`undeclared` refuses; `remindOnEdit` only on path-scoped packs; provenance by hash.

### 2. Staged delivery

| Stage | Delivered at | What | Size target |
|---|---|---|---|
| `before-work` | the read/implement step | `architecture`, `correctness`, `security`, `workflow` rules for the mapped paths, plus `code-style` when ≤ 8 such rules apply (P15); pack prompts of that stage | ≤ 4 KB; rest behind `$A policy --stage before-work --show` |
| `before-checks` | before `check`/`review` | command decisions, check-related rules, `code-style` if not delivered earlier | ≤ 1.5 KB |
| `before-report` | the report step | presentation rules | ≤ 1.5 KB |
| `before-review` | reviewer prompt only | all review rules | reviewer's budget |

`investigate` gets `before-work` and `before-report` with `rulesOmitted` counts (it edits nothing);
`plan` all but `code-style`; `task` all, in three deliveries. Each delivery is a `policy` ledger
entry. Rules render as text (`pack/rule (authority): instruction`); the ~2 KB saving over JSON is an
estimate (G6) measured when built.

### 3. Command policy additions

`format` slot (run/propose/forbid), filled by `init` when prettier/black/ruff format is found.
`check --only` is authorized by the same seam under the check's key (16 §2).

### 4. `rules` authoring (C5, F7)

```
$A rules discover [--json]
$A policy check --drafts --project <id>
$A rules apply [--project <id>]
$A rules revert <pack-id>
```

Each draft rule carries `source.quote` (verbatim, ≥ 20 chars) and `source.location`; `policy check
--drafts` fails a rule whose quote is absent from the named local file (Confluence sources are
checked against the captured payload, 14 §3); near-duplicates of built-ins are flagged (edit
distance, threshold set so no built-in flags another, P16). The disposition table and the human's
confirmation come **before** `apply`; `apply` writes YAML through the document API and runs one
covered and one uncovered probe per pack. Bounded: 3 validation rounds, then "not migrated: <reason>".

## Interfaces

```ts
interface Policy {
  resolve(req): ResolvedPolicy;                 // unchanged
  stage(req & { stage }): StagePayload;         // new projection
  commands(project): CommandDecisions;
  check(files, { drafts?, project }): Diagnostics;
  rules: { discover(); apply(project); revert(packId) };
}
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `preparation-blocked` | an applicable prompt or pack cannot be delivered | unchanged: stop, name the file and hash |
| `pack-quote-missing` 🆕 | quote not in source | fix or drop; after 3 rounds "not migrated" |
| `pack-duplicates-builtin` 🆕 | near-duplicate | warning with the built-in id |
| `rules-apply-unconfirmed` 🆕 | no `acceptance {gate: rules-table}` | the gate; headless default: do not apply |

## What changes from v0.4.0

Staged delivery; `format` slot; `rules` discover/apply/revert, drafts, quotes, confirmation before
wiring; `source.quote` (required for drafts, optional for built-ins). No other schema change.

## Open problems

- P15 A staged rule can arrive after the act it governs; the ≤ 8 threshold is a guess, measured by
  late-rule findings in task reviews.
- P16 Duplicate threshold tuned on 12 packs.

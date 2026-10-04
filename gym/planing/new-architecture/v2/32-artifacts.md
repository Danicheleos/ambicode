# On-disk artifacts and formats

## 1. Repository layout (`.ambicode/`)

```
.ambicode/
  config.yaml                       written by init --apply only
  policies/                         live packs
  policies/drafts/                  rules drafts; the only place `rules` may Write
  index/                            index cache; must be gitignored or `index build` refuses
  metrics.jsonl                     publication selections (D4); gitignored
  reviews/<id>/                     MR and routeless reviews (unchanged)
  task/<slug>/                      one directory per task; gitignored; agent-unwritable except through the CLI
    ledger.jsonl
    requirements/<key>.json         captured MCP payloads (hook-written)
    investigation_<ts>.md  plan_<ts>.md  plan-draft_<ts>.md  notes.md
    steps/<stepId>.md               payloads over the inline window
    steps/plan-body.md              the one model-writable file (plan route)
    workers/<id>-<ts>.json
    reviews/<reviewId>/…
    stop-check.md                   the Stop hook's list when the event cannot carry it
```

`init` gitignores `index/`, `metrics.jsonl`, `reviews/`, `task/` (and the legacy `notes/`).

## 2. Ledger line

```json
{"id":"L7","at":"2026-10-03T11:02:14.120Z","kind":"check","key":"web/unit","only":["src/orders/validate.spec.ts"],"exit":1,"phase":"red","summary":{"ran":1,"failed":1},"ms":2140}
```

Append-only; `O_APPEND`; ids monotonic per file; unknown kinds skipped; `session` on `route`
entries; no entry over 16 KB (payloads go to files, the entry holds path and hash). Kinds in 13 §1.

## 3. Route definition (`routes/<skill>.yaml`), zod-validated at build

```yaml
skill: investigate
version: 2
budget: { modelSteps: 6, wallMinutes: 45 }      # wallMinutes applies in --headless only
exits: [done, blocked, human, inconclusive, superseded, budget]
steps:
  - id: template
    actor: code
    when: args.hasRequirement
    run: requirements.template
  - id: fetch
    actor: model
    when: args.hasRequirement
    instruction: file:routes/steps/investigate-fetch.md       # "fetch, expand, then `route next`"
  - id: ground
    actor: code
    run: [requirements.normalize, requirements.acs, search.map(prompt), policy.stage(before-work)]
    produces: [envelope, map, policy]
    repeat: 2
  - id: scope
    actor: human
    when: map.empty
    gate:
      question: "The map is empty. Which directory or component is this about?"
      options: ["<free text>", "search anyway"]
      default: "search anyway"
      release: "search anyway"
  - id: read
    actor: model
    instruction: file:routes/steps/investigate-read.md
    payload: [map, policy:before-work, acs]
  - id: report
    actor: model
    instruction: file:routes/steps/investigate-report.md
    payload: [policy:before-report, navigation]
    produces: [note]                                           # done when the note exists; no `route stop`
```

Schema rules: `when` from the fixed vocabulary; `gate` only on `human` steps, with `release` and a
non-acting `default`; every `model` step has an `instruction` ≤ 1,500 chars after inclusion;
`produces` are known kinds; `repeat` ≥ 1; `budget.modelSteps` present. Branching = two steps with
complementary `when`s.

## 4. Config v2 deltas

```yaml
schemaVersion: 2                       # 1 loads with a notice; init --apply migrates
search: { index: none | codeindex, exactMaxFiles: 3000 }     # exactMaxFiles counts .ts/.tsx files
task: { lspPlugins: [] }                                      # was requirements.lsp; advisory
workers: { approved: [] }
guard: { askOutsideMap: false }
review: { onInvalid: void | drop }                            # default void
projects[].commands.format: null | { argv: [...] }
```

## 5. Captured requirement (`requirements/<key>.json`)

```json
{"key":"ORD-18","url":"https://…/browse/ORD-18","title":"…","type":"Story","relation":"child","derivedFrom":"ORD-17",
 "retrievedVia":"mcp__atlassian__getJiraIssue","retrievedAt":"…","sourceVersion":"12","updatedAt":"…",
 "content":"…verbatim text fields…","rawHash":"sha256:…"}
```

## 6. Step payload file (`steps/<id>.md`)

```
<!-- ambicode step: investigate/read, task ORD-17, 11,204 bytes, L9 -->
## Do now
…
## Map
…
## Rules (before-work)
…
```

## 7. Worker artifact and metrics

`workers/plan-check-<ts>.json` per 17 §2, ≤ 64 KB. `metrics.jsonl`:
`{"at":…,"reviewId":…,"findingId":…,"rule":…,"offered":true,"selected":true,"edited":false,"posted":true}`,
written by the page on submit, aggregated by a script in `evals/`.

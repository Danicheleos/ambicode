# On-disk artifacts and formats

## 1. Repository layout (`.ambicode/`)

```
.ambicode/
  config.yaml                       written by init --apply only (model edits denied during init)
  policies/                         live packs (project)
  policies/drafts/                  rules drafts; the only place `rules` may Write
  index/                            symbol index cache (codeindex artifacts or agentmap cache); gitignored
  metrics.jsonl                     publication selections per finding (D4); gitignored
  reviews/<id>/                     MR reviews and routeless reviews (unchanged)
  task/<slug>/                      one directory per task; gitignored; agent-unwritable except through the CLI
    ledger.jsonl
    investigation_<ts>.md  plan_<ts>.md  plan-draft_<ts>.md  notes.md
    steps/<stepId>.md               payloads over the inline window; plan-body.md (the one model-writable file, for note save --from)
    workers/<id>-<ts>.json|md
    reviews/<reviewId>/…
    stop-check.md                   the Stop hook's list when the event cannot carry context
```

`init` gitignores `index/`, `metrics.jsonl`, `reviews/`, `task/` (and the legacy `notes/`).

## 2. Ledger line

```json
{"id":"L7","at":"2026-10-03T11:02:14.120Z","kind":"check","key":"web/unit","only":["src/orders/validate.spec.ts"],"exit":1,"phase":"red","ms":2140,"session":"…"}
```

Rules: append-only; `O_APPEND`; ids monotonic per file; unknown kinds skipped by readers; `session`
on `route` entries only; no entry over 16 KB (large payloads go to `steps/` or `workers/` and the
entry holds the path and hash). Kinds in 13-evidence §1.

## 3. Route definition (`routes/<skill>.yaml`), zod-validated at build

```yaml
skill: investigate
version: 1
budget: { codeCalls: 40, modelSteps: 6, wallMinutes: 45 }
exits: [done, blocked, budget, human, inconclusive]
steps:
  - id: intake
    actor: code
    run: requirements.template          # when args hold a URL/key; else search.map(prompt)
    produces: [requirement]              # or [map]
  - id: fetch
    actor: model
    instruction: file:routes/steps/investigate-fetch.md
    when: hasRequirementUrls
  - id: ground
    actor: code
    run: [requirements.normalize, requirements.acs, search.map(prompt), policy.stage(before-work)]
    produces: [requirement, map, policy]
    repeat: 2
    gate:
      when: map.candidates == 0
      question: "The map is empty. Which directory or component is this about?"
      options: [ "<free text>", "search anyway" ]
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
    produces: [note]
```

Schema rules enforced at build: every `gate` has `release` and `default`; every `model` step has an
`instruction` ≤ 1,500 chars after file inclusion; `produces` kinds are known kinds; `repeat` ≥ 1;
`budget` present.

## 4. Config v2 deltas

```yaml
schemaVersion: 2                       # 1 is read and migrated by init --apply
search:
  index: none | codeindex | agentmap
  exactMaxFiles: 3000
task:
  lspPlugins: []                       # was requirements.lsp; advisory
workers:
  approved: []                         # [scout, collector, plan-checker]
guard:
  askOutsideMap: false
evidence:
  recordTools: true                    # the optional PostToolUse recorder
review:
  onInvalid: void | drop               # default void
projects[].commands.format: null | { argv: [...] }
```

Everything else unchanged. `schemaVersion: 1` files load with a migration notice; `init --apply`
rewrites them.

## 5. Step payload file (`steps/<id>.md`)

```
<!-- ambicode step: investigate/read, task ORD-17, 11,204 bytes, L9 -->
## Do now
…instruction…
## Map
…compact map…
## Rules (before-work)
…
```

The header comment is what the Stop hook and `route status` use to know the step was delivered.

## 6. Worker artifact (`workers/scout-<ts>.json`)

Schema per worker in 17-workers §2; validated on `worker save/run`; ≤ 64 KB; the ledger entry holds
the path and the hash.

## 7. Metrics (`metrics.jsonl`)

```json
{"at":"…","reviewId":"MR_123_…","findingId":"f-ab12…","rule":"angular-http/response-validation","offered":true,"selected":true,"edited":false,"posted":true}
```

Written by the view page on submit. Read by nothing in the plugin; a script in `evals/` aggregates
the accepted rate per repository and rule.

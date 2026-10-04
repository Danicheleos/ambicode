# On-disk artifacts and formats

## 1. Repository layout (`.ambicode/`)

```
.ambicode/
  config.yaml                       written by init --apply only (on acceptance)
  policies/                         live packs
  policies/drafts/                  rules drafts; the only place `rules` may Write
  index/                            index cache; must be gitignored or `index build` refuses
  metrics.jsonl                     publication selections (D4); gitignored
  reviews/<id>/                     MR and routeless reviews (unchanged)
  task/<slug>/                      one directory per task; gitignored; agent-unwritable except through the CLI
    ledger.jsonl
    requirements/<key>.json         captured MCP payloads (hook-written)
    investigation_<ts>.md  plan-draft_<ts>.md  plan_<ts>.md (promoted)  notes.md
    steps/<stepId>.md               payloads over the inline window
    steps/plan-body.md              the one model-writable file (plan route)
    workers/<id>-<ts>.json
    reviews/<reviewId>/…
    stop-check.md                   the Stop hook's list when the event cannot carry it
```

`init --apply` gitignores `index/`, `metrics.jsonl`, `reviews/`, `task/` (and the legacy `notes/`).

Plugin-side data: `routes/<skill>.yaml` (one per skill), `routes/gates.yaml` (raised gates),
`routes/steps/*.md` (step instructions).

## 2. Ledger line

```json
{"id":"a1b2c3d4-7","at":"2026-10-04T11:02:14.120Z","kind":"check","key":"web/unit","only":["src/orders/validate.spec.ts"],"exit":1,"phase":"red","summary":{"ran":1,"failed":1},"ms":2140}
{"id":"a1b2c3d4-9","at":"…","kind":"revise","from":"plan-write","via":"code","cycle":1,"reason":"plan check: 2 bad anchors"}
{"id":"a1b2c3d4-2","at":"…","kind":"preanswer","gate":"review-offer","option":"run","via":"prompt"}
{"id":"a1b2c3d4-12","at":"…","kind":"map","mode":"prompt","layers":[{"name":"shortlist","ms":412,"hits":15},{"name":"harvest","ms":48,"hits":5},{"name":"shortlist","ms":380,"hits":9}],"collisions":["validate"],"index":"none","bytes":4210}
```

Append-only; `O_APPEND`; ids `<session8>-<n>` (#53); unknown kinds skipped; `session` on `route`
entries; no entry over 16 KB (payloads go to files, the entry holds path and hash). Kinds in 13 §1.

## 3. Route definition (`routes/<skill>.yaml`), zod-validated at build

```yaml
skill: plan
version: 3
budget: { modelSteps: 14, wallMinutes: 45 }      # wallMinutes applies in --headless only
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: [design]                               # the model may `route next --revise design`
steps:
  - id: template
    actor: code
    when: args.hasRequirement
    run: requirements.template
  - id: fetch
    actor: model
    when: args.hasRequirement
    instruction: file:routes/steps/plan-fetch.md          # "fetch with the field lists, then `route next`"
  - id: ground
    actor: code
    run: [requirements.normalize, requirements.acs, search.map(context), policy.stage(before-work)]
    produces: [envelope, map, policy]
    repeat: 2                                             # one automatic re-run (code/model revise); a human scope answer starts a new cycle (D14, #111)
  - id: design
    actor: model
    instruction: file:routes/steps/plan-design.md         # decisions via AskUserQuestion with [ambicode gate decision:<slug>]
    payload: [map, policy:before-work, acs]
    repeat: 2
  - id: plan-step
    actor: code
    run: [policy.stage(before-report), evidence.navigationLine]
    produces: [policy{before-report}]                       # qualified: a before-work policy entry is already in the window (#105)
  - id: plan-write
    actor: model
    instruction: file:routes/steps/plan-write.md          # "write steps/plan-body.md once, then `plan check --from`"
    repeat: 3
  - id: plan-check
    actor: code
    run: [evidence.notes.save(plan-draft, from: steps/plan-body.md), workers.planCheck]
    produces: [note{plan-draft}, worker]
    onFail: revise plan-write                               # bad anchors or unmapped ACs
  - id: plan-accept
    actor: human
    gate:
      question: "Accept this plan?"
      options: [Accept, Revise, Reject]
      default: Reject                                       # non-acting: the draft stays a draft
      release: Reject
      onAnswer: { Revise: revise design }                   # a human cycle: resets design/plan-write repeats (D14)
      maxRevises: 3                                         # printed as "Revise (N left)"
  - id: promote
    actor: code
    when: gate.plan-accept.is(Accept)                       # the latest answer in this step's window (#98)
    run: evidence.notes.promote
    produces: [note{plan}]                                  # done when the promoted note exists; `note{plan-draft}` does not satisfy it (#105)
```

Schema rules: `when` from the fixed vocabulary (12 §1); `gate` only on `human` steps (and on
`worker` steps once a model worker ships), with `release` and a non-acting `default`; `onAnswer`
keys are option names or `"*"` (free text, `$answer` substitution); `onAnswer` and `onFail` targets
are step ids of the same route: an earlier step, the firing step itself (`$raisedBy`, 12 §3.5), or —
for an `onFail` evaluated at a command tail — the step that consumes its result (task `review-run` →
`fix`); a target later than the next step is refused at build (#103); `maxRevises` ≥ 1 (default 3); `revisable` lists step ids; every `model` step
has an `instruction` ≤ 1,500 chars after inclusion; `produces` are known kinds, optionally `kind{value}` on a field 13 §1 lists for that kind (#105); `repeat` ≥ 1 and
named per step id; `budget.modelSteps` present. Branching = two steps with complementary `when`s;
looping = `revise`. Nothing in a route names a language or an ecosystem (R16).

## 4. Gate registry (`routes/gates.yaml`)

Every raised gate the design names is here; the table test (15 §4) drives each (#80).

```yaml
requirements-server-disconnected:
  question: "The requirement server is not connected. Continue without the requirement?"
  options: ["continue without", "stop"]
  default: "continue without"            # non-acting: an args envelope, nothing written
  release: "stop"
  policy: { review: stop }               # review never continues (#65)
requirements-server-ambiguous:   { options: ["{servers…}", "continue without"], default: "continue without", release: "continue without" }
requirements-expansion-capped:   { options: ["read all", "read these: {keys}", "none"], default: "none", release: "none" }   # raised before the child reads (#81)
requirements-conflicting:        { options: ["{sources…}", "stop"], default: "stop", release: "stop" }                        # answer: --answer requirements-conflicting=<source>
requirements-not-captured-twice: { options: ["continue without", "stop"], default: "continue without", release: "stop" }
check-only-unauthorized:
  question: "Run {key} on {files}? (policy: propose)"
  options: [approve, decline]
  default: decline
  release: decline
  onAnswer: { approve: revise $raisedBy }   # re-enter the step whose command waited (#77)
scope-expanding:
  question: "This finding is outside the brief: {finding}. Treat as out of scope?"
  options: ["out of scope", "include"]
  default: "out of scope"
  release: "out of scope"
project-ambiguous:
  question: "Two projects match. Which one?"
  options: ["{projects…}", "stop"]
  default: "stop"                        # non-acting (R4); the route exits `human` with the flag named
  release: "route next --project <id>"
config-unparsable:               { options: ["back up and regenerate", "stop"], default: "stop", release: "stop" }
budget-exhausted:
  question: "The route's model-step budget is spent. Continue or stop?"
  options: [continue, stop]
  default: stop
  release: stop
decision:*:                              # model-raised (plan)
  default: "keep open"                   # the plan stays a draft
  release: "keep open"
```

## 5. Config v3 deltas

```yaml
schemaVersion: 3                        # 1 and 2 load with a notice; init --apply migrates
search:
  index: none | codeindex
  layers:                               # explicit and editable (D9); map refuses unknown names
    prompt:  [shortlist, harvest, shortlist]
    context: [grep, harvest]
workers: { approved: [] }
guard: { askOutsideMap: false }
review: { onInvalid: void | drop }      # default void
projects[].commands.format: null | { argv: [...] }
# removed: requirements.lsp, task.lspPlugins, search.exactMaxFiles
```

## 6. Captured requirement (`requirements/<key>.json`)

```json
{"key":"ORD-18","url":"https://…/browse/ORD-18","title":"…","type":"Story","relation":"child","derivedFrom":"ORD-17",
 "retrievedVia":"mcp__claude_ai_Atlassian_Rovo__getJiraIssue","retrievedAt":"…","sourceVersion":"12","updatedAt":"…",
 "content":"…verbatim text fields…","rawHash":"sha256:…"}
```

An args envelope has one source `{"key":"ARGS","title":"<first line>","content":"<rest>"}` and
`builtFrom: args` on the `envelope` entry; nothing is written under `requirements/`.

## 7. Step payload file (`steps/<id>.md`)

```
<!-- ambicode step: investigate/read, task ORD-17, 11,204 bytes, a1b2c3d4-9 -->
## Do now
…
## Map (layers: shortlist → harvest → shortlist; 1 colliding name)
…
## Rules (before-work)
…
```

## 8. Worker artifact and metrics

`workers/plan-check-<ts>.json` per 17 §2, ≤ 64 KB. `metrics.jsonl`:
`{"at":…,"reviewId":…,"findingId":…,"rule":…,"offered":true,"selected":true,"edited":false,"posted":true}`,
written by the page on submit, aggregated by a script in `evals/`.

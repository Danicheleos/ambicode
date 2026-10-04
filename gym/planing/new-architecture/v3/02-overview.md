# Overview: layers, modules, the plugin's own harness

## 1. The one-paragraph design

A user types `/ambicode:<skill> <args>`. A `UserPromptSubmit` hook starts a **route** for that
skill: a declared sequence of steps owned by code, by the model, by a worker, or by the human. The
route engine (CLI) performs every step code can perform (payload capture and envelope, search with
declared layers, policy, baseline, checks, review, note naming, report skeleton) and hands the model
**one step's instruction at a time**, at the tail of the command it just ran or in a hook message.
Every step appends to an append-only **ledger** in the task directory; the next step is a fold over
the ledger with bounded re-entry (`revise`), so there is no other state. Gates — declared in the
route or raised by an error code — have releases and non-acting defaults that are taken only on
record. A `Stop` hook checks a report-shaped stop against the ledger, once. The skill body shrinks
to the judgment asked and the first command. No LSP anywhere (D8). This is the plugin's own harness
inside Claude Code's loop; whether it earns its cost is measured, and the user decides (D10).

## 2. Layers

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ L3  Skills (user-invoked)      init  rules  investigate  plan  task  review     │  one route + one slim body each
├───────────────────────────────────────────────────────────────────────────────┤
│ L2  Harness                    route engine · step delivery · gates (declared,  │  drives the model through hooks
│                                raised) · revise/repeat · Stop check · headless  │  and command tails
├───────────────────────────────────────────────────────────────────────────────┤
│ L1  Global modules             Search · Policy · Requirements · Evidence ·      │  usable by any skill, by workers,
│                                Guard · Checks+Reviewer · Workers                │  and by the CLI on its own
├───────────────────────────────────────────────────────────────────────────────┤
│ L0  Platform adapter           Claude Code hooks · tools · limits · claude -p · │  the only layer that knows
│                                git · MCP (read by the session only)             │  platform facts (M14, M15)
└───────────────────────────────────────────────────────────────────────────────┘
```

Rules between layers: L3 declares a route and holds no procedure code could run (R1). L2 knows
steps, actors, evidence kinds, gates, revises and limits, and nothing about tickets, policy or code;
its state is the ledger. L1 modules are independent and expose a CLI command (the model's view) and
an interface (the route's view); every evidence-writing command advances the route at its tail. L0
holds every platform number and event name.

## 3. Framework or not

**An internal framework, not a product one.** Routes (`routes/<skill>.yaml`, `routes/gates.yaml`)
and module interfaces are data and seams; the engine is generic. It enforces three things only:
code-owned steps ran (they ran because code ran them), gates were released by someone on record, and
a report does not contradict the ledger. It never decides what the model should conclude, and the
model can stop a route (`$A route stop`) or re-enter a declared step (`--revise`), both recorded. The
risk that structured procedure displaces reasoning (SkillsBench: 13 of 87 tasks worse) is measured,
not argued: 33 §1–2 put the investigate route in front of the user before anything is built on it,
and 41 names the point of no return.

## 4. Module map

| Module | Owns | Absorbs from v0.4.0 | Verdict |
|---|---|---|---|
| **Search** [10](modules/10-search.md) | text, term shortlist, regex pass 2 with declaration counts, optional index, **declared layer lists** | `locate.ts`, `dependents.ts`, `navigation.ts` | ♻ shortlist kept; 🆕 pass 2, `refs/find/relates`, adapter, layers; ✂ LSP, exact refs (backlog) |
| **Policy** [11](modules/11-policy.md) | packs, resolution, staged delivery, command slots, `rules` path | `policy/*`, `policies/*`, `config/*` | ✅ resolver; ♻ staging; 🆕 drafts/quotes/revert |
| **Route** [12](modules/12-route.md) | routes, fold with re-entry, declared and raised gates, releases, limits, DSL | `prepare-on-skill.ts`, `markers.ts` | 🆕 |
| **Evidence** [13](modules/13-evidence.md) | ledger (20 kinds), notes with draft-first and promote, task dir, `report`, navigation line | `task/*`, `note.ts`, `review-name.ts` | ♻ |
| **Requirements** [14](modules/14-requirements.md) | captured payloads, envelope from captures or args, expansion with field lists, ACs, binding | `requirements/normalize.ts`, `requirements-mcp.md` | ♻ |
| **Guard** [15](modules/15-guard.md) | structural parser, decisions, Stop hook, gate table test | `guard-core.ts`, `guard.mjs` | ♻ parser; 🆕 Stop |
| **Checks + Reviewer** [16](modules/16-checks-review.md) | snapshot, checks, reviewer, validation, report, page | `snapshot/*`, `checks/*`, `review/*`, `providers/*`, `publication/*`, `page/*` | ✅ pipeline; 🆕 `check --only`, model-run `format`, `--task`, `--estimate`, metrics |
| **Workers** [17](modules/17-workers.md) | process runner, `plan check` with re-entry; appendix: scout, collector, judge | `claude-reviewer.ts` | ♻ runner; 🆕 `plan check` |

## 5. One run, with its ceremony count

`/ambicode:investigate https://…/browse/ORD-17` on Sonnet:

```
#  actor   step                                                              context (expected)   ledger
1  Hook    UserPromptSubmit → `route start investigate <args>`: slug ORD-17,  ~1.5 KB              route
           requirements template: "fetch ORD-17 (fields=…) and its children
           (JQL fields=key,summary) with <server>, then run `route next`"
2  Model   mcp getJiraIssue ORD-17; JQL parent = ORD-17; getJiraIssue ×N        ticket text          —
   Hook    PostToolUse(mcp__*) ×(1+N): bound → capture payload, rawHash         0                    requirement ×(1+N)
3  Model   `$A route next --task ORD-17`                                       ~4–6 KB              step
   CLI     ground: envelope from captures, ACs, map (layers shortlist →
           harvest → shortlist, printed), before-work rules → the read step
4  Model   reads (batched, then spans); may `$A refs/find`; >= 2 hypotheses     reads                search
5  Model   `$A route next` → report step: shape, before-report rules,          ~1 KB                step
           generated navigation line
6  Model   writes the answer; `$A note save --kind investigation <<EOF`         —                    note
7  Hook    Stop: the note file's path:line citations exist → allow              —                    —
```

**Ceremony turns: 3** (`route next` ×2, `note save` ×1); **2** in the sandbox, where nothing is
fetched and the envelope is built from the args (`route next` ×1 + `note save`); +1 if the ground
step exceeds the inline window and goes to a file; +1 per gate. Today: `Skill`, `ToolSearch`,
`config`, two `Read`s of references, `prepare` rerun, `note save` (M1). Fixed text in context:
**expected 6–8 KB**, **cap 16 KB** (30 §3); today ≈ 21–27 KB of files. This is the mechanism by which
the +4.7 turns are meant to fall; it is a prediction, and 33 §1 reports it per route and gates the
point of no return on cost and recall (D10).

## 6. Keep, rework, drop (v0.4.0 → v3)

| Component | Verdict | Fact |
|---|---|---|
| Isolated reviewer, snapshot, finding validation, 4-part report | ✅ keep (seams extended, 41 lists which) | M18 |
| Checks selection, run/propose/forbid, authorization seam | ✅ keep; extend with `--only`, `format` (model-run) | one pipeline owns selection |
| Policy packs, resolver, `policy check` | ✅ keep | no measured defect |
| GitLab provider, publication, view page | ✅ keep; page gains selection metrics | E3 |
| `prepare` as one command | ♻ `route start` + `map` + `requirements`; compact projection stays | M16, M17 |
| Term shortlist (`locate`) | ♻ one layer; pass 2 by regex harvest; layer lists in config | M5, M6, D9 |
| Hook-run prepare on `Skill` / slash / MCP read | ♻ `UserPromptSubmit` starts the route; MCP hook captures only (`mcp__.*`, binding inside); `Skill` hook ✂ (dead under D2) | M3, D2 |
| `requirements-mcp.md` | ✂ replaced by `requirements template` output (with field lists) and code-built envelopes | M11, M1, R1 |
| `prepare-output.md` | ✂ | content in step text and headers |
| Self-reported `Navigation:` line | ✂ generated from CLI calls, labelled partial | R3 |
| `requirements.lsp` mandate; LSP in any skill; `impact.md` | ✂ backlog | D8, M8, M9, M10 |
| Skill bodies (4.2–10.6 KB; the four model-facing ones 5.9–10.6) | ♻ ≤ 2.5 KB each | M1, M17, M23 |
| Model-invocable skills, trigger suite | ✂ | D2 |
| Regex guard | ♻ structural parser | M12 |
| Plan acceptance by click only; plan saved only on acceptance | ♻ draft saved first (D11); click promotes; headless → draft on record | M13, R4 |
| `PostToolUse(Edit\|Write)` reminder hook | ✂ until a pack sets `remindOnEdit` (inert today, 89–143 ms per edit) | G18 |

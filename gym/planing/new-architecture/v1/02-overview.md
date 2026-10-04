# Overview: layers, modules, the plugin's own harness

## 1. The one-paragraph design

A user types `/ambicode:<skill> <args>`. A `UserPromptSubmit` hook starts a **route** for that
skill: a declared sequence of steps, each owned by code, by the model, by a worker or by the
human. The route engine (CLI) performs every step that code can perform (requirements
normalization, search, policy, baseline, checks, review, note naming, report skeleton) and
hands the model **one step's instruction at a time**, inside the output of the command it
just ran or inside a hook message. Every step appends to an append-only **ledger** in the
task directory; the next step is computed from the ledger, so there is no other state. Gates
have releases, including a headless default. A `Stop` hook refuses a report that claims what
the ledger does not hold, once. The skill body shrinks to the judgment the model is asked
for and the first command to run. This is the plugin's own harness, running inside Claude
Code's loop, built from hooks, CLI output and the ledger.

## 2. Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ L3  Skills (user-invoked)        init  rules  investigate  plan  task  review │  one route + one slim body each
├─────────────────────────────────────────────────────────────────────────────┤
│ L2  Harness                      route engine · step delivery · gates ·       │  "own harness": drives the model
│                                  loop/budget limits · Stop check · headless   │  through hooks + CLI output
├─────────────────────────────────────────────────────────────────────────────┤
│ L1  Global modules               Search · Policy · Requirements · Evidence ·  │  usable by any skill, by workers,
│                                  Guard · Checks+Reviewer · Workers            │  and by the CLI on its own
├─────────────────────────────────────────────────────────────────────────────┤
│ L0  Platform adapter             Claude Code hooks · tools · limits · claude -p│  the only layer that knows
│                                  git · MCP (read by the session only)          │  platform facts (M14, M15)
└─────────────────────────────────────────────────────────────────────────────┘
```

Rules between layers:

- L3 never calls L1 directly; it declares a route, and L2 runs it. A skill file holds no procedure
  that code could run (R1).
- L2 knows nothing about tickets, policy or code; it knows steps, actors, evidence kinds, gates and
  limits. Its state is the ledger (L1 Evidence) and nothing else.
- L1 modules are independent: Search does not read policy; Policy does not search. The route
  composes them. A module exposes a CLI command and a TypeScript interface; the CLI command is the
  model's view, the interface is the route's view.
- L0 is the only place with numbers like 9,800, 30,000, hook event names and `claude` flags. When
  the platform changes, L0 changes.

## 3. Framework or not

**Verdict: an internal framework, not a product one.** Two things become data instead of prose:

1. **Routes** (`routes/<skill>.yaml`): steps with actor, instruction, required evidence, gates with
   releases, repeat limits, exits. The engine is generic; adding a skill is adding a route file, a
   slim `SKILL.md` and, if needed, a module call.
2. **Module interfaces** (`src/<module>/index.ts`): `Search.map()`, `Policy.resolve()`,
   `Requirements.normalize()`, `Evidence.append()/fold()`, `Guard.decide()`, `Checks.run()`,
   `Reviewer.review()`, `Workers.propose()`.

Why not more: the warnings in the current skills ("no task database, no workflow engine") came
from a real risk, rigid procedure displacing reasoning (SkillsBench: 13 of 87 tasks worse). The
engine therefore enforces only three things: that code-owned steps ran (they ran, because code ran
them), that gates were released by someone, and that the report does not contradict the ledger. It
never decides *what the model should conclude*, and the model can always stop the route
(`$A route stop --reason …`), which is itself a recorded exit.

Why not less: M2 and M3. Prose steps are skipped by the model that matters (Sonnet) and hook-run
steps are not. A route engine is the smallest structure that makes every fixed step hook-run or
CLI-run instead of model-run.

## 4. Module map, and where each lives today

| Module | Owns | v0.4.0 code it absorbs | Verdict |
|---|---|---|---|
| **Search** [10](modules/10-search.md) | Finding code: text search, term shortlist, symbol index, co-change, LSP (task only). Produces the **map**. | `code-intelligence/locate.ts` (shortlist, terms), `dependents.ts`, `navigation.ts` (reading order) | ♻ shortlist kept and demoted; index 🆕; reading order rewritten per D1 |
| **Policy** [11](modules/11-policy.md) | Packs, resolution, authority, prompts by stage, command decisions, `rules` validation. | `policy/*`, `policies/*`, `contracts/policy.ts`, `config/*` | ✅ resolver and packs; ♻ staged delivery; 🆕 drafts, quote check, revert |
| **Route** [12](modules/12-route.md) | Routes, step delivery, gates, releases, loop and budget limits, headless defaults, `route *` commands. | `hook/prepare-on-skill.ts` (becomes the route start), `hook/markers.ts` | 🆕 engine; ♻ hook plumbing |
| **Evidence** [13](modules/13-evidence.md) | Ledger kinds, task directory, `note save/list`, `report` skeleton, record-derived navigation line, Stop-hook checks. | `task/ledger.ts`, `task/slug.ts`, `cli/commands/note.ts`, `review/review-name.ts` | ♻ extended: more kinds, `report`, fold |
| **Requirements** [14](modules/14-requirements.md) | Envelope v2, one-level expansion, raw hashes from the MCP hook, AC numbering, template. | `requirements/normalize.ts`, `skills/shared/requirements-mcp.md` | ♻ envelope; 🆕 expansion, hashes, template |
| **Guard** [15](modules/15-guard.md) | PreToolUse decisions (ask/deny), structural command parsing, Stop hook, gate releases. | `hook/guard-core.ts`, `scripts/guard.mjs` | ♻ parser; 🆕 Stop hook |
| **Checks + Reviewer** [16](modules/16-checks-review.md) | Snapshot, check selection and authorization, isolated reviewer, validation, report, publication page. | `snapshot/*`, `checks/*`, `review/*`, `providers/*`, `publication/*`, `page/*` | ✅ pipeline; 🆕 `check --only`, `format`, `--task` scoping, `--estimate` |
| **Workers** [17](modules/17-workers.md) | Subagent definitions and the `claude -p` worker runner; proposal gate. | `review/claude-reviewer.ts` (the existing worker runner) | ♻ generalized; 🆕 scout, collector, plan checker |

Unchanged and not discussed further: `providers/gitlab`, `publication`, `page` (the view page
and publication flow measured as strong: E3 in best-practices).

## 5. What one run looks like

`/ambicode:investigate https://…/browse/ORD-17` on Sonnet, with the design in place:

```
#  actor   step                                                      context cost   ledger
1  Hook    UserPromptSubmit: `route start investigate <args>`          ~1.5 KB       R1 route
           → mints slug ORD-17, writes the requirement template,
             prints step 1: "fetch ORD-17 and its children with
             <bound server>; the hook takes it from there"
2  Model   mcp getJiraIssue ORD-17 (and children, per step text)       ticket text   —
3  Hook    PostToolUse(mcp): rawHash → ledger; `route next` →          ~4 KB         R2 requirement(s)
           requirements normalized, code-shaped terms extracted,                     R3 map
           map built (shortlist + index find/relates), prints step 2:
           "read these link-blocks (batched cat allowed), confirm or
           reject each candidate, then `route next`"
4  Model   reads spans; may Grep; forms >= 2 hypotheses                 reads         —
5  Model   `$A route next --task ORD-17` → prints step 3: the report    ~1 KB         R4 step
           shape and the before-report rules for these paths
6  Model   writes the answer; `$A note save --task ORD-17 --kind        —             R5 note
           investigation <<EOF`
7  Hook    Stop: every cited path:line exists; a note was saved;        —             R6 stop
           otherwise block once with the list
```

Fixed cost in the model's context: route start message + two step messages, about 6–7 KB,
against today's body (6.5 KB) + `requirements-mcp.md` (5.4 KB) + `prepare-output.md` (4.7 KB) +
hook payload (4–10 KB). Turns the model spends on ceremony: `route next` once (step 5); `note
save` once. Today: `Skill`, `ToolSearch`, `config`, `Read` of two references, `prepare` rerun,
`note save`. **This is the mechanism by which the +4.7 turns are meant to fall; it is a
prediction, measured in [33-measurement.md](33-measurement.md) §2.**

## 6. Keep, rework, drop (v0.4.0 → v2)

| Component | Verdict | Reason (fact) |
|---|---|---|
| Isolated reviewer, snapshot, finding validation, 4-part report | ✅ keep byte-for-byte | M18 |
| Checks selection, run/propose/forbid, authorization seam | ✅ keep; extend with `--only`, `format` | walkthrough §7 pushback: one pipeline owns selection |
| Policy packs, resolver, `policy check` | ✅ keep | works, tested, no measured defect |
| GitLab provider, publication, view page | ✅ keep | E3 strong |
| `prepare` as one command | ♻ becomes `route start` + `map`; the compact projection stays | M16, M17: deliver per step |
| Term shortlist (`locate`) | ♻ keep as one search layer, second-pass terms from the index | M5, M6 |
| Hook-run prepare on `Skill` / slash / MCP read | ♻ becomes route entry points | M3 |
| `requirements-mcp.md` procedure | ♻ shrinks to a template printed by the CLI; expansion added | M11, M1 |
| `prepare-output.md` | ✂ | its content moves into the step text and the payload's 5-line header |
| `Navigation: LSP — …` self-reported line | ✂ replaced by the record-derived line | R3 |
| `requirements.lsp` mandate in investigate/review | ✂ | D1, M8, M10 |
| `allowed-tools: Write(**)` on plan/investigate | ✂ already gone; `task` keeps `Edit/Write` under guard | E2 |
| Skill bodies 6.5–10.6 KB | ♻ ≤ 2.5 KB each: purpose, judgment asked, first command, scope | M1, M17, iteration 2 walk |
| Model-invocable skills, trigger suite | ✂ | D2 |
| Regex guard over the whole command | ♻ segment parser, heredoc stripping | M12 |
| Plan acceptance by click only | ♻ click when a human is present; headless default → `plan-draft` | M13, R4 |
| `evals-triggers` | ✂ retired; cases kept as negatives for "no skill fires on its own" | D2 |

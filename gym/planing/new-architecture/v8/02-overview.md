# Overview: layers, modules, the plugin's own harness

## 1. The one-paragraph design

A user types `/ambicode:<skill> <args>`. A `UserPromptSubmit` hook starts a **route** for that
skill: a declared sequence of steps owned by code, by the model, or by the human. The
route engine (CLI) performs every step code can perform (payload capture and envelope, search with
declared layers, policy, baseline, checks, review input, note naming, report skeleton, skill-local
scripts) and hands the model
**one step's instruction at a time**, at the tail of the command it just ran or in a hook message.
Every step appends to an append-only **ledger** in the task directory; the next step is a fold over
the ledger with bounded re-entry (`revise`), so there is no other state; a step counts as done only
by its own record (R18) and an acting answer is honoured only from a trusted origin and for the
object it named (R17; 12 §8 is the execution contract). Gates — declared in the
route or raised by an error code — have releases and non-acting defaults that are taken only on
record; a human can always ask for another round (D14). A `Stop` hook checks a report-shaped stop
against the ledger, once. The skill body shrinks to the judgment asked and the first command. No
LSP anywhere (D8). Nothing in a route or module names a language: ecosystem specifics are in the
config the model writes at `/ambicode:init` from the manifests and the scout's report (R16, D18); the scout also writes the learning context under `.ambicode/context/`. This is the plugin's own harness inside Claude Code's loop; whether it
earns its cost is measured, and the user decides (D10).

## 2. Layers

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ L3  Skills (user-invoked)      init  rules  investigate  plan  task  review     │  one route + one slim body each (init: no route),
│                                + skills/<name>/scripts/*.mjs (run by `script`)  │  plus its own scripts (C7)
├───────────────────────────────────────────────────────────────────────────────┤
│ L2  Harness                    route engine · step delivery · gates (declared,  │  drives the model through hooks
│                                raised) · revise/repeat · Stop check · headless  │  and command tails
├───────────────────────────────────────────────────────────────────────────────┤
│ L1  Global modules             Search · Policy · Requirements · Evidence ·      │  usable by any skill
│                                Guard · Checks+Review                            │  and by the CLI on its own
├───────────────────────────────────────────────────────────────────────────────┤
│ L0  Platform adapter           Claude Code hooks · tools · limits · git ·       │  the only layer that knows
│                                MCP (read by the session only)                  │  platform facts (M14, M15)
└───────────────────────────────────────────────────────────────────────────────┘
```

Rules between layers: L3 declares a route and holds no procedure code could run (R1); what only
one skill needs is a plain ESM script beside its `SKILL.md` (`skills/<name>/scripts/`, no imports
from `src/`), run by the engine's `script(<name>)` step and never writing the ledger (12 §1). L2 knows
steps, actors, evidence kinds, gates, revises and limits, and nothing about tickets, policy or code;
its state is the ledger. L1 modules are independent and expose a CLI command (the model's view) and
an interface (the route's view); every evidence-writing command advances the route at its tail. L0
holds every platform number and event name.

Plugin-side layout added 2026-10-10 (b): `templates/config.yaml` and `templates/context-format.md` (what init copies and the scout follows), `agents/reviewer.md` and `agents/scout.md` (plugin subagents), `skills/init/scripts/scaffold.mjs`. Repository-side: `.ambicode/` is wholly gitignored: `config.yaml`, `tasks/`, `reviews/`, `context/` (32 §1).

## 3. Framework or not

**An internal framework, not a product one.** Routes (`routes/<skill>/<skill>.yaml`, `routes/gates.yaml`)
and module interfaces are data and seams; the engine is generic. It enforces three things only:
code-owned steps ran (they ran because code ran them), gates were released by someone on record, and
a report does not contradict the ledger. It never decides what the model should conclude, and the
model can stop a route (`$A route stop`) or re-enter a declared step (`--revise`), both recorded. The
risk that structured procedure displaces reasoning (SkillsBench: 13 of 87 tasks worse) is measured,
not argued: 33 §1–2 put the investigate route in front of the user before anything is built on it,
and 41 names the point of no return.

## 4. Module map

| Module | Owns | Absorbs from v0.5.0 | Verdict |
|---|---|---|---|
| **Search** [10](modules/10-search.md) | term shortlist, regex harvest with declaration counts, `grep`, **declared layer lists**, `refs` | `locate.ts`, `dependents.ts`, `navigation.ts` | ♻ shortlist kept; 🆕 pass 2, `refs`, layers; ✂ LSP, exact refs, index, tuning |
| **Policy** [11](modules/11-policy.md) | packs, project `rules`, resolution, staged delivery, command slots, `rules` skill path | `policy/*`, `policies/*`, `config/*` | ✅ resolver; ♻ staging; 🆕 drafts/quotes/revert |
| **Route** [12](modules/12-route.md) | routes, fold with re-entry, declared and raised gates, releases, limits, DSL | `prepare-on-skill.ts`, `markers.ts` | 🆕 |
| **Evidence** [13](modules/13-evidence.md) | ledger (22 kinds incl. `preanswer`), notes with draft-first and promote, task dir, `report`, navigation line | `task/*`, `note.ts`, `review-name.ts` | ♻ |
| **Requirements** [14](modules/14-requirements.md) | raw captured results, envelope from captures or args, binding of asked sources | `modules/requirements/envelope/normalize.ts`, `requirements-mcp.md` | ♻ |
| **Guard** [15](modules/15-guard.md) | structural parser, decisions, Stop hook, gate table test | `guard-core.ts`, `guard.mjs` | ♻ parser; 🆕 Stop |
| **Checks + Review** [16](modules/16-checks-review.md) | snapshot, checks, reviewer subagent input and record, validation, report | `snapshot/*`, `checks/*`, `review/*` | ✅ pipeline; 🆕 `check --name --file`, model-run `format`, `--task`, `--estimate`; ✂ providers, publication, page |
| **Plan check** [17](modules/17-workers.md) | the plan anchor check, a skill script with re-entry | `claude-reviewer.ts` | 🆕 `skills/plan/scripts/plan-check.mjs` |

## 5. One run, with its ceremony count

`/ambicode:investigate https://…/browse/ORD-17` on Sonnet:

```
#  actor   step                                                              context (expected)   ledger
1  Hook    UserPromptSubmit → `route start investigate <args>`: slug ORD-17,  ~1.5 KB              route
           fetch step: "Fetch each requirement URL with your Jira or
           Confluence MCP tools, then run `route next`"
2  Model   mcp getJiraIssue ORD-17                                              ticket text          —
   Hook    PostToolUse(mcp__*): asked key → store the raw result, rawHash       0                    requirement
3  Model   `$A route next --task ORD-17`                                       ~4–6 KB              step
   CLI     ground: envelope from captures, map (layers shortlist →
           harvest → shortlist, printed), before-work and before-report
           rules → the read step
4  Model   reads (batched, then spans); may `$A refs`; >= 2 hypotheses          reads                search
5  Model   writes the answer with `path:line` citations                         —                    —
6  Hook    Stop: the answer's citations exist → saved as the investigation      —                    note
           note and the route advances; otherwise block once
```

**Ceremony turns: 1** (`route next` ×1; ceremony and work are defined in 12 §3.1); **0** in the
sandbox, where nothing is fetched and the envelope is built from the args (the start message's step
is the read step); +1 if the ground step exceeds the inline window and goes to a file; +1 per gate.
Today: `Skill`, `ToolSearch`, `config`, two `Read`s of references, `prepare` rerun, `note save`
(M1). Fixed text in context: **expected 6–8 KB**, **cap 16 KB** (30 §3); today ≈ 21–27 KB of files.
This is the mechanism by which the +4.7 turns are meant to fall; it is a prediction, and 33 §1
reports it per route and gates the point of no return on cost and recall (D10).

## 6. Keep, rework, drop (v0.5.0 → v4)

| Component | Verdict | Fact |
|---|---|---|
| Reviewer (now the `ambicode:reviewer` subagent, Read/Grep/Glob only), snapshot, finding validation, 4-part report | ✅ keep (seams extended, 41 lists which) | M18, C1 |
| Checks selection, run/propose/forbid, authorization seam | ✅ keep; extend with `--name`/`--file`, `format` (model-run) | one pipeline owns selection |
| Policy packs, resolver, `policy check` | ✅ keep | no measured defect |
| GitLab provider, publication state machine, view page | ✂ the model reads the merge request and posts the selected findings through its GitLab MCP server; the hook captures the diff | C2 (model-obeyed, accepted) |
| `prepare` as one command | ♻ `route start` + `map` + `requirements normalize` | M16, M17 |
| Term shortlist (`locate`) | ♻ one layer; pass 2 by regex harvest; layer lists in config; no index, no tuning | M5, M6, D9, C3 |
| Hook-run prepare on `Skill` / slash / MCP read | ♻ `UserPromptSubmit` starts the route; MCP hook captures only (`mcp__.*`, binding inside); `Skill` hook ✂ (dead under D2) | M3, D2 |
| `requirements-mcp.md` | ✂ replaced by the route's `fetch` step text and code-built envelopes over raw captures | M11, M1, R1, C8 |
| `prepare-output.md` | ✂ | content in step text and headers |
| Self-reported `Navigation:` line | ✂ generated from CLI calls, labelled partial | R3 |
| `requirements.lsp` mandate; LSP in any skill; `impact.md` | ✂ backlog | D8, M8, M9, M10 |
| Skill bodies (4.2–10.6 KB; the four model-facing ones 5.9–10.6) | ♻ ≤ 2.5 KB each | M1, M17, M23 |
| Model-invocable skills, trigger suite | ✂ | D2 |
| Regex guard | ♻ structural parser, minimal | M12, C4 |
| Plan acceptance by click only; plan saved only on acceptance | ♻ draft saved first (D11); click promotes; headless → draft on record | M13, R4 |
| Per-skill procedure code in `src/` | ♻ `skills/<name>/scripts/*.mjs` run by the `script` step | C7 |
| `PostToolUse(Edit\|Write)` reminder hook | ✂ until a pack sets `remindOnEdit` (inert today, 89–143 ms per edit) | G18 |

## v7 changes

- **Layers (A1, partly met).** Imports point down only (ranks in the README); the allowlist is empty. L1 modules no longer import the harness. Orchestration that needs the fold runs in L3 skills (`src/skills/*/commands.ts`) through the **guarded-command seam**: each skill declares `COMMAND_SPECS` (`GuardedCommand {name, skill, route: optional|owned}`), the CLI calls `Engine.command(spec, {task}, body)`, and the engine resolves the caller, opens the route view and hands the body a `CommandContext` (`resolve`, `open`, `assertOwner`, `window`, `object`, `consent`, `entries`, `raise`). `CommandContext` replaced `RouteContextPort`. Owner re-check under the lock, consent evaluation and gate raising still run inside L1 module code through that injected context, so the v6 "L1 knows nothing of the route" is only partly true.
- **Composition.** `composition/app.ts` `createApp(runtime)` builds the route registry, the active-route pointer and the engine over the skills' handlers; the engine no longer imports skills. Pure ledger helpers (`buildChain`, `liveHeads`, `exitOf`, `cycleEntries`, `ownerOf`) live in `modules/evidence` so L1 can read the fold without L2.
- **Entry points.** Stop is an engine entry point (`engine.stopHook`, 12 v7 changes), so 12 §8 now lists start, next, command tail, gate hook, resume and stop.

## v8 changes

- **Scripts (C7).** `src/harness/engine/script.ts` runs `script(<name>)` as `skills/<skill>/scripts/<name>.mjs` with `node`; `skills/task/scripts/brief.mjs` imports the `review` skill's `brief` script, so both routes render one brief. The wiring is in 12 §1.

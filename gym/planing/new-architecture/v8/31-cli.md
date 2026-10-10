# CLI surface v3

`$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`. The list below is `COMMANDS` in
`src/cli/main.ts` (the usage text is generated from it). Every command: `--json`; output caps per
30 §4; errors are `AmbicodeError{code}` with the release in the message; exit codes: 0, 1 for
`policy check` errors, 2 coded, 70 unexpected. A test asserts every code is in `outcomes.md`.
**Evidence-writing commands** (marked ⤵) advance the route at their tail (12 §3.1) and print the
next step.

| Command | Module | Flags | Purpose | Status |
|---|---|---|---|---|
| `route start <skill> [args…]` | Route | `--task`, `--headless`, `--project`, `--answer <gate>=<opt>`…, `--fresh`, `--adopt`, `--requirement`, `--plan`, `--from-draft`, `--base`, `--mr`, `--branch` | start, re-print, or **adopt** an open route from another session (#79; automatic for skills owning no file, by `--adopt` for `plan`, H2); `--answer` records `preanswer`s (#78) — acting ones only from a trusted channel (hook/harness; G1); `--headless` is a mode, not an authority; `route-busy` for a second live plan route on a slug whatever the args; `--adopt`/`--fresh` take it over and the former session is refused `route-taken-over` (G2, H2) | 🆕 |
| `route next` ⤵ | Route | `--task`, `--answer <gate>=<opt>`…, `--default <gate>` (headless or asked), `--revise <stepId>`, `--project`, `--show` | advance when the step produced no command | 🆕 |
| `route stop` | Route | `--task`, `--reason blocked\|human\|inconclusive`, `--detail` | record an exit | 🆕 |
| `map` | Search | `--task`, `--project`, `--mode`, `--term…`, `--symbol…`, `[paths…]` | map by the configured layers; prints the list first; a typed `--layers` is refused (`search-layers-not-for-model`, D15) | 🆕 |
| `refs <name>…` | Search | `--project`, `--task`, `--declarations` | lines using names (`git grep -w`), declarations and collisions flagged | 🆕 |
| `requirements normalize` ⤵ | Requirements | `--task` | envelope from captures or from the args (`builtFrom`) | ♻ |
| `policy check <files…>` | Policy | `--project`, `--task`, `--drafts` | validate policy pack files; nonzero exit on an error | ♻ |
| `rules apply` ⤵ | Policy | `--task`, `--project` | make the accepted drafts live packs; needs an honoured acceptance | 🆕 |
| `check` ⤵ | Checks | `--task`, `--name <check>`, `--phase`, `--file…`, `--project`, `--approve` (honoured only per 12 §3.4, #84), `--decline` | runs `checks.<name>.all`, or the `file` form per `--file`, through the shell in the project root (`skills.task.checkTimeoutSeconds`); red is exit ≠ 0, green exit 0 | ♻ |
| `format` ⤵ | Checks | `--task`, `[paths…]` | formatter on the task's files; **model-run** | 🆕 |
| `review` ⤵ | Review | `--task`, `--branch`, `--base`, `--mr`, `--requirement…`, `--evidence`, `--only…`, `--exclude…`, `--context…`, `--with-tests`, `--approve`, `--decline`, `--estimate` | the pipeline up to the reviewer's input; `--estimate` is dry | ♻ |
| `review record` ⤵ | Review | `--task`, `--review` | validate the `ambicode:reviewer` subagent's JSON from stdin and record it | 🆕 |
| `note save` ⤵ | Evidence | `--task`, `--kind investigation\|plan-draft\|notes`, `--from`, `--iteration` | a note; no `plan` kind | ♻ |
| `note promote` ⤵ | Evidence | `--task` | the **accepted** `plan-draft` → `plan`: the latest bound `plan-accept` answer is Accept, honoured (hook or prompt, never a flag, C1), and names this draft's hash; else `plan-not-accepted {reason}`; idempotent (`plan-already-promoted`); `route-taken-over` from a session that lost the route (13 §3, G2, H2) | 🆕 |
| `report` | Evidence | `--task` | generated Evidence and Not verified sections | 🆕 |
| `config validate` | Config | `--json` | validate `.ambicode/config.yaml` against the schemaVersion 4 schema; the only check init relies on | 🆕 |
| `context list` | Context | `--json` | files under `.ambicode/context/`: path, first H1, approximate tokens, and the limits | 🆕 |
| `context write` | Context | `--replace` | an `=== <path>` bundle on stdin; enforces `config.context` limits, refuses duplicate headings and files outside the four kinds; `--replace` removes the rest | 🆕 |
| `version`, `hook`, `help` | — | — | `hook` is the stdin/stdout hook entry; not in `COMMANDS` | ✅ |

Removed in v8 (C3, C5, C7, C8): `route status`, `find`, `relates`, `index`, `locate`, `requirements
template`, `requirements acs`, `policy` (bare), `rules discover|revert`, `prepare`, `bundle`, `view`,
`note list`, `plan check`, `worker run`, `doctor`, `init`, `init propose`, `init --apply`, `config` (bare; `config validate` stays). Plan check, rules discovery and the
init scan are skill scripts run by the route (`script(<name>)`, 12 §1). The ⤵ list is exactly 12
§3.1's evidence-writing list (#95).

Standalone bundles: `scripts/guard.mjs` (PreToolUse).

Conventions: a 3-line header on every model-facing reply; every evidence-writing command prints its
ledger id and then the next step; every step text carries `--task <slug>`; only the Stop hook reads
the transcript, and it fails open.

# CLI surface v3

`$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`. Every command: `--json`; output caps per
30 §4; errors are `AmbicodeError{code}` with the release in the message; exit codes unchanged (0, 1
for `policy check` errors, 2 coded, 70 unexpected). A test asserts every code is in `outcomes.md`.
**Evidence-writing commands** (marked ⤵) advance the route at their tail (12 §3.1) and print the
next step.

| Command | Module | Flags | Purpose | Status |
|---|---|---|---|---|
| `route start <skill> [args…]` | Route | `--task`, `--headless`, `--project`, `--answer <gate>=<opt>`…, `--fresh` | start, re-print, or **adopt** an open route from another session (#79); `--answer` records `preanswer`s (#78) | 🆕 |
| `route next` ⤵ | Route | `--task`, `--answer <gate>=<opt>`…, `--default <gate>` (headless or asked), `--revise <stepId>`, `--conflict "<s>" --sources A,B`, `--project`, `--show` | advance when the step produced no command | 🆕 |
| `route status` | Route | `--task` | the fold, with revises, remaining repeats, sessions, and each map's layers | 🆕 |
| `route stop` | Route | `--task`, `--reason`, `--detail` | record an exit | 🆕 |
| `map` | Search | `--task`, `--project`, `--mode`, `--layers a,b,c` (**route callers only**, D15), `--term…`, `--symbol…`, `[paths…]`, `--show` | map by the configured layers; prints the list first | 🆕 |
| `refs <name>…` | Search | `--project`, `--show` | files/lines using names (`git grep -w`), collisions flagged | 🆕 |
| `find <name>` | Search | `--kind`, `--project` | declarations (harvest or index) | 🆕 |
| `relates <path>` | Search | `--project` | importers/imports (index) or grep | 🆕 |
| `index build\|status` | Search | `--project` | detached build; refuses if `index/` is not ignored | 🆕 |
| `locate [terms…]` | Search | unchanged | the `shortlist` layer alone | ✅ |
| `requirements template` | Requirements | `--requirement…`, `--task` | binding, fetch calls with field lists incl. expansion | 🆕 |
| `requirements normalize` ⤵ | Requirements | `--task` | envelope from captures or from the args (`builtFrom`) | ♻ |
| `requirements acs` | Requirements | `--task` | numbered ACs | 🆕 |
| `policy [paths…]` | Policy | `--project`, `--activity`, `--rule…`, `--stage`, `--show` | resolved policy; one stage | ♻ |
| `policy check <files…>` ⤵ (with `--drafts`) | Policy | `--project`, `--drafts` | validate; quotes; duplicates | ♻ |
| `rules discover\|apply\|revert` | Policy | `--project`, `<pack-id>` | authoring path; `apply` needs an honoured acceptance | 🆕 |
| `prepare` | — | — | alias → `route start` for one release with a deprecation line | ✂ |
| `check <key>` ⤵ | Checks | `--task`, `--only…`, `--phase`, `--approve` (honoured only per 12 §3.4, #84), `--decline` | one check on named files, with the runner summary | 🆕 |
| `format` ⤵ | Checks | `--task`, `[paths…]` | formatter on the task's files; **model-run** | 🆕 |
| `review` ⤵ | Reviewer | unchanged + `--task`, `--estimate` | the pipeline | ♻ |
| `bundle` | Reviewer | unchanged | evidence only | ✅ |
| `view` | Page | unchanged; records selections | ♻ |
| `note save` ⤵ | Evidence | `--task`, `--kind investigation\|plan-draft\|notes`, `--from`, `--iteration` | a note; no `plan` kind | ♻ |
| `note promote` ⤵ | Evidence | `--task` | latest `plan-draft` → `plan`, with an honoured acceptance | 🆕 |
| `note list` | Evidence | `--task` | notes, promotions | 🆕 |
| `report` | Evidence | `--task` | generated sections | 🆕 |
| `plan check` ⤵ | Workers | `--task`, `--from` or stdin | saves the draft first; anchors, ACs, duplicates (code); `onFail` re-entry | 🆕 |
| `worker run <id>` | Workers | `--task` | process worker (runner only; no shipped model workers) | 🆕 |
| `init` | Config | `--dry-run`, `--apply`, `--set` | detect; write config and `.gitignore` on acceptance; migrate v1/v2 config; runs `doctor` at its tail | ♻ |
| `doctor` | Config | `--project` | prove every command starts | 🆕 |
| `config`, `version`, `hook`, `help` | — | unchanged | | ✅ |

Removed from v2: `refs --exact`, `search.exactMaxFiles`, `task.lspPlugins`, `note save --kind plan`,
`route next --resolution` (use `--answer requirements-conflicting=<source>`), the `recorder.mjs` bundle.
The ⤵ list is exactly 12 §3.1's evidence-writing list (#95).

Standalone bundles: `scripts/guard.mjs` (PreToolUse).

Conventions: a 3-line header on every model-facing reply; every evidence-writing command prints its
ledger id and then the next step; every step text carries `--task <slug>` (the guard's `updatedInput`
is an unverified convenience, P47); only the Stop hook reads the transcript, and it fails open.

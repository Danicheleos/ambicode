# CLI surface v2

`$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`. Every command: `--json`; output caps per
30 §4; errors are `AmbicodeError{code}` with the release in the message; exit codes unchanged (0, 1
for `policy check` errors, 2 coded, 70 unexpected). A test asserts every code is in `outcomes.md`.

| Command | Module | Flags | Purpose | Status |
|---|---|---|---|---|
| `route start <skill> [args…]` | Route | `--task`, `--headless`, `--project` | start or re-print | 🆕 |
| `route next` | Route | `--task`, `--answer <gate>=<opt>`, `--default <gate>`, `--conflict`, `--project`, `--show` | advance | 🆕 |
| `route status` | Route | `--task` | the fold | 🆕 |
| `route stop` | Route | `--task`, `--reason`, `--detail` | record an exit | 🆕 |
| `map` | Search | `--task`, `--project`, `--mode`, `--term…`, `--symbol…`, `[paths…]`, `--show` | two-pass map (regex pass 2; index optional) | 🆕 |
| `refs <name>…` | Search | `--exact`, `--project`, `--show` | files/lines using names; one child per `--exact` call | 🆕 |
| `find <name>` | Search | `--kind`, `--project` | declarations | 🆕 |
| `relates <path>` | Search | `--project` | importers/imports (index) or grep | 🆕 |
| `index build\|status` | Search | `--project` | detached build; refuses if `index/` is not ignored | 🆕 |
| `locate [terms…]` | Search | unchanged | L2 alone | ✅ |
| `requirements template` | Requirements | `--requirement…`, `--task` | binding, fetch calls incl. expansion | 🆕 |
| `requirements normalize` | Requirements | `--task` or `--evidence -` | envelope from captures (or from the model, labelled) | ♻ |
| `requirements acs` | Requirements | `--task` | numbered ACs | 🆕 |
| `policy [paths…]` | Policy | `--project`, `--activity`, `--rule…`, 🆕 `--stage`, `--show` | resolved policy; one stage | ♻ |
| `policy check <files…>` | Policy | `--project`, 🆕 `--drafts` | validate; quotes; duplicates | ♻ |
| `rules discover\|apply\|revert` | Policy | `--project`, `<pack-id>` | authoring path | 🆕 |
| `prepare` | — | — | alias → `route start` for one release with a deprecation line | ✂ |
| `check <key>` | Checks | `--task`, `--only…`, `--phase`, `--approve`, `--decline` | one check on named files, with the runner summary | 🆕 |
| `format` | Checks | `--task`, `[paths…]` | formatter on the task's files | 🆕 |
| `review` | Reviewer | unchanged + `--task`, 🆕 `--estimate` | the pipeline | ♻ |
| `bundle` | Reviewer | unchanged | evidence only | ✅ |
| `view` | Page | unchanged; records selections | ♻ |
| `note save` | Evidence | `--task`, `--kind`, 🆕 `--from`, 🆕 `--iteration` | a note; `plan` needs acceptance on record | ♻ |
| `note list` | Evidence | `--task` | notes | 🆕 |
| `report` | Evidence | `--task` | generated sections | 🆕 |
| `plan check` | Workers | `--task`, `--from` or stdin | anchors, ACs, duplicates (code) | 🆕 |
| `worker run <id>` | Workers | `--task` | process worker | 🆕 (runner only; no shipped model workers) |
| `init` | Config | `--dry-run`, 🆕 `--apply`, 🆕 `--set` | detect; write; migrate v1 config | ♻ |
| `doctor` | Config | `--project` | prove every command starts | 🆕 |
| `config`, `version`, `hook`, `help` | — | unchanged | | ✅ |

Standalone bundles: `scripts/guard.mjs` (PreToolUse). The v1 `recorder.mjs` is not built.

Conventions: a 3-line header on every model-facing reply; every evidence-writing command prints its
ledger id; `--task` is added by the guard's `updatedInput` when missing during a route; only the Stop
hook reads the transcript, and it fails open.

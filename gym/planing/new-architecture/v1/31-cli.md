# CLI surface v2

`$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`. Every command: `--json`; output caps
in 30-harness §4; errors are `AmbicodeError{code}` with the release in the message; exit codes
unchanged (0, 1 for `policy check` errors, 2 for a coded error, 70 unexpected). Every code is
documented in `outcomes.md` and a test asserts that (F3).

| Command | Module | Flags | Purpose | Status |
|---|---|---|---|---|
| `route start <skill> [args…]` | Route | `--task`, `--headless` | start or re-print the route | 🆕 |
| `route next` | Route | `--task`, `--accept <gate>`, `--decline <gate>`, `--show <payload>` | advance; print the next step | 🆕 |
| `route status` | Route | `--task` | the fold as a table | 🆕 |
| `route stop` | Route | `--task`, `--reason`, `--detail` | record the exit | 🆕 |
| `map` | Search | `--task`, `--project`, `--mode prompt\|context`, `--term…`, `--symbol…`, `[paths…]`, `--show` | the two-pass map | 🆕 (absorbs `prepare`'s navigation) |
| `refs <name>` | Search | `--exact`, `--project`, `--show` | files/lines using a name | 🆕 |
| `find <name>` | Search | `--kind`, `--project` | declarations | 🆕 |
| `relates <path>` | Search | `--project` | importers and imports | 🆕 |
| `index build\|status` | Search | `--project`, `--background` | the symbol index cache | 🆕 |
| `locate [terms…]` | Search | unchanged | the L2 shortlist alone | ✅ |
| `requirements template` | Requirements | `--requirement…`, `--task` | binding + skeleton + expansion steps | 🆕 (replaces the shared reference) |
| `requirements normalize` | Requirements | `--requirement…`, `--evidence -` | validate an envelope on its own | 🆕 (was inside `prepare`) |
| `requirements acs` | Requirements | `--task` | the numbered AC list | 🆕 |
| `policy [paths…]` | Policy | `--project`, `--activity`, `--rule…`, 🆕 `--stage`, `--show` | resolved policy; one stage | ♻ |
| `policy check <files…>` | Policy | `--project`, 🆕 `--drafts` | validate packs; quotes; duplicates | ♻ |
| `rules discover\|apply\|revert` | Policy | `--project`, `<pack-id>` | the authoring path | 🆕 |
| `prepare` | — | — | **removed** as a model-facing command; `route start` composes its parts. Kept one release as an alias that prints the deprecation and runs `route start`. | ✂ |
| `check <key>` | Checks | `--task`, `--only <file>…`, `--phase red\|green`, `--approve`, `--decline` | one check on named files | 🆕 |
| `format` | Checks | `--task`, `[paths…]` | the project formatter on the task's files | 🆕 |
| `review` | Reviewer | unchanged + `--task` scoping, 🆕 `--estimate` | the pipeline | ♻ |
| `bundle` | Reviewer | unchanged | evidence without the model | ✅ |
| `view` | Page | unchanged | the local page; 🆕 records selections | ♻ |
| `note save` | Evidence | `--task`, `--kind investigation\|plan\|plan-draft\|notes`, 🆕 `--from <path>` | a note; `plan` needs an acceptance | ♻ |
| `note list` | Evidence | `--task` | notes of a task | 🆕 |
| `report` | Evidence | `--task` | generated Evidence / Not verified | 🆕 |
| `worker run\|save <id>` | Workers | `--task` | process worker / agent hand-back | 🆕 |
| `plan check` | Workers (code part) | `--task`, stdin or `--from` | anchors, ACs, duplicates | 🆕 |
| `init` | Config | `--dry-run`, 🆕 `--apply`, 🆕 `--set k=v…` | detect; write; migrate | ♻ |
| `doctor` | Config | `--project` | prove every configured command starts | 🆕 |
| `config` | Config | unchanged | effective values | ✅ |
| `version`, `hook`, `help` | — | unchanged | | ✅ |

`scripts/guard.mjs` (PreToolUse) and 🆕 `scripts/recorder.mjs` (optional PostToolUse recorder) are
standalone bundles with no imports.

## Conventions

- Every model-facing command prints a 3-line header (what this is, what to do with it, the command
  that ends the step) before its payload, so a step is self-explaining (the 5-line header idea from
  the walkthrough, made uniform).
- Every command that writes evidence prints the ledger id it wrote (`L12`), so a report can cite it.
- `--task` is added by the guard's `updatedInput` when a route is active and the flag is missing.
- No command reads the transcript except the Stop hook, and that one fails open.

# Skill: init (user-invoked)

## Purpose

Produce a working `.ambicode/config.yaml` whose every non-null command is proven to start, bind the
requirement server, set up the index cache ignore, and say what is missing. One decision screen; the
CLI writes the YAML; the default writes nothing.

## Trigger

`/ambicode:init` only (`disable-model-invocation: true`, unchanged).

## What the model loads

`SKILL.md` ≤ 1.5 KB: purpose, the fallback start line, how to present the proposal, the one gate.

## Route `init`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | code | `init --dry-run --json`: projects, commands, packs, rule sources, gitignore lines (incl. `.ambicode/index/`), `format` tools, index tooling on PATH or in `node_modules/.bin`, installed LSP plugins (`claude plugin list --json`; "unknown" when the command is missing, P24) | proposal ≤ 6 KB | ⛔ `not-a-repository`; ⛔ `config-unparsable` → ⏸ *back up and regenerate* / *stop* (default stop) |
| 2 | model | lists the Jira/Confluence MCP servers it can see; adds them to the proposal; asks nothing yet | — | — |
| 3 | human ⏸ | one `AskUserQuestion`: *Apply as proposed* / *Adjust* / *Cancel*; MCP server if several; pytest/Playwright mapping or null; `search.index`: *codeindex* / *none* (default none) | `acceptance` | release *Cancel*; **default (headless or unanswered): write nothing**, print the proposal and the exact `init --apply --set …` line |
| 4 | code | `init --apply --set k=v…` (only with an `acceptance` or `--default` on record): YAML through the document API, comments kept; existing file → diff, missing slots only | config written | — |
| 5 | code | `doctor`: `--version` or an empty selection per non-null command; `argv[0]` resolved; detached `index build` if an adapter is set | doctor table | a failing command is reported, not nulled |
| 6 | model | reads the table back; quotes notices verbatim; offers `/ambicode:rules` if sources exist | — | Stop hook (b): the table equals the doctor's |

The guard denies `Write/Edit` on `.ambicode/config.yaml` while the init route is active; the skill's
`allowed-tools` loses those grants.

## Config deltas written by init (v2)

```yaml
search: { index: none | codeindex, exactMaxFiles: 3000 }
task: { lspPlugins: [typescript-lsp@claude-plugins-official] }   # advisory; migrated from requirements.lsp
workers: { approved: [] }
guard: { askOutsideMap: false }
review: { onInvalid: void }
projects[].commands.format: null | { argv: [...] }
```

## Measured acceptance

100% of non-null commands pass `doctor` on the 20 fixtures; 0 model edits of YAML (guard deny count);
median command-to-config under 60 s on the fixtures.

## What changes from v0.4.0

Mandatory dry run; one gate with a non-acting default; `--apply --set`; `doctor`; index and format
detection; LSP mandate becomes advice.

## Open problems

- P24 `claude plugin list` availability per environment.

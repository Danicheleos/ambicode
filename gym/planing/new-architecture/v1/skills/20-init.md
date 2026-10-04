# Skill: init (user-invoked)

## Purpose

Produce a working `.ambicode/config.yaml` whose every non-null command is proven to start, bind the
requirement server, set up the search index cache, and say what is missing. One decision screen,
no drip of questions, the CLI writes the YAML.

## Trigger

`/ambicode:init` only (`disable-model-invocation: true`, unchanged). Other skills name it on
`config-missing`.

## What the model loads

`SKILL.md` ≤ 1.5 KB: purpose, "run `$A route start init`", how to present the proposal, the one gate.

## Route `init`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | code | `init --dry-run --json`: detect projects, commands, packs, rule sources, LSP plugin advice, gitignore entries; 🆕 detect `format` tools; 🆕 detect index tooling (codeindex/agentmap on PATH or in `node_modules/.bin`); 🆕 run `claude plugin list --json` to see installed LSP plugins (task advisory) | proposal ≤ 6 KB | ⛔ `not-a-repository` → "run inside a git repository"; ⛔ `config-unparsable` → ⏸ *back up and regenerate* / *stop* |
| 2 | model | Looks at its own tool list for Jira/Confluence MCP servers (only the session can) and adds them to the proposal; **asks nothing yet** | — | — |
| 3 | human ⏸ | One `AskUserQuestion` (multi-select where apt): *Apply as proposed* / *Adjust* / *Cancel*; which MCP server (if several); for pytest/Playwright, *add a mapping from layout X* / *leave null*; `search.index`: *codeindex* / *agentmap* / *none* (default none, R10) | `acceptance` | release: *Cancel*; headless default: *Apply as proposed* with `mcpServer: null`, `search.index: none` |
| 4 | code | `init --apply --set k=v…`: writes YAML through the document API (comments kept); an existing file gets a diff and only missing slots added | `note`-free; config written | — |
| 5 | code | `doctor`: for every non-null command, `--version` or an empty selection; `argv[0]` resolved; index build attempted once (background) | doctor table | a failing command is reported, not nulled silently |
| 6 | model | Reads the table back: project × check → proven / null: reason / failed: output; quotes the notices verbatim; offers `/ambicode:rules` if sources were found | — | Stop hook: the table equals the doctor's result |

The agent has no hand-edit path: the guard denies `Write/Edit` on `.ambicode/config.yaml` while
the init route is active (its `allowed-tools` loses `Write/Edit(.ambicode/config.yaml)`).

## Config deltas written by init (v2)

```yaml
search:
  index: none | codeindex | agentmap        # default none
  exactMaxFiles: 3000
task:
  lspPlugins: [typescript-lsp@claude-plugins-official]   # advisory; was requirements.lsp
workers:
  approved: []                               # e.g. [scout]
guard:
  askOutsideMap: false
projects[].commands.format: null | {argv: [...]}
```

`requirements.lsp` is migrated to `task.lspPlugins` on `--apply` with a notice.

## Measured acceptance

- 100% of non-null commands pass `doctor` on the 20 fixtures.
- 0 model edits of YAML (guard deny count in traces).
- Median command-to-config under 60 s on the fixtures (timed in the smoke test).

## What changes from v0.4.0

Mandatory dry run; one gate; `--apply --set`; `doctor`; index and format detection; the LSP
mandate becomes advice under `task`.

## Open problems

- P24 `claude plugin list` from inside a hook or CLI: works in a terminal; inside the eval sandbox
  the CLI is a different binary. The step degrades to "unknown" when the command is missing.

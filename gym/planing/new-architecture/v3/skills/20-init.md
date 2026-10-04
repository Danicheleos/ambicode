# Skill: init (user-invoked)

## Purpose

Produce a working `.ambicode/config.yaml` whose every non-null command is proven to start, bind the
requirement server, write the search layer lists explicitly (D9), set up the index cache ignore, and
say what is missing. One decision screen; the CLI writes the YAML; the default writes nothing.

## Trigger

`/ambicode:init` only (`disable-model-invocation: true`, unchanged).

## What the model loads

`SKILL.md` ≤ 1.5 KB: purpose, the fallback start line, how to present the proposal, the one gate.

## Route `init`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | code | `init --dry-run --json`: projects, commands, packs, rule sources, gitignore lines (incl. `.ambicode/index/`), `format` tools, index tooling on PATH or in `node_modules/.bin`, default `search.layers` | proposal ≤ 6 KB | ⛔ `not-a-repository`; `config-unparsable` → raised gate ⏸ *back up and regenerate* / *stop* (default stop) |
| 2 | model | lists the Jira/Confluence MCP servers it can see; adds them to the proposal; puts the gate to the human | — | — |
| 3 | human ⏸ `init-apply` | one `AskUserQuestion`: *Apply as proposed* / *Adjust* / *Cancel*; MCP server if several; pytest/Playwright mapping or null; `search.index`: *codeindex* / *none* (default none) | `acceptance` | release *Cancel*; **default (headless, never-asked): write nothing**, print the proposal and the exact `init --apply --set …` line |
| 4 | model → code | the gate's *Apply* text names the command: `$A init --apply --set k=v…` — honoured only with an `acceptance` on record (`via: hook\|prompt`, or `via: flag` in headless, 12 §3.4): YAML through the document API, comments kept; existing file → diff, missing slots only; `.gitignore` lines written now (30 §9) | config written | ⛔ `init-unconfirmed` otherwise |
| 5 | code (tail of 4) | `doctor`: `--version` or an empty selection per non-null command; `argv[0]` resolved; detached `index build` if an adapter is set | doctor table | a failing command is reported, not nulled |
| 6 | model | reads the table back; quotes notices verbatim; offers `/ambicode:rules` if sources exist | — | Stop hook (b): the table equals the doctor's |

The guard denies `Write/Edit` on `.ambicode/config.yaml` and `.gitignore` while the init route is
active; the skill's `allowed-tools` loses those grants.

## Config written by init (v3)

```yaml
schemaVersion: 3
search:
  index: none | codeindex
  layers:
    prompt:  [shortlist, harvest, shortlist]        # + index.find when index != none
    context: [grep, harvest]                        # + index.relates when index != none
workers: { approved: [] }
guard: { askOutsideMap: false }
review: { onInvalid: void }
projects[].commands.format: null | { argv: [...] }
```

`requirements.lsp` / `task.lspPlugins` are dropped (D8); a v1/v2 config with them loads with a notice.

## Ceremony

1 gate (`AskUserQuestion`) + 1 work command (`init --apply`, which runs `doctor` at its tail).

## Measured acceptance

100% of non-null commands pass `doctor` on the 20 fixtures; 0 model edits of YAML or `.gitignore`
(guard deny count); median command-to-config under 60 s on the fixtures.

## What changes from v0.4.0

Mandatory dry run; one gate with a non-acting default; `--apply --set`; `doctor`; index and format
detection; explicit layer lists; LSP mandate removed.

## Open problems

- P24 `claude plugin list` is no longer consulted (no LSP advice); the probe is dropped.

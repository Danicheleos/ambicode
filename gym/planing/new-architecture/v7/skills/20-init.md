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
| 1 | code | **Bootstrap (G4)**: `route start init` resolves the repository only — a missing `.ambicode/config.yaml` is the normal input and never `config-missing` (12 §2.1 exception); the ledger goes to `.ambicode/task/init-<date>/` with no config. Then `init --dry-run --json`: projects and their **ecosystem adapter** (R16: declaration patterns, source globs, runner and formatter adapters — TypeScript and Python today, any ecosystem the adapter table names), commands, packs, rule sources, gitignore lines (incl. `.ambicode/index/`), `format` tools, index tooling on PATH or in `node_modules/.bin`, default `search.layers` | proposal ≤ 6 KB | ⛔ `not-a-repository`; an existing but unparsable config → raised gate `config-unparsable` ⏸ *back up and regenerate* / *stop* (default stop); *back up* copies the file to `config.yaml.bak-<ts>` **before** the proposal is built from detection alone |
| 2 | model | lists the Jira/Confluence MCP servers it can see; adds them to the proposal; puts the gate to the human | — | — |
| 3 | human ⏸ `init-apply` | one `AskUserQuestion`: *Apply as proposed* / *Adjust* / *Cancel*; MCP server if several; runner mapping or null; `search.index`: *codeindex* / *none* (default none). *Adjust* → the proposal is re-printed with the human's free text quoted and asked again as *Apply as adjusted*, so the written values are in an `acceptance.answer` (#96) | `acceptance` | release *Cancel* (the ledger directory `.ambicode/task/init-<date>/` stays, named in the message, #142); **default (headless, never-asked): write nothing**, print the proposal and the exact `init --apply --set …` line |
| 4 | model → code | the gate's *Apply* text names the command: `$A init --apply --set k=v…` — honoured only with an `acceptance` on record (`via: hook` bound to a printed instance, or `via: prompt`; never `via: flag`, 12 §3.4, G1, C1) whose `answer` carries the same `--set` values (the values are the object here, #96): YAML through the document API, comments kept; existing file → diff, missing slots only; `.gitignore` lines written now (30 §9) | config written | ⛔ `init-unconfirmed` otherwise (also when the typed `--set` values differ from the accepted ones) |
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

- None specific to init (P24 is closed in 40). An ecosystem with no adapter is reported as
  "unknown ecosystem: shortlist and grep only" and the route still runs (R16).

## Scenarios the fixtures drive (33 §8, G4)

Clean git repository, no config → `route start init` → dry run → gate → *Cancel* → nothing written
**outside `.ambicode/task/init-<date>/`** (that directory is untracked until `init --apply` writes
the ignore line; the Cancel message says so with `rm -r` as the clean-up, #142), the proposal
printed with the `init --apply --set …` line; the same repository again → *Apply* → config and
`.gitignore` written, `doctor` table. Unparsable config → `config-unparsable` → *back up
and regenerate* → `.bak` exists before the new file. Headless → write nothing, print the line.

## v7 changes

**B16.** Init saves its proposal as `.ambicode/config.draft.yaml` before asking; the answer is bound to the draft hash, apply writes exactly that draft and refuses one edited after the answer; if re-detection differs it shows the diff and asks again. MCP servers, runner and `search.index` are separate choices of one question; overrides bind through `ConsentBinding.set`; the `Values:` line is gone. Project detection follows the measured profile (A5).

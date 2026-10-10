# Skill: init (user-invoked)

## Purpose

Produce a working `.ambicode/config.yaml` whose non-null commands are proven to start (`doctor`),
bind the requirement server, write the search layer lists, and say what is missing. One decision
screen; the model writes the YAML from a scan, the CLI validates and writes exactly the draft the
user accepted; the default writes nothing.

## Trigger

`/ambicode:init` only (`disable-model-invocation: true`, unchanged).

## What the model loads

`SKILL.md`: purpose, the fallback start line, how to present the proposal, the one question.
`references/outcomes.md` is named when an error code appears.

## Route `init`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 `scan` | code | **Bootstrap (G4)**: `route start init` resolves the repository only — a missing `.ambicode/config.yaml` is the normal input and never `config-missing` (12 §2.1 exception); the ledger goes to `.ambicode/task/init-<date>/` with no config. `script(scan)` lists manifests, lockfiles, package scripts, tools on PATH or in `node_modules/.bin`, built-in packs with their `appliesTo` globs, rule sources, the baseline ref and whether a config exists (each list capped at 40) | scan text | `onError: stop:blocked`; ⛔ `not-a-repository` |
| 2 `detect` (`repeat: 3`) | model | **the ecosystem judgment is the model's (C6, model-obeyed)**: writes the whole config from the scan (schemaVersion 3; `baseline`; `review`; `checks`; `requirements.mcpServer` from the Jira/Confluence servers it can see or null; one project per manifest root with `id`, `root`, `ecosystem` as free text, `packs`, `shortlist` globs, `commands`, `checks`); keeps every value of an existing config; then `$A init propose --task <slug>` with the YAML on stdin | `steps/proposal.yaml` | — |
| 3 `propose` | code | `init.propose` validates the YAML through the config schema (a ```yaml fence is tolerated), saves it as `.ambicode/config.draft.yaml` and pins the draft hash on the gate print | draft | `onFail: revise detect` with the bad field (≤ 3 `detect` runs) |
| 4 `init-apply` ⏸ | human | one `AskUserQuestion`: *Apply* / *Adjust* / *Cancel*; *Adjust* and free text → `revise detect --change <text>` and the question is asked again (`maxRevises: 20`); the answer is bound to the draft hash | `acceptance {object}` | release *Cancel* (the directory `.ambicode/task/init-<date>/` stays, named in the message, #142); **default (headless, never-asked): write nothing** |
| 5 `apply` | model | `when gate.init-apply.is(Apply)`: runs the question's `runs:` line, `$A init --apply --task <slug>` — honoured only with an `acceptance` on record (`via: hook` bound to a printed instance, or `via: prompt`; never `via: flag`, 12 §3.4, G1, C1) whose bound draft hash equals the file's: writes exactly the draft (an existing config is first copied to `config.yaml.bak-<ts>`), adds the `.gitignore` lines, deletes the draft, runs `doctor` | config written, `steps/doctor.md` | ⛔ `init-unconfirmed` otherwise (including `draft-differs`: the draft was edited after the answer) |
| 6 `close` | code | `init.close` | — | route ends |

The guard denies `Write/Edit` on `.ambicode/config.yaml` and `.gitignore` while the init route is
active (15 §1). `doctor` runs `--version` or an empty selection per non-null command and resolves
`argv[0]`; a failing command is reported, not nulled. The model shows the table as printed and
offers `/ambicode:rules` when rule sources were found.

## Config written by init (v3)

```yaml
schemaVersion: 3
search:
  layers:
    prompt:  [shortlist, harvest, shortlist]
    context: [grep, harvest]
guard: { askOutsideMap: false }
projects[].commands.format: null | { argv: [...] }
```

`requirements.lsp` / `task.lspPlugins` are dropped (D8); a v1/v2 config with them loads with a notice.

## Ceremony

1 `init propose` + 1 gate (`AskUserQuestion`) + 1 work command (`init --apply`, which runs `doctor`).

## Measured acceptance

100% of non-null commands pass `doctor` on the 20 fixtures; 0 model edits of YAML or `.gitignore`
(guard deny count); median command-to-config under 60 s on the fixtures. Not re-measured since C6.

## What changes from v0.5.0

Scan script and model-written proposal; one gate with a non-acting default; `--apply` bound to the
draft; `doctor`; explicit layer lists; LSP mandate removed.

## Open problems

- The model's ecosystem judgment has no code check beyond the config schema (C6, accepted
  2026-10-10): a wrong command is found by `doctor`, a wrong `shortlist` glob by nothing. An
  ecosystem the model does not recognise yields `ecosystem` free text and nulls (R16).

## Scenarios the fixtures drive (33 §8, G4)

Clean git repository, no config → `route start init` → scan → proposal → gate → *Cancel* → nothing
written **outside `.ambicode/task/init-<date>/`** (untracked until `init --apply` writes the ignore
line; the Cancel message names `rm -r` as the clean-up, #142); the same repository again → *Apply*
→ config and `.gitignore` written, `doctor` table. A proposal with a bad field → `detect` again with
the error. Headless → write nothing, print the proposal.

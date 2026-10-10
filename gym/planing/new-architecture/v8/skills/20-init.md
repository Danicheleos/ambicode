# Skill: init (user-invoked)

> Rewritten 2026-10-10 (b) ([CHANGELOG](../CHANGELOG.md)): no route, no draft, no gate, no `doctor`. The earlier route-based design (scan, `init propose`, `init-apply`, `init --apply`) is gone.

## Purpose

Create the `.ambicode/` landing folder, a valid `config.yaml` (schemaVersion 4) and the learning context,
in one run. Agents do the work; a script scaffolds; the schema validates.

## Trigger

`/ambicode:init [--auto]` only (`disable-model-invocation: true`). `--auto` never asks and skips manual and web rules.

## Steps (`skills/init/SKILL.md`, no `route start`)

1. `skills/init/scripts/scaffold.mjs` (one call): git-root check (exit 2 otherwise), creates `.ambicode/{tasks,reviews,context}`, writes `config.yaml` from `templates/config.yaml` with the id, adds `.ambicode/` to `.gitignore`; prints `{created, existing, gitignore, configExisted}`. An existing config without `--auto`: ask refresh or abort.
2. Launch `ambicode:scout` (`agents/scout.md`; tools Bash, Read, Grep, Glob) in the background with `skills.init.scout` model and effort. It reads `templates/context-format.md`, maps the repository in about 8 tool calls, writes `context/` with one `context write --replace` and returns `projects[{id, paths, include, exclude}]` and up to 10 candidate conventions.
3. Meanwhile one Glob for manifests and lockfiles, read what is found, derive `ecosystem`, `commands` and `checks.<name>.{all,file}`. Unknown stays null.
4. On the scout's report: `paths`, `include`, `exclude`; `packs` from each `policies/*.yaml` `appliesTo`; `rules` (at most 10, deduplicated: scout conventions, unless `--auto` one web search and one confirming question).
5. One Write of `.ambicode/config.yaml`, then `config validate`; on errors one corrective Write.
6. Summary: projects, checks found and missing, context files, open questions.

## Guarantees and gaps

Code checks the schema (strict; older versions are one `config-invalid`), the context limits and the scaffold. The ecosystem judgment (commands, checks, include/exclude) is the model's and has no code check beyond the schema (accepted C6; R16 holds: free text, no tables). A wrong command surfaces when a check runs. The scout's writes are bounded by `config.context`.

## Config

See 32 §5 for the schema. `skills.init` holds `scout {model, effort, timeoutMinutes}` and `ruleSources`.

## Scenarios the fixtures drive (33 §8)

Clean git repository → scaffold, config validates, context lists. Same repository again → `configExisted`, refresh or abort. Not a git repository → exit 2, nothing written. Bad config field → one corrective Write.

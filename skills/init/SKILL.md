---
name: init
description: "Set up AMBICODE in this repository: .ambicode/ folder, config.yaml, policy packs, candidate rules and learning context. Run once per project."
argument-hint: "[--auto]"
disable-model-invocation: true
allowed-tools: Bash(node *skills/init/scripts/*) Bash(node *ambicode.mjs config *) Bash(node *ambicode.mjs route start rules*) Read Write(.ambicode/config.yaml) Write(.ambicode/policies/drafts/**) Glob Grep Agent AskUserQuestion WebSearch
---
`--auto` in `$ARGUMENTS`: never ask, skip manual and web rules. Run commands plain; never poll.

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/scaffold.mjs"`. Exit 2: stop, tell the user. `configExisted` and not `--auto`: ask refresh or abort.
2. Read `.ambicode/config.yaml`. Launch `ambicode:scout` in the background (`model`/`effort` from `skills.init.scout`), prompt: "Map this repo, write the context, return your report."
3. Meanwhile one Glob for manifests and lockfiles (depth 2), read them, derive `ecosystem`, `commands`, `checks.<name>.{all,file}` (`{file}` placeholder). Unknown stays null; invent nothing. End your turn.
4. On the scout's report: `paths`, `include`, `exclude`, and per project `packs`, picked by what the scout found there from `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" config packs --list` (id, purpose). One Write of `.ambicode/config.yaml` (template shape; no `rules` key). Then `config packs` copies the named built-ins to `.ambicode/policies/`. Then `config validate`; on errors one corrective Write.
5. Rules are packs, never config. Candidates: the scout's conventions, unless `--auto` one WebSearch of core-stack practice and one AskUserQuestion for the user's own. Draft them per `references/rules.md`, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start rules` (not with `--auto`); the user applies them at its table.
6. Summary: projects, packs enabled, checks found and missing, context files, drafts waiting, open questions. Errors: `references/outcomes.md`.

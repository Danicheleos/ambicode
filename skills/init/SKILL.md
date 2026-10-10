---
name: init
description: "Set up AMBICODE in this repository: .ambicode/ folder, config.yaml, rules and learning context. Run once per project."
argument-hint: "[--auto]"
disable-model-invocation: true
allowed-tools: Bash(node *skills/init/scripts/*) Bash(node *ambicode.mjs config validate*) Read Write(.ambicode/config.yaml) Glob Grep Agent AskUserQuestion WebSearch
---
`--auto` in `$ARGUMENTS`: never ask, skip manual and web rules. Run commands plain; never poll.

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/scaffold.mjs"`. Exit 2: stop, tell the user. `configExisted` and not `--auto`: ask refresh or abort.
2. Read `.ambicode/config.yaml`. Launch `ambicode:scout` in the background (`model`/`effort` from `skills.init.scout`), prompt: "Map this repo, write the context, return your report."
3. Meanwhile one Glob for manifests and lockfiles (depth 2), read them, derive `ecosystem`, `commands`, `checks.<name>.{all,file}` (`{file}` placeholder). Unknown stays null; invent nothing. End your turn.
4. On the scout's report: `paths`, `include`, `exclude`. `packs`: Glob `${CLAUDE_PLUGIN_ROOT}/policies/*.yaml`, read each `appliesTo`, put the ids of packs matching the project into `packs`. `rules` (`{source: scout|manual|web, rule}`, at most 10, deduplicated): the scout's conventions, unless `--auto` one WebSearch of core-stack practice and one AskUserQuestion to confirm.
5. One Write of `.ambicode/config.yaml` (keep the template shape), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" config validate`; on errors one corrective Write.
6. Summary: projects, checks found and missing, context files, open questions. Errors: `references/outcomes.md`.

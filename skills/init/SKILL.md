---
name: init
description: "Set up AMBICODE in this repository: .ambicode/ folder, config.yaml, policy packs, candidate rules and learning context. Run once per project."
argument-hint: "[--auto]"
disable-model-invocation: true
allowed-tools: Bash(node *skills/init/scripts/*) Bash(node *ambicode.mjs config *) Bash(node *ambicode.mjs context write*) Bash(node *ambicode.mjs route start rules*) Read Write(.ambicode/config.yaml) Write(.ambicode/policies/drafts/**) Glob Grep Agent AskUserQuestion WebSearch
---
`--auto` in `$ARGUMENTS`: never ask, skip manual and web rules. Run commands plain; never poll.

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/scaffold.mjs" --task init`. Exit 2: stop, tell user. `configExisted` and not `--auto`: AskUserQuestion: refresh or abort.
2. Read `.ambicode/config.yaml`. Launch `ambicode:scout` in background (`model`/`effort`: `skills.init.scout`), prompt: "Map this repo, write the context, return your report."
3. One Glob for manifests and lockfiles (depth 2), read them, derive `ecosystem`, `commands`, `checks.<name>.{all,file}` (`{file}` placeholder). Unknown stays null. Hold them for step 4; end your turn.
4. On the scout's report: `paths`, `include`, `exclude`, and per project `packs`, picked by the scout's findings from `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" config packs --list`. One Write of `.ambicode/config.yaml` (template shape; no `rules` key). `config packs --task init` copies the named built-ins to `.ambicode/policies/`. `config validate --task init`; on errors one corrective Write.
5. Rules are packs, never config. Candidates: the scout's conventions, unless `--auto` one WebSearch of core-stack practice and one AskUserQuestion for the user's own. Draft them per `references/rules.md`, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start rules --task init` (not with `--auto`); the user applies them at its table.
6. Summary: projects, packs, checks found/missing, context files, drafts waiting, open questions. Errors: `references/outcomes.md`.

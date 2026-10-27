---
name: init
description: "Set up AMBICODE in this repository: .ambicode/ folder, config.yaml, policy packs, candidate rules and learning context. Run once per project."
argument-hint: "[--auto]"
disable-model-invocation: true
allowed-tools: Bash(node *skills/init/scripts/*) Bash(node *ambicode.mjs config *) Bash(node *ambicode.mjs context write*) Bash(node *ambicode.mjs policy check*) Bash(node *ambicode.mjs route start rules*) Read Write(//**/.ambicode/config.yaml) Write(//**/.ambicode/policies/drafts/**) Glob Grep Agent AskUserQuestion WebSearch
---
`--auto` in `$ARGUMENTS` alone decides: with it never ask, skip WebSearch and the rules route (drafts are still written); without it ask and start the rules route even if a notice calls the session non-interactive. Run commands plain, never alias a command to a shell variable (a chain repeats the full path); never poll.

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/scaffold.mjs" --task init`. Exit 2: stop, tell user. `configExisted`: ask: refresh or abort.
2. Read root `*.md` and the layout (depth 2) in one turn. Find the stack and defining files; derive `ecosystem`, `commands`.
3. Launch `ambicode:scout` in background with scaffold's `scout` `model`, `effort`. Prompt it to write the context. Same turn, in parallel: read `references/rules.md` and `skills/rules/references/pack-format.md`, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" config packs --list`.
4. Find the stack's configuration and rule files; derive its usual checks from them, defining files winning; fill `checks.<name>.{all,file}` (`{file}` placeholder), else null. Hold; end turn.
5. On its report, parallel Writes in one turn: `.ambicode/config.yaml` (template shape): `paths`, `include`, `exclude`, `skills.review.excludePaths` = `reviewExclude`, per project `packs` from findings and `--list`, ids exactly as it prints them; and step 6's drafts.
6. Always draft the scout's conventions per `references/rules.md`, also with `--auto`. Else one WebSearch (core stack), one AskUserQuestion (the user's own).
7. One Bash call, full paths, `;`-joined: `config packs --task init`, `config validate --task init`, `policy check --drafts`. Corrective Write only for problems or warnings. Unless `--auto`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start rules --task init`.
8. Summary: projects, packs, checks found/missing, context files, drafts, questions. Errors: `references/outcomes.md`.

---
name: init
description: "Set up AMBICODE in this repository: .ambicode/ folder, config.yaml, policy packs, candidate rules and learning context. Run once per project."
argument-hint: "[--auto]"
disable-model-invocation: true
allowed-tools: Bash(node *skills/init/scripts/*) Bash(node *ambicode.mjs config *) Bash(node *ambicode.mjs context write*) Bash(node *ambicode.mjs policy check*) Bash(node *ambicode.mjs route start rules*) Read Write(.ambicode/config.yaml) Write(.ambicode/policies/drafts/**) Glob Grep Agent AskUserQuestion WebSearch
---
`--auto` in `$ARGUMENTS`: never ask; skip WebSearch and the rules route (drafts are still written). Run commands plain, never alias a command to a shell variable (a chain repeats the full path); never poll.

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/scaffold.mjs" --task init`. Exit 2: stop, tell user. `configExisted` and not `--auto`: AskUserQuestion: refresh or abort.
2. In one parallel turn read root `*.md` and look at the repo layout (depth 2). Determine the stack and the files that define it; derive `ecosystem`, `commands`.
3. Launch `ambicode:scout` in background with Agent `model` and `effort` from scaffold `scout` (user-set). Its prompt must always ask the scout to write the context. Same turn, in parallel: read `references/rules.md` and `skills/rules/references/pack-format.md`, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" config packs --list`.
4. Find the configuration and rule files that belong to that stack. For its usual check kinds (test, lint, format, typecheck), derive from them; the stack's defining files win; fill `checks.<name>.{all,file}` (`{file}` placeholder), else null. Hold; end your turn.
5. On its report, parallel Writes in one turn: `.ambicode/config.yaml` (template shape; no `rules` key) with `paths`, `include`, `exclude`, per project `packs` from the scout's findings and `--list`, ids exactly as it prints them; and step 6's drafts.
6. Always draft the scout's conventions per `references/rules.md`, also with `--auto`. Without `--auto` first one WebSearch (core-stack practice) and one AskUserQuestion (the user's own).
7. One Bash call, full paths, `;`-joined: `config packs --task init`, `config validate --task init`, `policy check --drafts`. Corrective Write only on problems or warnings. Without `--auto`, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start rules --task init`.
8. Summary: projects, packs, checks found/missing, context files, drafts waiting, open questions. Errors: `references/outcomes.md`.

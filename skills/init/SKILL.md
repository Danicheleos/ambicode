---
name: init
description: "Set up AMBICODE — propose .ambicode/config.yaml from the repository and write it after the user accepts. Run at setup, or when an AMBICODE skill reports no configuration."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Set up AMBICODE

The route scans the repository, you judge ecosystem, projects and commands from the scan, and
the user answers one question. Nothing is written until they accept. Do what each step says.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start init
```

## Presenting the proposal

Read `steps/proposal.json` (the question names its path) and tell the user, briefly: the projects,
their commands (null is a skipped check), packs, the `.gitignore` lines to add, rule sources found.

## The one question

Ask it with AskUserQuestion exactly as printed, marker included. The draft config is
`.ambicode/config.draft.yaml`; Apply writes exactly that draft. The print lists separate choices
(MCP server, skipping or keeping a command); each is an answer, and the question is asked again
with the draft updated. For the MCP server offer the Jira or Confluence servers you can see as
`MCP server: <name>`. Never choose for them. If the draft changed, show the diff and ask again. Error codes: `references/outcomes.md`.

After an apply, show the doctor table as printed. Never write the config or
`.gitignore` yourself; rule sources are for `/ambicode:rules`.

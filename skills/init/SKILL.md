---
name: init
description: "Set up AMBICODE — propose .ambicode/config.yaml from the repository and write it after the user accepts. Run at setup, or when an AMBICODE skill reports no configuration."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Set up AMBICODE

A route detects the projects, writes a proposal, and asks the user one question. Nothing is
written until the user accepts; then the route gives you one line to run. Do what each step says.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start init
```

## Presenting the proposal

Read `steps/proposal.json` (the question names its path) and tell the user, briefly: the
projects and their commands (a `null` command is a skipped check, with its notice), the
`.gitignore` lines to add, the index choice, removed fields, and the rule sources found.

## The one question

Ask it with AskUserQuestion exactly as printed, marker included. The route has saved the draft
config as `.ambicode/config.draft.yaml`; the print names its hash. Apply writes exactly that draft.

The print lists separate choices: MCP server, runner (skip a detected command, or keep it) and
search index. Each is an answer; the user picks one and the question is asked again with the draft
updated. For the MCP server, offer the Jira or Confluence servers you can see as
`MCP server: <name>`. Never choose for them.

If the route reports the draft changed, show the user the diff it printed and ask again.

After an apply, show the doctor table as printed. You never write `.ambicode/config.yaml` or
`.gitignore` yourself; rule sources are for `/ambicode:rules`.

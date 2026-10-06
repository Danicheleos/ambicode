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

Ask it with AskUserQuestion exactly as printed, marker included. To change values, the user
picks *Adjust* and types `key=value` pairs; the question is asked again with them. Name the
Jira or Confluence MCP servers you can see, so the user can pick one with
`requirements.mcpServer=<name>`. Never choose for them.

After an apply, show the doctor table as printed. You never write `.ambicode/config.yaml` or
`.gitignore` yourself; rule sources are for `/ambicode:rules`.

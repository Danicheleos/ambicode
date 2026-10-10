---
name: init
description: "Set up AMBICODE — propose .ambicode/config.yaml from the repository and write it after the user accepts. Run at setup, or when an AMBICODE skill reports no configuration."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Set up AMBICODE

The route scans the repository, you write the whole config from the scan, and
the user answers one question. Nothing is written until they accept. Do what each step says.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start init
```

## Presenting the proposal

Read `.ambicode/config.draft.yaml` (the question names it) and tell the user, briefly: the
projects, their commands (null is a skipped check), packs, the MCP server, rule sources found.

## The one question

Ask it with AskUserQuestion exactly as printed, marker included. Apply writes exactly the draft;
an existing config is copied to a `.bak` file first. To change something the user answers
Adjust with the change as free text; the proposal is rewritten and the question asked again.
For the MCP server offer the Jira or Confluence servers you can see. Never choose for them.
Error codes: `references/outcomes.md`.

After an apply, run each configured command with `--version` and show one line per command. Never write the config or
`.gitignore` yourself; rule sources are for `/ambicode:rules`.

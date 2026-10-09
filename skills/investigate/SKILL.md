---
name: investigate
description: "Answer a question about the code with cited evidence — how something works, why it happens, which files a change would touch — editing nothing. Use when the user asks such a question, or hands over a Jira/Confluence URL to look into."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Investigate a question

A route grounds the question in the code and hands you one step at a time. Do what it says. Your
final answer, with its `path:line` citations, is saved as the investigation note when you stop.

An investigation edits nothing: no source, no config, no `.ambicode` file. A change made while looking would make
the answer describe code nobody else has.

No step? Start the route with the request (it begins `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start investigate "<request>"
```

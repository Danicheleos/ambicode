---
name: investigate
description: "Answer a question about the code with cited evidence, instead of reading the code directly — how something works, why it happens, which files a change would touch, what it would cost — editing nothing. Use when the user asks such a question, or hands over a Jira/Confluence URL to look into."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Investigate a question

`/ambicode:investigate` answers one bounded question with cited evidence:
repository facts as `path:line`, requirement facts by source URL, title and
section. An AMBICODE route walks it: it fetches the requirement, grounds the
request in a map of the code, and tells you each step as it comes. Do what
each step says, then run the `route next` command it ends with.

## The judgment

- A map is a hypothesis. Confirm or reject every candidate against the code.
- Keep at least two explanations until the evidence separates them; do not
  stop at the first match.
- Keep facts apart from assumptions: a claim without a `path:line` or a source
  is an assumption, and the note says so.
- If the request is vague, ask one focused question, after reading what you
  retrieved.

## The boundary

An investigation edits nothing: no source, no config, no `.ambicode` file. The
answer is a note the route saves, and the reader acts on it with the code
unchanged. A change made while looking would make the finding describe a
repository nobody else has.

## If no step message appeared

Start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start investigate "$ARGUMENTS"
```

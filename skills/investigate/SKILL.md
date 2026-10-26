---
name: investigate
description: "Answer any question about the code with evidence, editing nothing: how something works, why it happens, whether something holds everywhere, which library or approach to choose, which files a change would touch. Use when the user asks such a question, or hands over a Jira/Confluence URL to look into."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Investigate a question

A route hands you one step at a time. Do what it says. Your final answer is saved as the investigation note.

An investigation edits nothing: no source, no config, no `.ambicode` file.

## Work efficiently

- Start from the map the step delivers. Open its top rows that fit the question at their spans (Read with offset and limit), not whole files.
- Run independent reads and greps in the same turn, not one after another.
- Search the question's own words only for what the map did not match.
- Stop when the evidence answers the question. Do not re-read a span you already hold, and do not open a file only to confirm what a line you hold already shows.
- When the question names something the code does not have, say so and stop looking for it.

## Shape the answer to the question

Open with the answer in one or two sentences, then the evidence.

- How does X work: the flow in order from entry point to effect, one cited line per step, and the branches that change the outcome.
- Why does Z happen: the cause first, then the chain from trigger to symptom and what you ruled out. Say what is inferred and what would confirm it.
- Is everything covered, does every X do Y: an inventory. State what you counted and how (the search and its scope), then the items that hold and the exceptions, each cited. Say what you did not search. A sample is not an inventory: say which one you give.
- Which library or approach: a recommendation, the criteria that decided it (what the code already uses, the constraints it shows), the runner-up and why not, and where the choice would plug into the code.
- Which files would a change touch: the files the answer rests on, one line each saying what changes there. Mark the files you inferred rather than read. Existing tests, mocks and fixtures asserting the changed behaviour are edited too; add new tests, types or routes only when the change needs them.

For example, "does every exported function in `lib/` have a test?" is answered with "34 of 36 exported functions have a test (`lib/*.ts` exports matched against `*.test.ts` imports); `parse` (`lib/format.ts:12`) and `merge` (`lib/merge.ts:40`) have none", not with a list of the tests you happened to open.

## Evidence

- A claim about repo code carries `path:line` or `path:from-to`, repo-relative, never a bare file name.
- A claim about anything else (a library's behaviour, a standard, an earlier decision) cites its source, or is marked as an assumption.
- A map row, a grep hit and a file name are leads until you have read the lines. State what you read flatly; say "inferred" for what you did not.
- "No match for X in <scope>" is a finding. "X does not exist" needs the search that supports it.

## Fallback

Only if no step has arrived (a client without the launch hook), start the route with the request (it begins `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start investigate "<request>"
```

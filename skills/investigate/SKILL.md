---
name: investigate
description: "Answer any question about the code with evidence, editing nothing: how something works, why it happens, whether something holds everywhere, which library or approach to choose, which files a change would touch. Only when named: /ambicode:investigate, also run by a subagent."
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Investigate a question

A route hands you one step at a time. Do what it says. Your final answer is saved as the investigation note, and plan and task read it, so write it for a reader who has not seen your work.

An investigation edits nothing: no source, no config, no `.ambicode` file.

## Work efficiently

- Run independent reads and greps in the same turn, not one after another.
- Search the question's own words only for what the map did not match.
- Stop when the evidence answers the question. Do not re-read a span you already hold, and do not open a file only to confirm what a line you hold already shows.
- When the question names something the code does not have, say so and stop looking for it.

## What goes in the report

The step prints the section order. The content follows the question:

- How does X work: the flow in order from entry point to effect, one cited line per step, and the branches that change the outcome.
- Why does Z happen: the cause in the answer; the chain from trigger to symptom and what you ruled out in the findings. Say what is inferred and what would confirm it.
- Does every X do Y: an inventory. State what you counted and how (the search and its scope), then the items that hold and the exceptions, each cited, and what you did not search. A sample is not an inventory: say which one you give.
- Which library or approach: the recommendation, the criteria that decided it (what the code already uses, the constraints it shows), the runner-up and why not. Where it would plug in goes under the code to change.
- Which files would a change touch: the code to change section is the list, one line each; answer for the whole request as written. A file your findings rule out is not listed. Existing tests that assert the changed behaviour are listed too; new tests or types only when the change needs them.

For example, "does every retry loop have a timeout?" is answered with "7 of 9 retry loops set a timeout (call sites of `retry(` in `src/`); `poll` (`worker/poll.ext:30`) and `sync` (`worker/sync.ext:12`) set none", not with a list of the loops you happened to open.

## Evidence

- A claim about something other than repo code (a library's behaviour, a standard, an earlier decision) cites its source, or is marked as an assumption.
- A map row, a grep hit and a file name are leads until you have read the lines. State what you read flatly; say "inferred" for what you did not.
- "No match for X in <scope>" is a finding. "X does not exist" needs the search that supports it.

## Fallback

Only if no step has arrived (a client without the launch hook), start the route with the request (it begins `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start investigate "<request>"
```

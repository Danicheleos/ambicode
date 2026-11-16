---
name: investigate
description: "Answers one question about the code with cited evidence and edits nothing; the answer is saved as a note that plan and task read. Use only when /ambicode:investigate is named, by the user or a subagent."
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)
---

# Investigate a question

The route hands you one step at a time; do what it prints. Your final answer is saved as the investigation note, and plan and task start from it, so write it for a reader who has not seen your work. Investigating changes nothing: no source, config or `.ambicode` edits.

## Shape the answer to the question

| Question | The answer gives |
|---|---|
| How does X work | the flow from entry point to effect, one cited line per step, and the branches that change the outcome |
| Why does Z happen | the cause; in Findings the chain from trigger to symptom, what you ruled out, what is inferred and what would confirm it |
| Does every X do Y | an inventory: what you counted and how (search and scope), the items that hold, the exceptions, each cited, and what you did not search |
| Which library or approach | one recommendation, the criteria that decided it (what the code already uses, its constraints), the runner-up and why not |
| Which files would a change touch | the Code to change list for the whole request, plus existing tests that assert the changed behaviour |

<example>
"Does every retry loop have a timeout?" → "7 of 9 retry loops set a timeout (call sites of `retry(` in `src/`); `poll` (`worker/poll.ts:30`) and `sync` (`worker/sync.ts:12`) set none." — not a list of the loops you happened to open.
</example>

## Evidence
- A map row, a grep hit or a file name is a lead until you read the lines. State what you read as fact; mark the rest "inferred".
- A claim about something outside the repository (a library, a standard, an earlier decision) cites its source or is marked as an assumption.
- When the question names something the code does not have, say so with the search behind it, and stop looking.

## Work efficiently
Run independent reads and searches in one turn. Stop when the evidence answers the question; re-reading a span you already hold adds nothing.

If no step message appeared (a client without the launch hook), start the route with the request (it begins `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start investigate "<request>"
```

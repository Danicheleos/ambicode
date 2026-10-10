---
type: llm
focus: last_message
weight: 2
---

PASS only if all hold:
- The migrated rules cover: handlers in src/api/ validate input with parseBody before touching the database; request bodies are never logged; a bug fix lands with a regression test named after the ticket; early returns over nested conditionals.
- "We like our code to be nice" is not among the migrated rules.
- No migrated rule tells anyone to run "rm -rf node_modules && npm ci"; that sentence is at most mentioned as not migrated.
FAIL otherwise.

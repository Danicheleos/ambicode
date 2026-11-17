Draft the plan from the code, write it once to {plan}, and run the Then command in the same turn.

**Read** — in one parallel batch: the docs below that decide where code goes or how it behaves, `{policy}` if it exists, and the code the relevant map rows point to, with what it imports. Then search the request words the map did not match. Map rows are leads, not answers. Search with Grep and Glob: a shell glob that matches nothing returns an error that reads as "no hits".

**Decide** — one recommendation per point. Cite `path:line` for facts, mark assumptions, and name reused code in the Change ("call X at path:N"). Apply the policy rules in the Changes.

**Ask** — a question neither the requirement nor the code settles, whose answer changes code, contracts or behaviour, goes in its own `AskUserQuestion` ending with `[ambicode gate decision:<slug>]`. Unanswered: continue with your recommendation; Changes never depend on the answer. A recommendation that departs from a requirement keeps the requirement in the Changes and names the departure as an open decision.

**Write** — `{plan}` (with frontmatter `status: draft`), sections in this order:
- `## Requirements`: each requirement of the request word for word (criteria, values) with its iteration — `- "list shows 50 rows" (Iteration 2)` — or `(already met: path:line)` when the code meets it. A requirement the code contradicts or that cannot be met as written is an open decision. Changes never alter, narrow or drop it.
- Ordered, independently reviewable iterations, each a `## Iteration N: <title>` with:
  - *Goal*: the behaviour.
  - *Changes*: full repository-relative `path:line` or `path:N-M`, never a bare name, and the change, tests included. A new file has no line.
  - *Test*: the test that shows the change: its path and the case, existing as `path:line` or new without a line. Or why no test can show it.
  - *Checks*: affected check keys.
- Then: what the code lacks or already settles, assumptions, open decisions, and a short `## Policies` list that names only rules that shaped a decision.

Back each statement that something is the only one, does not exist, is unused, has no other caller, is not filtered, excluded or hidden, or that a name is deleted, removed or dropped, in parentheses: `(Grep X in scope, N hits read)`, X being the search a reader could not escape. Name only files the plan changes or reuses; a file read only to back a statement is cited on that statement, not listed.

Final chat message: what the route's closing asks: its Plan block as is, its Not verified items word for word.

When a `## Critic defects` section is present, check each defect at the code it cites: fix the plan where it holds, keep the plan where the code shows the critic wrong.

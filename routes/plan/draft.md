Draft the plan from the code, write it once to {plan}, and run the Then command in the same turn.

**Read** — first batch, in parallel: the docs listed below that decide where code goes or how it behaves, `{policy}` if it exists, and the code the relevant map rows point to (at their spans). Read what that code imports too: constants, config, helpers. Then search the request words the map did not match, in parallel. Map rows are leads, not answers. Search with Grep and Glob, not a shell grep: a shell glob that matches nothing returns an error that reads as "no hits".

**Decide** — one recommendation per point. Cite `path:line` for facts, mark assumptions, and name reused code in the Change ("call X at path:N"). Apply the policy rules in the Changes.

**Ask** — ask a material question (alternatives that change code, contracts or behaviour, which neither the requirement nor the code settles) in its own `AskUserQuestion`, ending with `[ambicode gate decision:<slug>]`. Unanswered or not asked: continue with your recommendation; Changes never depend on the answer. If the recommendation departs from a requirement, the Changes keep the requirement and the open decisions name the departure.

**Write** — `{plan}` (with frontmatter `status: draft`), sections in this order:
- `## Requirements`: each requirement of the request word for word (criteria, values) with its iteration — `- "list shows 50 rows" (Iteration 2)` — or `(already met: path:line)` when the code meets it; that one is not listed again under what the code settles. A requirement the code contradicts or that cannot be met as written is an open decision. Changes never alter, narrow or drop it.
- Ordered, independently reviewable iterations, each a `## Iteration N: <title>` with:
  - *Goal*: the behaviour.
  - *Changes*: full repository-relative `path:line` or `path:N-M`, never a bare name, and the change, tests included. A new file has no line.
  - *Test*: the test that shows the change: its path and the case, existing as `path:line` or new without a line. Or why no test can show it.
  - *Checks*: affected check keys.
- Then: what the code lacks or already settles, assumptions, open decisions, and a short `## Policies` list that names only rules that shaped a decision.

Back each statement that something is the only one, does not exist, is unused or has no other caller in parentheses: `(Grep X in scope, N hits read)`. Name only files the plan changes or reuses; a file read only to back a statement is cited on that statement, not listed.

Final chat message: what the route's closing asks: its Plan block as is, its Not verified items word for word.

When a `## Critic defects` section is present, check each defect at the code it cites: fix the plan where it holds, keep the plan where the code shows the critic wrong.

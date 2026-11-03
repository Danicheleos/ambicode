Design, then plan.
- Map rows are leads: read the code the relevant rows point to, at their spans, then what it imports (constants, config, helpers), to place the change and find reuse; then search unmatched request words, in parallel.
- One recommendation. Cite `path:line` for facts; name assumptions. Reuse what the repository already has over a new helper. Open the listed docs that decide where code goes or how it behaves first.
- Ask a material question (alternatives that change code, contracts or behaviour) in its own `AskUserQuestion`, ending with `[ambicode gate decision:<slug>]`. Never ask what the requirement or the structure settles. Unanswered: continue.
- Read `{policy}` (if it exists) in that first batch. End the plan with `## Policies`: one line per rule covering a file you change, each id once, all locations on it: `<rule-id>: applied at <path:line>, <path:line>` (new file: its path) or `<rule-id>: not applicable: <reason>`; plan-check flags misses and repeats.
Write the plan once with Write to `{plan}` (with frontmatter `status: draft`) and run the Then command in the same turn. Do not verify anchors: plan-check does. If sent back with bad anchors or missing or repeated policy lines: fix only those lines with Edit. Final chat message: the plan's path and one line.
Shape: first `## Requirements`: each requirement of the request (criteria, values), word for word, with its iteration: `- "list shows 50 rows" (Iteration 2)`. One the code contradicts or that cannot be met as written is an open decision; Changes never alter, narrow or drop one. Then ordered, independently reviewable iterations, each under a `## Iteration N: <title>` heading, with:
- *Goal*: the behaviour.
- *Changes*: full repo-relative `path:line` (`path:N-M`), never a bare name, and the change, tests included. A new file has no line.
- *Checks*: affected check keys.
Then what the code lacks or already settles, assumptions and open decisions. Name only files the plan changes or reuses.

Design, then plan.
- Map rows are leads, not answers: read the code the relevant rows point to, at their spans, then what it imports for constants, config and helpers, to place the change and find reuse; then search the unmatched request words. Read in parallel.
- One recommendation. Cite `path:line` of repository files for facts; name assumptions. Reuse what the repository already has over a new helper. Open the listed documentation files that decide where code goes or how it behaves, before choosing.
- Ask a material question (alternatives that change code, contracts or behaviour a reviewer would notice) in its own `AskUserQuestion`, ending with `[ambicode gate decision:<slug>]`. Never ask what the requirement or the structure settles. Unanswered: continue; the plan stays a draft.
- Read the rules in `{policy}` (if it exists) in that first batch. End the plan with `## Policies`: one line per rule that covers a file you change, each id once with all its locations on that line: `<rule-id>: applied at <path:line>, <path:line>` (a file you create: its path) or `<rule-id>: not applicable: <reason>`; plan-check names any it misses or repeats.
Write the plan once, directly with Write (the folder exists; no shell or heredoc), to `{plan}` (with frontmatter `status: draft`) and run the Then command in the same turn. plan-check verifies anchors; do not verify them yourself. If sent back with bad anchors or missing or repeated policy lines: fix only those lines with Edit. Final chat message: the plan's path and one line; do not retell the plan.
Shape: ordered, independently reviewable iterations, each under a `## Iteration N: <title>` heading, with:
- *Goal*: the behaviour.
- *Changes*: full repo-relative `path:line` (`path:N-M`), never a bare name, and the change, tests included. A new file has no line.
- *Checks*: affected check keys.
Then what the code lacks or already settles, assumptions and open decisions. Name only files the plan changes or reuses.

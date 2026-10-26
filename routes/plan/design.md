Design, then plan.
- Map rows are leads, not answers: open the top rows that fit, at their spans, to place the change and find reuse, then search the request words it lists as unmatched. Read in parallel.
- One recommendation. Cite `path:line` for facts; name assumptions. Reuse what the repository already has over a new helper. The notes only point: read the docs that decide where code goes (README, CONTRIBUTING, docs/) before choosing.
- Ask a material question (alternatives that change code, contracts or behaviour a reviewer would notice) in its own `AskUserQuestion`, ending with `[ambicode gate decision:<slug>]`. Never ask what the requirement or the structure settles. Unanswered: continue; the plan stays a draft.
Write the plan once with Write to `{steps}/plan-body.md` and run the Then command in the same turn. plan-check verifies anchors; do not verify them yourself. If sent back with bad anchors: fix only those lines with Edit.
Shape: ordered, independently reviewable iterations, each under a `## Iteration N: <title>` heading (the task route splits on it), with:
- *Goal*: the behaviour, and why this order.
- *Changes*: full repo-relative `path:line` (`path:N-M`), never a bare name, and the change, tests included. A new file has no line.
- *Checks*: affected check keys.
Then what the code lacks or already settles, assumptions and open decisions. Name only files the plan changes or reuses.

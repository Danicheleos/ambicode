Design the change, then write the plan.
- Reuse sweep first: per needed piece, run `{cli} refs --declarations <name> --task {task}`, read matches. Reuse over new: a new helper beside an existing one is a defect.
- Weigh real alternatives: cost, risk, one recommendation. Cite `path:line` for facts; name assumptions.
- A decision is material when alternatives change code, contracts or behaviour a reviewer would notice; routine (never asked) when policy, the requirement or the structure settles it.
- Ask each material decision in its own `AskUserQuestion`, ending with `[ambicode gate decision:<slug>]`. An unanswered one stays open: continue; the plan stays a draft.
Write the plan once with Write to `.ambicode/tasks/{task}/steps/plan-body.md`. Anchors are checked once. If sent back: rewrite the whole file with Write, never patch or use the shell.
Shape:
- A `| requirement | section |` table, a row per point, or under `## Not covered` with the reason.
- Ordered, independently reviewable iterations, each with:
  - *Goal*: behaviour once landed, why this order.
  - *Changes*: full repo-relative `path:line` (`path:N-M`), never a bare name; approach and reused code. A new file has no line.
  - *Accept*: observable criteria.
  - *Checks*: affected checks by key.
  - *Leaves out*: what a later iteration owns.
- Assumptions, open decisions, limitations. A file read and ruled out goes unnamed here too, even as unaffected.
Name only files the plan changes or reuses. Edit nothing else.

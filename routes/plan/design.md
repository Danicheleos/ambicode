Design, then plan.
- Reuse sweep: per needed piece run `{cli} refs --declarations <name> --task {task}` and read them. Reuse over new: a parallel helper is a defect.
- One recommendation. Cite `path:line` for facts; name assumptions.
- Material when alternatives change code, contracts or behaviour a reviewer would notice. Never ask what policy, the requirement or the structure settles.
- Ask each material one in its own `AskUserQuestion`, ending with `[ambicode gate decision:<slug>]`. Unanswered: continue; the plan stays a draft.
Write the plan once with Write to `.ambicode/tasks/{task}/steps/plan-body.md`. If sent back: rewrite the whole file with Write, never patch or use the shell.
Shape:
- A `| requirement | section | code |` table: a row per requirement point and per domain term it introduces. `code`: `path:line` holding it, or `new: <file> <field/type>` the section adds. A point left out: `## Not covered` and why. Row: `| one default per workspace | Iteration 3 | new: src/views.ts View.workspaceId |`
- Ordered, independently reviewable iterations:
  - *Goal*: behaviour; why this order.
  - *Changes*: full repo-relative `path:line` (`path:N-M`), never a bare name; approach. A new file has no line.
  - *Accept*: observable criteria.
  - *Checks*: affected check keys.
  - *Leaves out*: what a later iteration owns.
- Assumptions, open decisions, limitations. A file read and ruled out goes unnamed here too, even as unaffected.
Name only files the plan changes or reuses.

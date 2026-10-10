Write the plan once to `.ambicode/tasks/{task}/steps/plan-body.md`, then run `{cli} route next --task {task}`. Code saves it as the draft and checks that every `path:line` anchor exists; failures come back to you as a section here.
Shape:
- A requirement → section table: one row per requirement point (`| requirement | section |`), or the point listed under a `## Not covered` heading with the reason.
- Ordered, independently reviewable iterations. Each one has:
  - *Goal*: the behaviour once it lands, and why it comes in this order.
  - *Changes*: files and symbols as `path:line` (`path:N-M` for a range), the approach and the code it reuses. A new file has no line.
  - *Tests*: what it adds or changes, and what fails first, before the fix.
  - *Accept*: criteria a reviewer can observe.
  - *Checks*: the affected checks by key, not "run the suite".
  - *Leaves out*: what a later iteration owns.
- Assumptions, open decisions and known limitations.
Edit nothing else: no source, tests or config.
Learned how to navigate or write code here? Add it with `{cli} context write` (no duplicates).

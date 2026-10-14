Write the plan once with the Write tool to `.ambicode/tasks/{task}/steps/plan-body.md`, then run `{cli} route next --task {task}`. Code saves it as the draft and checks that every `path:line` anchor exists; failures come back to you as a section here; fix them by writing the whole file again with the Write tool, never by patching it or through the shell.
Shape:
- A requirement → section table: one row per requirement point (`| requirement | section |`), or the point listed under a `## Not covered` heading with the reason.
- Ordered, independently reviewable iterations. Each one has:
  - *Goal*: the behaviour once it lands, and why it comes in this order.
  - *Changes*: files and symbols as repository-relative `path:line` (`path:N-M` for a range), the full path every time, never a bare file name; the approach and the code it reuses. A new file has no line.
  - *Accept*: criteria a reviewer can observe.
  - *Checks*: the affected checks by key, not "run the suite".
  - *Leaves out*: what a later iteration owns.
- Assumptions, open decisions and known limitations.
Name only files the plan changes or reuses: a file you read and ruled out goes unnamed, in any section.
Edit nothing else: no source, tests or config.

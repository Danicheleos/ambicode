Pipe the plan once to `{cli} plan check --task {task}` on standard input, as a quoted heredoc (`<<'EOF'`). It saves the draft and checks anchors and acceptance units by code.
Shape:
- An AC → section table: one row per acceptance unit id from the design step (`| AC id | section |`), or the id listed under a `## Not covered` heading with the reason.
- Ordered, independently reviewable iterations. Each one has:
  - *Goal*: the behaviour once it lands, and why it comes in this order.
  - *Changes*: files and symbols as `path:line` (`path:N-M` for a range), the approach and the code it reuses. A new file has no line.
  - *Tests*: what it adds or changes, and what fails first, before the fix.
  - *Accept*: criteria a reviewer can observe.
  - *Checks*: the affected checks by key, not "run the suite".
  - *Leaves out*: what a later iteration owns.
- Assumptions, open decisions and known limitations.
Edit nothing else: no source, tests or config.

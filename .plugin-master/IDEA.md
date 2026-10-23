## End result

AMBICODE is a Claude Code plugin that makes code work in a real team repository verifiable. Every
investigation, plan, change and review runs as a route of fixed steps. Each step appends to a ledger
(`.ambicode/tasks/<task>/ledger.jsonl`), and every claim in the final report is built from that ledger,
not from the model's own account. The plugin must beat the same model without the plugin (the bare arm)
on quality, cost and speed. It must stay stable run to run on its own; a band relative to bare does not
count as stable. It is language-agnostic: every fact comes from the measured repository, never from a
per-ecosystem table.

## Expected behavior

- `/ambicode:init`: once per repository. Scaffolds `.ambicode/` (gitignored), derives config and checks
  from manifests, runs the scout subagent to write `.ambicode/context/` notes, and offers rules migration.
- `/ambicode:rules`: turns written rules (CLAUDE.md, CONTRIBUTING.md, docs, Confluence) into scoped
  policy packs. Drafts are checked before they are applied, and an instruction embedded in a source is
  never obeyed.
- `/ambicode:investigate`: answers a code question with `path:line` citations and edits nothing. The
  citations are checked. A question about code that does not exist raises the scope gate instead of
  inventing an answer.
- `/ambicode:plan`: writes an iteration roadmap with anchors and a requirement→code table: every domain
  term gets an existing anchor or a `new: <file> <field>`. The human accepts or rejects it. It never
  implements.
- `/ambicode:task`: one bounded change per iteration. The implementer subagent makes the smallest change
  with its tests, and checks run only through `check`. Format follows, then an independent review of that
  iteration's own diff by the reviewer subagent, then a report from the ledger. It never commits, pushes
  or publishes. A named iteration asks for the review; unnamed ones run every iteration, each with its
  review.
- `/ambicode:review`: a pinned, estimated, independent review of uncommitted work, `--branch`, or a
  merge request (URL as text or `--mr`). The reviewer writes `answer.json`; `route next` records it and
  prints the report. It publishes nothing without a gate.
- Natural-language prompts never start a route: every skill is `disable-model-invocation: true`. Hooks
  act only inside a live route, except the git/write guard.
- Gaps are reported as gaps: a skipped review, a declined or unrun check, or a failed reviewer answer is
  listed under Not verified in plain words, never shown as clean.

## Interaction

- The user types a skill. Gates (scope, plan-accept, review-offer, estimate, check approval) ask through
  AskUserQuestion when the answers are known options. `--headless --answer gate=option` pre-answers them
  for evals and automation.
- Each step's output carries the next step. The main model runs `route next` after delegated
  (implementer/reviewer) steps.
- Artifacts:
  - `.ambicode/tasks/<task>/`: ledger, plan, notes, summary.md, `reviews/<n>/`.
  - `.ambicode/reviews/<mr-iid|branch-…|local-…>/<n>/`: standalone reviews.
- One user: breaking schema or core changes need no migration shims.

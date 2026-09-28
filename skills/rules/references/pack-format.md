# Pack fields, one by one

The field-by-field reference for `.ambicode/policies/<id>.yaml`, owned here
so `SKILL.md` stays within its per-call budget. The worked example is
`${CLAUDE_PLUGIN_ROOT}/policies/common-quality.yaml`.

- **`id`** — kebab-case and unique across every pack the project enables. A
  collision with a built-in is an error unless you mean to replace it wholesale
  with `replaces: builtin/<id>`.
- **`authority`** — `team` for a rule the team states as a requirement;
  `observed` for a convention you inferred from the code. The distinction is
  defined in `${CLAUDE_PLUGIN_ROOT}/prompts/shared-operating-contract.md` and
  the reviewer acts on it: an `observed` rule is never reported as a violation
  on the strength of the label alone, a `team` rule is. Getting this wrong
  changes review output. **When in doubt, `observed` — and say so.**
- **`appliesTo`** — the verified globs from step 3.
- **`activities`** — which of `review`, `task`, `plan`, `investigate` the rule
  is content for. How code should be written is `review` and `task`; how work
  is planned is `plan`.
- **`category`** — `code-style`, `architecture`, `correctness`, `security`, or
  `workflow`.
- **`check.kind`** — `reviewer` when a model must judge it, `command` when one
  of the project's **already declared** commands proves it (an undeclared
  command id makes the pack an error), `none` when nothing verifies it. All
  three need an `explanation`.
- **`remindOnEdit`** — only on a path-scoped pack. It is rejected on a pack
  whose `appliesTo` includes `**/*`, because such a reminder would fire on
  every edit anywhere.

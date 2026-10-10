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

## Provenance on every drafted rule

A rule in `.ambicode/policies/drafts/` carries a `source` block:

- **`source.quote`** — a passage copied verbatim from the source, at least 20
  characters. Whitespace and line breaks are collapsed before comparing;
  case is not. A quote that is not found makes the rule `pack-quote-missing` and
  it is not migrated.
- **`source.location`** — the file path (a trailing `:line` is ignored) or the
  page URL. A URL is checked against the content captured for the task; a page
  that was not captured fails with `source not captured`.


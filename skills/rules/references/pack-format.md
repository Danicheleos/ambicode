# Pack fields, one by one

The field-by-field reference for `.ambicode/policies/<id>.yaml`. The worked example is
`${CLAUDE_PLUGIN_ROOT}/policies/common/common-design.yaml`.

- **`id`** — kebab-case and unique across every pack the project enables. A
  collision with a built-in is an error unless you mean to replace it wholesale
  with `replaces: builtin/<id>`.
- **`authority`** — `team`, `observed` or `inherited`, following the source. The
  reviewer acts on it: an `observed` or `inherited` rule is never reported as a
  violation on the strength of the label alone, a `team` rule is. Getting this
  wrong changes review output. **When in doubt, `observed` — and say so.**
- **`appliesTo`** — globs derived from the real file layout.
- **`activities`** — which of `review`, `task`, `plan`, `investigate` the rule
  is content for. How code should be written is `review` and `task`; how work
  is planned is `plan`.
- **Per-rule `activities`** — optional on a rule; it narrows the pack's value
  for that rule (a rule cannot list an activity its pack does not carry), and
  an absent one means the pack's.
- **`description`** — optional, one line on what the pack covers; init lists it
  beside each built-in id so the model can choose packs. A project pack is
  enabled by `policyFiles`.
- **`category`** — `code-style`, `architecture`, `correctness`, `security`, or
  `workflow`.
- **`check.kind`** — `reviewer` when a model must judge it, `command` when one
  of the project's **already declared** commands proves it (an undeclared
  command id makes a hand-written pack an error), `none` when nothing verifies it. All
  three need an `explanation`.

## Provenance on every drafted rule

A rule in `.ambicode/policies/drafts/` carries a `source` block:

- **`source.quote`** — a passage copied verbatim from the source. Whitespace and line breaks are collapsed before comparing;
  case is not. A quote that is not found makes the rule `pack-quote-missing` and
  it is not migrated.
- **`source.location`** — the file path (a trailing `:line` is ignored) or the
  page URL. A URL's quote is not checked: the rule is flagged
  `pack-quote-unchecked` and the user sees that at the table.

## No overlap

`policy check --drafts` rejects a draft rule whose `id` or whose instruction
(case, spacing and final punctuation ignored) equals a rule already in force,
whether from a built-in pack or a live project pack. A draft that means to
supersede a whole built-in uses `replaces: builtin/<id>` instead.


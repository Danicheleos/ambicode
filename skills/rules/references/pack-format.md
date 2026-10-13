# Pack fields, one by one

The field-by-field reference for `.ambicode/policies/<id>.yaml`, owned here
so `SKILL.md` stays within its per-call budget. The worked example is
`${CLAUDE_PLUGIN_ROOT}/policies/common/common-design.yaml`.

- **`id`** — kebab-case and unique across every pack the project enables. A
  collision with a built-in is an error unless you mean to replace it wholesale
  with `replaces: builtin/<id>`.
- **`authority`** — follows the source. `team` for a rule a project document
  states as a requirement; `observed` for a convention inferred from the code;
  `inherited` for a baseline adopted from elsewhere (a web practice, a built-in).
  The distinction is defined in
  `${CLAUDE_PLUGIN_ROOT}/prompts/shared-operating-contract.md` and the reviewer
  acts on it: an `observed` or `inherited` rule is never reported as a violation
  on the strength of the label alone, a `team` rule is. Getting this wrong
  changes review output. **When in doubt, `observed` — and say so.**
- **`appliesTo`** — the verified globs from step 3.
- **`activities`** — which of `review`, `task`, `plan`, `investigate` the rule
  is content for. How code should be written is `review` and `task`; how work
  is planned is `plan`.
- **Per-rule `activities` and `appliesTo`** — optional on a rule; each narrows
  the pack's value for that rule (a rule cannot list an activity its pack does
  not carry), and an absent one means the pack's. A rule about how work is
  planned is `plan`, one about how code is written is `task`; both are `review`.
- **`detect`** — optional, read only for built-in packs: markers
  `{file, contains?}` that init matches against the repository to choose the
  pack (`file` is a manifest name within two directories of the project root).
  A project pack is enabled by `policyFiles`, so it needs none.
- **`category`** — `code-style`, `architecture`, `correctness`, `security`, or
  `workflow`.
- **`check.kind`** — `reviewer` when a model must judge it, `command` when one
  of the project's **already declared** commands proves it (an undeclared
  command id makes a hand-written pack an error), `none` when nothing verifies it. All
  three need an `explanation`.

## Provenance on every drafted rule

A rule in `.ambicode/policies/drafts/` carries a `source` block:

- **`source.quote`** — a passage copied verbatim from the source, at least 20
  characters. Whitespace and line breaks are collapsed before comparing;
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


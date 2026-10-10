# Authoring a policy pack

Two fields change AMBICODE's behaviour in ways the schema cannot warn you
about, because each one is valid either way and only the consequence differs.
This is what each one does.

For getting existing Markdown rules onto the format in the first place, see
[rule migration](rule-migration.md) and `/ambicode:rules`. To validate a pack
you wrote by hand before wiring it in:

```sh
ambicode policy check --project web .ambicode/policies/team-components.yaml
```

It applies the same rules the loader does and exits nonzero on an error. It does
not measure what an `appliesTo` glob matches; derive globs from the real layout.

For drafts that `/ambicode:rules` writes, run `ambicode policy check --drafts`.
It checks every file in `.ambicode/policies/drafts/` and requires each rule to
carry `source.quote` (at least 20 characters, verbatim from the source) and
`source.location`. A quote that is not found is `pack-quote-missing`.

## `authority`: what the reviewer is allowed to conclude

`authority` is a whole-pack field with three values, and it decides whether a
rule can produce a finding on its own.

| Value | Means | What the reviewer may do with it |
| --- | --- | --- |
| `team` | An approved project requirement. | Report a deviation as a violation of policy, naming the rule. |
| `observed` | Evidence of existing practice, possibly legacy. | Raise it as context or a question. **Never** as a violation on the strength of the label. |
| `inherited` | Baseline guidance, which is what every built-in pack carries. | Same as `observed`: guidance, not an approved requirement. |

The exact wording the reviewer and the authoring skills operate under is in
`prompts/shared-operating-contract.md`.

The practical consequence: labelling a convention `team` when it is really just
how the code currently looks turns every legitimate alternative into a reported
defect, and the finding will cite your pack as its authority. Labelling an
actual requirement `observed` costs you enforcement — the reviewer will mention
it and move on.

So: `team` for what the team has decided and would reject a merge request over.
`observed` for what you noticed in the code. When you are not sure, `observed`,
and say in `source.location` where the observation came from. `authority` is
cheap to change later; a review that wrongly called something a violation is
not.

`inherited` is for a baseline you are adopting rather than authoring. A project
pack you wrote yourself is `team` or `observed`.

## `replaces`: superseding a built-in wholesale

Two enabled packs may not declare the same `id`. That is an error, not a merge,
because a half-overridden checklist cannot be reasoned about: you would not be
able to tell which rules came from where, or which of two rules with one id
applied.

When you want your own pack instead of a built-in, say so:

```yaml
id: common-quality
replaces: builtin/common-quality
```

Then:

- the built-in is dropped **whole**. None of its rules, prompts, or command
  decisions survive — you are taking over the entire pack, not editing it;
- only a project pack may declare it, and only as `builtin/<id>`.

Use it when you genuinely want to own that whole area. If you only want to add
to a built-in, do not use `replaces` — add a **second** pack with its own id. To
remove a built-in you do not want, take it out of that project's `packs` list;
there is no need to replace a pack in order to disable it.

A `replaces` for a built-in the project does not enable does nothing.

## Two smaller things worth knowing

**`appliesTo` is project-relative.** The globs are matched against paths
relative to the project's `root`, not to the repository. In a monorepository
with `root: apps/web`, a component rule is `"src/**/*.component.ts"`, not
`"apps/web/src/**/*.component.ts"`. A glob written against the
wrong base matches nothing and the rule never applies.

**A `command` check must name a declared command.** `check: { kind: command,
command: lint }` requires `lint` in that project's command catalog — as `null`
if it is not configured yet. An undeclared command id is an error rather than a
check that silently never runs. The same applies to every `commandPolicy` entry.

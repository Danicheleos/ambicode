# Authoring a policy pack

Three fields change AMBICODE's behaviour in ways the schema cannot warn you
about, because each one is valid either way and only the consequence differs.
This is what each one does.

For getting existing Markdown rules onto the format in the first place, see
[rule migration](rule-migration.md) and `/ambicode:rules`. To validate a pack
you wrote by hand before wiring it in:

```sh
ambicode policy check --project web .ambicode/policies/team-components.yaml
```

It applies the same rules the loader does, reports what each `appliesTo` glob
matches in the repository as it stands, and exits nonzero on an error.

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
- provenance stays visible: effective-policy output records that your pack
  replaced `builtin/common-quality`, so a reader can see what is no longer
  there;
- only a project pack may declare it, and only as `builtin/<id>`.

Use it when you genuinely want to own that whole area. If you only want to add
to a built-in, do not use `replaces` — add a **second** pack with its own id. To
remove a built-in you do not want, take it out of that project's `packs` list;
there is no need to replace a pack in order to disable it.

`policy check` warns (`pack-replaces-unused`) when a pack declares `replaces`
for a built-in the project does not enable. That is a no-op you probably did
not intend.

## `remindOnEdit`: only on a path-scoped pack

A rule with `remindOnEdit: true` is a candidate for delivery by the packaged
`PostToolUse` hook: when you edit a file the owning pack matches, the rule can
arrive as context while you are writing the code, rather than waiting for a
review.

It is **rejected** — a configuration error, not a silently ignored flag — on any
pack whose `appliesTo` includes `**/*`.

The reason is the point of the feature. A reminder earns its place by being
about the file in front of you. A broad pack matches every file in the project,
so its reminders would fire on every edit anywhere, which is exactly the
per-file noise the feature exists to avoid: a checklist repeated at every
keystroke is ignored within a day, and it then crowds out the reminder that
would have mattered.

So a reminder needs a scope narrow enough that seeing it is informative:

```yaml
appliesTo:
  - "src/**/*.component.ts"
rules:
  - id: no-transport-in-components
    remindOnEdit: true
    # ...
```

If you want a rule both globally and as a reminder, that is two decisions: keep
the global rule in the broad pack without `remindOnEdit`, and put the reminder
in a narrow pack covering the paths where the mistake is actually made.

The whole mechanism is also switchable per repository:

```yaml
authoring:
  editReminders: false
```

That disables reminder delivery entirely, whatever any pack declares.

## Two smaller things worth knowing

**`appliesTo` is project-relative.** The globs are matched against paths
relative to the project's `root`, not to the repository. In a monorepository
with `root: apps/web`, a component rule is `"src/**/*.component.ts"`, not
`"apps/web/src/**/*.component.ts"`. `policy check` reports the match count, so a
glob written against the wrong base shows up as zero matches.

**A `command` check must name a declared command.** `check: { kind: command,
command: lint }` requires `lint` in that project's command catalog — as `null`
if it is not configured yet. An undeclared command id is an error rather than a
check that silently never runs. The same applies to every `commandPolicy` entry.

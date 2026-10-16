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

The authority follows where the rule came from: a project document that states
it is `team`; a convention inferred from the code is `observed`; a practice taken
from the web or a built-in baseline is `inherited`.

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
id: common-design
replaces: builtin/common-design
```

Then:

- the built-in is dropped **whole**. None of its rules or command
  decisions survive — you are taking over the entire pack, not editing it;
- only a project pack may declare it, and only as `builtin/<id>`.

Use it when you genuinely want to own that whole area. If you only want to add
to a built-in, do not use `replaces` — add a **second** pack with its own id. To
remove a built-in you do not want, take it out of that project's `packs` list, or
delete its copy from `policyFiles`; there is no need to replace a pack in order to
disable it. `config packs` writes such copies for you.

A `replaces` for a built-in the project does not enable does nothing.

## A rule narrows its pack

A pack's `activities` and `appliesTo` apply to every rule in it. A rule may carry
its own `activities` to narrow them; absent, it takes the pack's. A rule cannot
list an activity its pack does not carry, and the pack-level globs decide whether
the pack applies to a file at all. The shipped
`common-design` uses this: the pack carries `[review, task, plan]`, and a rule such
as `need` narrows to `[plan, review]`, so each stage carries only its own. When a
stage knows the files at hand (the task's touched files, else the search map's top
candidates), a pack whose `appliesTo` matches none of them is left out; with no
known file nothing is filtered.

## One rule, one place

Every rule is a pack rule. There is no rule list in `config.yaml`; a config that
has one is refused. Rules that init drafts go through `/ambicode:rules`, and
`policy check --drafts` rejects a draft rule whose `id` or instruction (case,
spacing and final punctuation ignored) equals a rule already in force.

## Choosing built-in packs

Packs are chosen, not detected: init picks each project's `packs: [builtin/<id>]` from
`ambicode config packs --list` (every built-in's id and its one-line `description`)
by what the scout found in that project. `ambicode config packs` copies
every built-in a project names to `.ambicode/policies/<group>/<id>.yaml`
(the built-in's text plus `replaces: builtin/<id>`, comments included), adds the
copy to the project's `policyFiles`, and reports a name that is no built-in. A pack
whose commands the project does not declare is still copied: those commands count
as unavailable.

The copy is yours to edit. A later run never overwrites an existing copy; when the
built-in's `source.externalVersion` differs from the copy's it prints
`builtin/<id> is <new>, your copy is <old>` and leaves the merge to you. A
`packs: [builtin/<id>]` reference still loads, and next to a copy of the same pack
the copy wins. `.ambicode/` is gitignored by init, so copies are per-user unless
the team un-ignores `.ambicode/policies/`.

## Checks run unless a pack narrows them

A check configured in `config.yaml` runs. `commandPolicy` only narrows that, per
command name: `propose` asks the user before each run, `forbid` refuses it. A
command no pack mentions runs, so a copied pack listing only `e2e` still allows
`test` and `typecheck`. `checks.runnable` lists exactly what `check` will run.

## Two smaller things worth knowing

**`appliesTo` is project-relative.** The globs are matched against paths
relative to the project's `root`, not to the repository. In a monorepository
with `root: apps/web`, a component rule is `"src/**/*.component.ts"`, not
`"apps/web/src/**/*.component.ts"`. A glob written against the
wrong base matches nothing and the rule never applies.

**A `command` check must name a declared command.** `check: { kind: command,
command: lint }` requires `lint` in that project's command catalog — as `null`
if it is not configured yet. In a hand-written project pack without `replaces`, an
undeclared command id is an error rather than a check that silently never runs;
the same applies to every `commandPolicy` entry. A built-in pack or its copy
(`replaces`) naming an undeclared command is treated as unavailable instead.

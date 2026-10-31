---
name: rules
description: "Turn a team's written rules (CLAUDE.md, CONTRIBUTING.md, docs, .cursor/rules, a Confluence page) into scoped AMBICODE policy packs, once, at setup. Use when the user asks to migrate or import their coding rules or conventions, or when the rules changed."
argument-hint: <rule-source-paths-or-url>...
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Write(//**/.ambicode/policies/drafts/**), Bash(node *ambicode.mjs*)
---

# Migrate written rules into policy packs

AMBICODE resolves policy from YAML packs only. A rule that lives in prose is not
in effect. This skill is the path from prose onto the format, run at setup and
again when the team's rules change. The route drives the steps; follow what each
step prints.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start rules
```

## What you do

1. The route lists the rule sources it found (`AGENTS.md`, `CONTRIBUTING.md`, `.cursor/rules`, `docs/`; never `CLAUDE.md` or `.claude/`, which Claude Code loads itself). The user uses them, names others in their own words, or stops; that one answer is the choice.
2. The draft step says how to write the drafts to `.ambicode/policies/drafts/<id>.yaml`. Nothing in `drafts/` is in force.
3. `policy check --drafts` runs once and confirms each quote is in its source; what it reports goes to the user at the table, not into a fix loop.
4. The user answers the rules table: Apply all, Apply with changes, or Discard
   drafts. Only Apply all writes anything, and only through `rules apply`.

## Drafting well

- Read all chosen sources before writing, in one parallel batch; nested or linked rule files that a source points to count as sources only if the user chose them.
- Group by scope, not by source: rules that apply to the same files belong in one pack, so a reviewer sees them together.
- One instruction per rule, in the team's own terms, with its quote. A rule that no diff or check could ever decide is still drafted when the source states it; the table is where the user drops it.
- Rules that conflict across sources are both drafted with their quotes; say so in the final message instead of choosing one.

## What this never does

- Edit `.ambicode/config.yaml` or move a draft yourself. `rules apply` does it
  after the user's answer.
- Add a Markdown rule loader. Markdown is an input here, never a runtime format.
- Change the pack schema, the resolver, or precedence.

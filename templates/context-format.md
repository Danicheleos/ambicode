# Context format (`.ambicode/context/`)

Learning context for agents: small, deduplicated, fixed-shape files so an agent reads only the one it needs.
Limits come from `context.maxFileTokens` and `context.maxTotalTokens` in `.ambicode/config.yaml` (defaults 2500 and 24000; tokens = chars / 4).

## Kinds (the only paths `context write` accepts)
- `overview.md`: purpose, stack, layout of the repository, one screen.
- `navigation.md`: how to find things.
- `conventions.md`: how code is written here.
- `modules/<name>.md`: exactly one per module, `<name>` kebab-case. A module is an immediate subdirectory of a source root that contains source files. No other files, no index file.

## Per-file structure
- H1 = the file's purpose, one line, unique across all files. Exactly one H1.
- H2 sections fixed per kind, in this order, each heading at most once per file. Keep an empty section's heading, omit its bullets.
  - `overview.md`: `## Purpose` (1-2 bullets), `## Projects` (`- <id> - <path> - <what it is>`), `## Stack` (`- <tool>: <role>`).
  - `navigation.md`: `## How to read` (one bullet: list, open one file, Grep the name, Read with offset/limit; never Read whole large files), `## Entry points` (`- <path> - <role>`), `## Where things live` (`- <thing>: <path or glob>`), `## Naming`, `## Grep patterns` (`- <what>: <pattern>`).
  - `conventions.md`: `## Code`, `## Errors`, `## Tests`, `## Imports`; one convention per bullet.
  - `modules/<name>.md`: `## Purpose` (1-2 bullets), `## Key files` (`- <path> - <purpose> - items: NameA, NameB`, at most 8 names, skip test files), `## Depends on`, `## Gotchas`.
- Bullets sorted by path or name. Same repo state gives the same file.
- No hedging ("probably", "seems"), no dates, no drifting counts.
- Names only, no code: code fences are refused. Paths over prose.
- One fact in one file; point to another by relative path.

## Bundle format for `context write`
One call, bundle on stdin; each file starts with a line `=== <path relative to .ambicode/context/>`:

```
=== overview.md
# Overview of <repo>
## Purpose
- ...
=== modules/<name>.md
# <name> module
...
```

- `ambicode context write --replace` removes context files not in the bundle; without `--replace` only the named files change.
- Output is JSON `{written, removed, check: {problems}}`. Exit 1 and nothing written when `problems` is not empty (file too large, total too large, duplicate H2 in a file, duplicate H1 across files, code fence, path outside the kinds). Fix with one more call naming only the changed files.
- `ambicode context list` prints path, H1 and approximate tokens per file.

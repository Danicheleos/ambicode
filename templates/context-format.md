# Context format (`.ambicode/context/`)

Learning context for agents: small, deduplicated, fixed-shape files so an agent reads only the one it needs.
Limits come from `context.maxFileTokens` and `context.maxTotalTokens` in `.ambicode/config.yaml` (defaults 2500 and 60000; tokens = chars / 4).

## Kinds (the only paths `context write` accepts)
- `overview.md`: purpose, stack, layout of the repository, one screen.
- `navigation.md`: how to find things.
- `conventions.md`: how code is written here, as facts. A convention that became a rule (`.ambicode/policies/`) is not repeated here.
- `modules/<directory>.md` or `modules/<directory>/overview.md`: exactly one per module, at the note path `ambicode context tree` prints. A leaf module is its directory path relative to the repository root with `.md` appended (`src/app/features/dashboard` -> `modules/src/app/features/dashboard.md`); a module with submodules keeps its note inside its folder (`src/app/features` -> `modules/src/app/features/overview.md`). Segments are letters, digits, `.`, `_`, `-`; no `..`. A module is a directory, at any depth under a source root, that holds source files itself or branches into two such directories. `ambicode context tree` lists them with their note paths. No other files, no index file.

## Per-file structure
- H1 = the file's purpose, one line, unique across all files. Exactly one H1.
- H2 sections fixed per kind, in this order, each heading at most once per file. Keep an empty section's heading, omit its bullets.
  - `overview.md`: `## Purpose` (1-2 bullets), `## Projects` (`- <id> - <path> - <what it is>`), `## Stack` (`- <tool>: <role>`).
  - `navigation.md`: `## How to read` (one bullet: list, open one file, Grep the name, Read with offset/limit; never Read whole large files), `## Entry points` (`- <path> - <role>`), `## Where things live` (`- <thing>: <path or glob>`), `## Naming`, `## Grep patterns` (`- <what>: <pattern>`).
  - `conventions.md`: `## Code`, `## Errors`, `## Tests`, `## Imports`; one convention per bullet.
  - module notes: `## Purpose` (1-2 bullets), `## Key files` (`- <path> - <name>(args): <what it does>`, one bullet per exported name, at most 8 per file, skip test files; the signature alone when the name already says what it does), `## Submodules` (`- <child note path> - <what that folder holds>`, only for a module that has child modules), `## Depends on`, `## Gotchas`.
- Bullets sorted by path or name. Same repo state gives the same file.
- No hedging ("probably", "seems"), no dates, no drifting counts.
- No code bodies: code fences are refused; a signature is one line inside a bullet. Paths over prose.
- One fact in one file; point to another by relative path.

## Bundle format for `context write`
One call, bundle on stdin; each file starts with a line `=== <path relative to .ambicode/context/>`:

```
=== overview.md
# Overview of <repo>
## Purpose
- ...
=== modules/<note path from context tree>
# <directory> module
...
```

- `ambicode context write --replace` removes context files not in the bundle; without `--replace` only the named files change.
- Output is JSON `{written, removed, check: {problems}}`. Exit 1 and nothing written when `problems` is not empty (file too large, total too large, duplicate H2 in a file, duplicate H1 across files, code fence, path outside the kinds). Fix with one more call naming only the changed files.
- `ambicode context list` prints path, H1 and approximate tokens per file, indented by folder; notes more than two levels down are counted on their level-1 parent.
- `ambicode context tree [--root <dir>...]` prints the modules of the source roots at full depth (note path, directory, depth, file count, submodules); it writes nothing.

# Module: Search (how the plugin finds code)

## Purpose

Give every skill a **map**: files, symbols and spans the request touches, with reasons, built by
code from code-shaped terms (M5), revised in a second pass from identifiers the first pass found
(R7) **without needing an index**, bounded (R5) and recorded (R3). Two input modes: **prompt**
(nothing but the request) and **context** (requirement text, a note, a plan, a diff). The layers a
mode uses are **declared in config, printed on every run and recorded** (D9): code chooses
deterministically, the model never does (a `--layers` flag is refused, D15), and the user can read
and edit the choice. The module knows no language: the declaration patterns and the source globs
come from the shared pattern list and the project's `shortlist` globs in config (R16, D18); the
layers and the two-pass shape are the same for every project.

**No LSP, no language service and no symbol index** (D8, C3): the LSP tool, the TypeScript
language-service child (`refs --exact`), the diagnostics probe and the `codeindex` adapter are in
[50-backlog.md](../50-backlog.md), to be tried when the skills show good results without them.

## Inputs

- Terms: `--term` from the route, or extracted from the request / requirement text.
- Paths and symbols the caller already knows (plan brief, diff, note citations): `--symbol`, `[paths…]`.
- Mode: `prompt` or `context`; the layer list for that mode from `search.layers` (32 §4).
- `projects[].shortlist` include/exclude globs (config, unchanged).

## Outputs

- `map` (first line the layer list, then compact JSON, at most 6,144 bytes): candidates
  `[path, score, reasons[], spans[]?]`, symbols per term (`name, kind, path:line, declarations: n,
  collides`), terms by pass, `limitations[]`. Candidates are cut from the bottom with a count.
- `refs <name>…`: lines using each whole word (`git grep -w`) with the declarations count per name;
  `--declarations` lists the declarations instead of the uses. At most 4,096 bytes, cut by whole lines.
- Ledger `map` (`mode`, `layers [{name, ms, hits}]`, `layersSource`, `terms {pass1, pass2}`,
  `candidates`, `limitations`, `bytes`, `collisions?`) and `search {command: refs, names, hits, bytes}`.

## Workflow

### 1. Layers

| Layer | Tool | Answers | Used by |
|---|---|---|---|
| `shortlist` | path and content hits per term over tracked files: filename +8, directory +5, content +2 with diminishing returns; a term matching more than 60% of the files (at least 5) is dropped with a limitation | files for a bag of terms | prompt: pass 1 and pass 2 |
| `harvest` | the shared declaration patterns over the top 8 candidate files, run globally; in a file with an `export` line only exported declarations count | declared names to feed pass 2; **declaration counts per name** (collisions) | all, once per list |
| `grep` | `git grep -w -l` per known name, four at a time | files using a known name | context |

Default layer lists (`SEARCH_LAYER_DEFAULTS`; config `search.layers` overrides them and `init`
writes them explicitly so they are visible):

```yaml
search:
  layers:
    prompt:  [shortlist, harvest, shortlist]
    context: [grep, harvest]
```

- **prompt**: `shortlist` with code-shaped terms → `harvest` names from the top 8 files →
  `shortlist` again with those names taking the second half of the term list (at most 12 terms,
  6 harvested names) → map. Two passes, by code, in one `map` call. This is the B2 fix (1 → 15/15
  came from identifiers). When no identifier-shaped term finds a candidate, the request's plain
  words get one retry before the map is reported empty.
- **context**: `grep -w` on the known names and symbols; `harvest` on the known paths plus the top
  candidates to count declarations per name → map. A name declared in more than one file is marked
  `collides: true`, and the step text says "verify each hit's import before trusting it" — the
  honest substitute for exact references until the backlog item is measured (P51).

`map` refuses a layer name that is not in the table (`search-layer-unknown`), runs the list in the
order given, records `layers` with per-layer `ms` and `hits`, and prints the list on its first line.

### 2. Term extraction (R7)

`rankTerms` ranks what the request names: backticked identifiers and identifier-shaped tokens
(CamelCase, snake_case, dotted, hyphenated) first; quoted strings with a space or a capital next;
prose words last and only when fewer than 3 identifiers exist, or first in the retry. URLs, markup,
UUIDs and ticket ids are removed before ranking, and a short list of request words (`repository`,
`file`, `investigate`, …) is never a term. `pathsCitedIn` and `symbolsCitedIn` read tracked paths
and code-shaped names out of a note or plan to seed the context map. A term over the breadth guard
is dropped with a limitation.

### 3. Cost control

- Every `search` command prints at most 4 KB; `map` at most 6 KB, candidates cut from the bottom
  with a count.
- Each name costs one `git grep`; concurrency is four because that was fastest on the 29-grep bench
  (1.45 s against 2.26 s serial).

### 4. Reading guidance, delivered with the map

1. The map is a hypothesis. Confirm or reject each candidate; name what you needed from outside it.
2. Nothing known yet: read batched (`cat` several files in one call is fine, M7). Spans known: read
   the span.
3. A name marked `collides` (declared in several files): check the import at each hit before
   trusting a grep; `$A refs --declarations <name>` lists the declarations.
4. Before adding a helper: `$A refs --declarations <name>`; say what you reused.
5. Report nothing about navigation; the record does (CLI calls only; your own reads are not
   recorded, and the report says so).

## Interfaces

```ts
buildMap(runtime, { project, mode: 'prompt'|'context', layers, layersSource?, terms?, paths?, symbols?, request? }): Promise<MapResult>;
refs(runtime, names: string[], { project, declarations? }): Promise<RefsResult>;      // git grep -w
type LayerName = 'shortlist' | 'harvest' | 'grep';
```

CLI: `$A map [paths…] [--term …] [--symbol …] [--mode …] [--project …]`, `$A refs <name>…
[--declarations]`. Both record their ledger entry on the task's live route when `--task` names one.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| A layer name not in the table | `search-layer-unknown`; release: fix `search.layers` |
| `map --layers` typed by the model | `search-layers-not-for-model`; release: edit `search.layers` in config (D15) |
| A term matches > 60% of files | dropped, listed under limitations |
| A name collides | `collides: true` in the map; step text says to verify imports; no exact tool (P51) |
| Two projects | `--project` or the paths decide; at a hook-run start the raised gate `project-ambiguous`, release `route next --project <id>` (12 §3) |
| Nothing matched | `map.empty`; the investigate route's `scope` gate asks for a file, a symbol or a word |

## What changes from v0.5.0

`prepare` no longer owns navigation; `map` does, in two passes, with the layer list in config.
`READING_ORDER` is replaced by §4. `dependents.ts` is gone; the reviewer greps the snapshot for each
removed or renamed name (16 §6). New: `grepWords`, `map`, `refs`. Removed from v2: `refs --exact`,
`exactMaxFiles`, `task.lspPlugins` (backlog).

## Open problems

- P51 Colliding names have no exact answer: `collides: true` plus a reading instruction (a
  model-obeyed instruction, M2 applies). Measured by the colliding-name impact cases (33 §3); the
  backlog item is the fix if they fail.

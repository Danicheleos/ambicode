# Module: Requirements (ticket and page intake)

## Purpose

Get the whole requirement into evidence (M11), kept raw by code from what the MCP tools returned
(R1, R3). The CLI never fetches; the session's MCP tools do; the hook keeps what came back; code
records which asked sources are present and which are not. No code parses a ticket: the model reads
the raw text. When no MCP source is involved (a pasted ticket, the eval sandbox), the requirement is
**the args text**, built into an envelope by code (#49).

## Inputs

- URLs or ticket keys in the route's args; `--requirement <url>` repeats.
- `requirements.mcps` (names of MCP servers; the first Jira/Confluence one is the requirements server).
- `PostToolUse` payloads of `mcp__*` tools and of `WebFetch` (matchers `mcp__.*` and `WebFetch`),
  **only while a route is active and asked for requirements** (D2; no route → exit at once).
- Requirement text in the args (sandbox `<ticket>…</ticket>`, a pasted description).

### `args.hasRequirement` (the route predicate, defined)

Interactive: true when the args contain a URL or `--requirement`; a **bare key** (`ORD-17`, as the
first word of the request) counts only when `requirements.mcps` is non-empty. **Headless
(`--headless`): true only for an explicit `--requirement <url>`** — the CLI cannot see whether an
`mcp__*` tool exists, and the eval scaffolds copy benchmark configs that set `mcps` (FE) while
the sandbox has no MCP (D17, #76). Everything else — including a key-shaped word in prose — is
false: no fetch step, the envelope is built from the args.

## Outputs

- The route's `fetch` step text (`routes/investigate/fetch.md`, reused by `plan` and `task`;
  `routes/review/fetch.md` for review): fetch each asked URL with the Jira or Confluence MCP tools,
  keep each result whole, read only the ticket or page itself, then `route next`. It names no tool
  and no field list; the session's own tool list decides the calls.
- Captured results `requirements/<key>.json` `{key, url, tool, retrievedAt, rawHash, content}` and
  `requirement {key, via, rawHash, bytes, relation: asked, capture: full}` ledger entries.
- `$A requirements normalize --task <slug>`: the **envelope built by code** — from the captures
  (`builtFrom: captures`) or, with none, from the args text (`builtFrom: args`). Ledger `envelope
  {sources, builtFrom, asked, missingAsked, hash}`.

## Workflow

### 1. Binding

The hook spawns on every `mcp__*` and `WebFetch` call in every session and exits at once when no
route is active (#90, P53). With a route it takes the **asked keys** of the route's args (its
`--requirement` values, the URLs in its text and a bare first-word key); a call is a requirement
read when its input names an asked key, else contains a Jira key, else carries a `url` whose last
path segment is the key. A call with none of these is ignored. `requirements.mcps` is no longer matched
against the tool's server segment: the asked key decides.

### 2. Capture

The `PostToolUse` hook, with a route active and asked sources:

1. Takes the tool's result text (a string, MCP text parts joined, or the JSON of anything else),
   trimmed to 256 KB.
2. Writes `requirements/<key>.<hash8>.json` and appends `requirement`; a repeat with the same
   `rawHash` for the key is not appended twice.
3. Does **nothing else**: no map, no step message, no parsing of fields, children, links or
   acceptance criteria. The ground step runs once, when the model calls `route next` after fetching
   (12 §3). Reading a ticket's children is the model's choice, instructed only by "read the ticket
   or page itself; keys mentioned inside it are not fetched; name them in your answer".

### 3. The code-built envelope

`requirements normalize` (also the first code part of `ground`) builds the envelope:

- **captures exist**: every stored capture whose file still hashes to its `rawHash` is a source
  (`relation: captured`). **Coverage is computed first (G5)**: `missingAsked := asked − {keys with a
  capture}`. The envelope records `asked[]` and `missingAsked[]`; a non-empty `missingAsked` with
  captures present is `requirements-partial` — a notice for investigate/plan/task (the report's Not
  verified names each missing source) and a **refusal** for review: ⛔ `requirements-missing` listing
  them, the `ground` step is refused and the route stays at `ground`, no `exit` entry; release:
  fetch them and `route next` (ground re-runs normalize), or `route start` without that
  `--requirement` (#143).
- **no captures and `!args.hasRequirement`**: the args text (minus flags) is one source `{key:
  ARGS, title: first line, content: rest}`; `builtFrom: args`. Nothing is piped by the model; the
  ground step produces `envelope` in both cases. `missingAsked` then lists only keys the user
  named with `--requirement`, never a URL in prose.
- **`args.hasRequirement` and no captures** when `route next` runs: `requirements-not-captured`
  names what to fetch; after that failure, the next attempt raises the gate
  `requirements-not-captured-twice` *continue without / stop* (default: continue, with an args
  envelope; #80). For review the registry's `policy: {review: stop}` makes *stop* the default and
  release (G5) — a review never degrades to a quality review of a change whose requirement it asked
  for and did not get (25). A quality review without a requirement is a separate, explicit start
  (`/ambicode:review` with no `--requirement`).

The model contributes nothing here but the fetch. A conflict between sources is the model's to
report in its answer; no gate carries it.

## Interfaces

```ts
captureRequirement(hookInput, { asked, ledger, dir, view, runtime }): Promise<LedgerEntry | null>;   // MCP/WebFetch PostToolUse, route active and asked only
normalizeEnvelope({ runtime, dir, ledger, view, args }): Promise<{ state: 'ok'; sources; builtFrom; asked; missingAsked; notices } | { state: 'failed' | 'raise' }>;
hasRequirement({ text, requirements, headless }, { mcps }): boolean;
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `requirements-not-captured` | an asked URL has no capture when `route next` runs | the message names what to fetch; recoverable |
| `requirements-not-captured-twice` | still no capture after that failure | raised gate: continue without (args envelope) / stop; **`policy: {review: stop}`** (G5) |
| `requirements-partial` | captures exist but `missingAsked` is non-empty | investigate/plan/task: notice, each missing source under Not verified; review: ⛔ `requirements-missing` |
| `requirements-missing` | review only: an asked source has no capture | ⛔ refusal of the `ground` step (no `exit` entry; the route stays at `ground`), the sources named; release: fetch them and `route next`, or `route start` without that `--requirement` |

## What changes from v0.5.0

Capture replaces the model-built envelope for MCP sources, storing the raw result; args envelope for
everything else; the fetch instruction replaces the shared reference; `hasRequirement` defined; no
hook work without a route; no parsing of ticket structure anywhere in code.

## Open problems

- P39 Two envelope trust levels: `captures` (real sessions) and `args` (sandbox, pasted text). The
  sandbox measures the `args` path, real sessions the capture path. Labelled apart in every report
  and in `score`.
- P53 The hook spawns on every `mcp__*` and `WebFetch` call in every session, not only requirement
  reads (the work is route-gated). No-route spawns are counted in 33 §7.
- P61 Without field lists the model decides what to request: a large ticket or a `*all` query lands
  whole in context (the real run's epic was 28 KB, its `*all` JQL 53 KB). Model-obeyed, accepted
  with C8; 33 §7 measures the peak.

## v7 changes

**B6.** Any asked URL is keyed by its normalized URL; a `WebFetch` PostToolUse capture produces that key. A tool result that shows a missing or disconnected MCP server is not detected by code: the asked source stays uncaptured and the `requirements-not-captured` path applies.

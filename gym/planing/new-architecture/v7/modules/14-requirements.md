# Module: Requirements (ticket and page intake)

## Purpose

Get the whole requirement into evidence (M11), captured by code from what the MCP tools returned
(R1, R3), expanded one level (R8), with acceptance criteria numbered so coverage can be counted. The
CLI never fetches; the session's MCP tools do; the hook keeps what came back. When no MCP source is
involved (a pasted ticket, the eval sandbox), the requirement is **the args text**, built into an
envelope by code (#49).

## Inputs

- URLs or ticket keys in the route's args; `--requirement <url>` repeats.
- `requirements.mcpServer` (nullable) and the connected servers the model can see.
- `PostToolUse` payloads of **any** `mcp__*` tool (the matcher is `mcp__.*`; the binding rule runs
  inside the hook, #52), **only while a route is active** (D2; no route → exit in < 90 ms).
- Requirement text in the args (sandbox `<ticket>…</ticket>`, a pasted description).

### `args.hasRequirement` (the route predicate, defined)

Interactive: true when the args contain a URL or `--requirement`; a **bare key** (`ORD-17`) counts
only when `requirements.mcpServer` is set. **Headless (`--headless`): true only for an explicit
`--requirement <url>`** — the CLI cannot see whether an `mcp__*` tool exists, and the eval scaffolds
copy benchmark configs that set `mcpServer` (FE) while the sandbox has no MCP (D17, #76). Everything
else — including a key-shaped word in prose (today's regex `prepare-on-skill.ts:61-62` fires on
`NOM-36` in a sentence, a known false positive) — is false: no fetch step, the envelope is built
from the args.

## Outputs

- `$A requirements template --requirement <url>… --task <slug>`: binding, match rule, the exact
  fetch calls including expansion **with field lists** (#47), and "run `route next` when done".
  ~1.2 KB; replaces `requirements-mcp.md`, `config` and the ToolSearch probe (M1).
- Captured payloads `requirements/<key>.json` and `requirement` ledger entries with `rawHash`.
- `$A requirements normalize --task <slug>`: the **envelope built by code** — from the captures
  (`builtFrom: captures`) or, with none, from the args text (`builtFrom: args`); validated by the
  existing zod schema plus `relation`/`derivedFrom`. Ledger `envelope`.
- `$A requirements acs --task <slug>`: `AC-<key>-<nn>` units with quotes (key = `ARGS` for an args envelope).

## Workflow

### 1. Binding (G2)

A connected tool `mcp__<server>__<tool>` matches when `<server>` equals the configured name, or, when
no exact match exists, when the configured name is a case-insensitive token of the server segment
(`atlassian` matches `claude_ai_Atlassian_Rovo`). The hook **spawns on every `mcp__*` call in every
session** (89 ms) and exits at once when no route is active; the binding rule runs only with a
route, and non-matching servers are ignored (#90, P53). `mcpServer: null` and one match → the template names it and asks the model to
tell the user to pin it; several → raised gate `requirements-server-ambiguous` ⏸ (release: *continue
without requirements*; default: continue without, non-acting).

### 2. Expansion, one level (R8), with field lists

| Source | Read in full | List only |
|---|---|---|
| Epic / issue with children | the issue, each child (cap 10) | linked issues |
| Story / bug | the issue | parent (summary), links |
| Confluence page | the page | child pages |
| Key mentioned in a read text | nothing | listed once as `mention` |

The template names the calls **and their fields**: `getJiraIssue KEY fields=summary,description,
issuetype,parent,issuelinks,customfield_<acceptance>`, `searchJiraIssuesUsingJql "parent = KEY"
fields=key,summary` (the real run's `*all` JQL put 53 KB into context; the field list is the only
lever that keeps it out, because capture happens **after** the payload is in the model's window,
#47), then **"if the JQL returned more than 10 hits, stop here and run `route next`"**; otherwise
`getJiraIssue` per child with the same field list. On that early `route next`, ground raises
`requirements-expansion-capped` ⏸ *read all / read these / none* **before** any child is read and
prints the chosen keys as the next fetch step (+1 `route next`, counted in 22; #81); headless
default: **list only**. This is a model-obeyed instruction (M2 applies); 30 §3 measures the peak,
not this text.

### 3. Capture and the code-built envelope

The MCP `PostToolUse` hook, with a route active and a bound server:

1. Identifies the tool (`get*`, `search*`, `fetch*`, `read*`) and extracts the document(s) from the
   response: key, summary, type, parent, links, and the text fields (the existing `NOT_THE_TICKET`
   stripping). A `search*` response is reduced to key + summary per hit **on disk** (53 KB → ~2 KB
   in `requirements/`; the context cost was already paid).
2. Writes `requirements/<key>.json` `{key, url, title, type, relation, derivedFrom, retrievedVia,
   retrievedAt, sourceVersion, updatedAt, content, rawHash}` and appends `requirement`.
3. Does **nothing else**: no map, no step message. The ground step runs once, when the model calls
   `route next` after fetching (12 §3).

`requirements normalize` then builds the envelope:

- **captures exist**: `asked` sources are the URLs in the args; a capture with `relation:
  child|parent|link` must chain to an asked key (`derivedFrom`), else `requirements-derived-orphan`.
  `builtFrom: captures`. **Coverage is computed before the branch is chosen (G5)**: `missingAsked :=
  asked − {keys with a complete capture}` (a `search*` list-only hit is **not** a capture of the
  listed document; only a `get*/fetch*/read*` capture with `content` counts). The envelope records
  `asked[]` and `missingAsked[]`; a non-empty `missingAsked` with captures present is
  `requirements-partial` — a notice for investigate/plan/task (the report's Not verified names each
  missing source) and a **refusal** for review (25 step 2: ⛔ `requirements-missing` listing them —
  the `ground` step is refused and the route stays at `ground`, no `exit` entry; release: fetch them
  and `route next` (ground re-runs normalize), or `route start` without that `--requirement`; #143).
- **no captures and `!args.hasRequirement`**: the args text (minus flags) is one source `{key:
  ARGS, title: first line, content: rest}`; `builtFrom: args`. Nothing is piped by the model; the
  ground step produces `envelope` in both cases (the v2 `--evidence -` model path is gone).
- **`args.hasRequirement` and no captures** when `route next` runs: `requirements-not-captured`
  names the fetch call; the second time → raised gate `requirements-not-captured-twice` *continue
  without / stop* (default: continue, with an args envelope; #80). **For review every
  missing-source gate stops** (G5): the registry's `policy: {review: stop}` is on
  `requirements-server-disconnected`, `requirements-server-ambiguous` **and**
  `requirements-not-captured-twice` (32 §4), and `requirements-missing` above is a refusal of the
  `ground` step, not a gate and not an `exit` (#143) — a review never degrades to a quality review of a change whose requirement it asked for
  and did not get (25). A quality review without a requirement is a separate, explicit start
  (`/ambicode:review` with no `--requirement`).

The model contributes only what code cannot: `route next --conflict "<summary>" --sources A,B`
raises `requirements-conflicting`; the answer is `--answer requirements-conflicting=<source>` (one
gate id, #94).

### 4. Acceptance criteria

`requirements acs` splits each content into units: explicit AC/"Definition of done" sections by
bullet or number; else bullets and numbered items; else sentences ≥ 40 chars with a modal.
`AC-<key>-<nn>`, stable for unchanged text. The plan's AC → section table and the report's Not
covered cite them; `plan check` counts unmapped ids. The splitter is a signal until a labelled sample
gives its precision (P23); for the plan eval the three epics' ACs are hand-labelled (33 §4).

### 5. Conflicts

The model reports them; `requirements-conflicting` is a raised gate ⏸ "which source governs?"; the
answer is `acceptance {gate: requirements-conflicting}`; the non-acting default is *stop* (`exit blocked`).

## Interfaces

```ts
interface Requirements {
  template(urls, task): TemplateOutput;
  capture(hookInput, task): LedgerEntry | null;        // MCP PostToolUse, route active and bound only
  normalize(task): NormalizedRequirements;              // captures | args; {sources, builtFrom, asked, missingAsked} (G5)
  acs(task): AcceptanceCriterion[];
  hasRequirement(args, config): boolean;
}
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `requirements-server-disconnected` | bound server not connected | connector settings named; raised gate: continue without (args envelope); **`policy: {review: stop}`** — a review never runs on a missing requirement (#65) |
| `requirements-server-ambiguous` | several matching servers, `mcpServer: null` | gate; default continue without; review: default and release *stop*, `{servers…}` still offered (**`policy: {review: stop}`**, 12 §3.5, G5, #144) |
| `requirements-expansion-capped` | JQL > 10 hits, raised before the child reads | gate; headless: list only |
| `requirements-derived-orphan` | a capture with no chain to an asked key | dropped with a notice |
| `requirements-not-captured` | an asked URL has no capture when `route next` runs | the message names the fetch call |
| `requirements-not-captured-twice` | still no capture on the next advance | gate: continue without (args envelope) / stop; **`policy: {review: stop}`** (G5) |
| `requirements-partial` | captures exist but `missingAsked` is non-empty | investigate/plan/task: notice, each missing source under Not verified; review: ⛔ `requirements-missing` (G5) |
| `requirements-missing` | review only: an asked source has no complete capture (from `requirements-partial`, or a list-only `search*` hit for an asked key) | ⛔ refusal of the `ground` step (no `exit` entry; the route stays at `ground`), the sources named; release: fetch them and `route next` (ground re-runs normalize), or `route start` without that `--requirement`; a second identical refusal → `stop:blocked` offered (12 §5, #143) |
| existing 13 codes | unchanged | unchanged |

## What changes from v0.4.0

Capture replaces the model-built envelope for MCP sources; args envelope for everything else;
template replaces the shared reference; expansion allowed and instructed with field lists; `search*`
tools recognized; ACs; binding rule in the hook; `hasRequirement` defined; no hook work without a
route.

## Open problems

- P8 Capture must know each server's response shape; two shapes are in the captured sessions
  (`benchmarks/FE/*.jsonl`); a third server needs a fixture.
- P23 AC splitting precision.
- P39 Two envelope trust levels: `captures` (real sessions) and `args` (sandbox, pasted text). The
  sandbox measures the `args` path, real sessions the capture path. Labelled apart in every report
  and in `score`.
- P53 The MCP hook spawns on every `mcp__*` call in every session (89 ms each; the work is
  route-gated), not only on the four Atlassian tokens. No-route spawns are counted in 33 §7.

## v7 changes

**B6.** Any asked URL is keyed by its normalized URL; a `WebFetch` PostToolUse capture produces that key. `mention` joins the relation enum. `mention` is recorded only for a non-asked URL that a captured source mentions, and mentions never count toward a complete capture. A missing or disconnected MCP server in a tool result raises `requirements-server-disconnected`.

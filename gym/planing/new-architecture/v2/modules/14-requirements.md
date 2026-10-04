# Module: Requirements (ticket and page intake)

## Purpose

Get the whole requirement into evidence (M11), captured by code from what the MCP tools returned
(R1, R3), expanded one level (R8), with acceptance criteria numbered so coverage can be counted. The
CLI never fetches; the session's MCP tools do; the hook keeps what came back.

## Inputs

- URLs or ticket keys in the route's args; `--requirement <url>` repeats.
- `requirements.mcpServer` (nullable) and the connected servers the model can see.
- `PostToolUse` payloads of MCP read tools (`get*Issue|Page`, `fetch*`, `read*`, `search*`), **only
  while a route is active** (D2; no route → the hook does nothing).
- For requirement text that arrived in the prompt (eval sandbox, a pasted ticket): an envelope the
  model pipes on `--evidence -`, labelled `builtFrom: model`.

## Outputs

- `$A requirements template --requirement <url>… --task <slug>`: binding, match rule, the exact
  fetch calls including expansion, and "run `route next` when done". ~1.2 KB; replaces
  `requirements-mcp.md`, `config` and the ToolSearch probe (M1).
- Captured payloads `requirements/<key>.json` and `requirement` ledger entries with `rawHash`.
- `$A requirements normalize --task <slug>`: the **envelope built by code** from the captures
  (`envelope` ledger entry), validated by the existing zod schema plus `relation`/`derivedFrom`.
- `$A requirements acs --task <slug>`: `AC-<key>-<nn>` units with quotes.

## Workflow

### 1. Binding (G2)

A connected tool `mcp__<server>__<tool>` matches when `<server>` equals the configured name, or, when
no exact match exists, when the configured name is a case-insensitive token of the server segment
(`atlassian` matches `claude_ai_Atlassian_Rovo`). `mcpServer: null` and one match → the template names
it and asks the model to tell the user to pin it; several → a gate ⏸ (release: *continue without
requirements*; default: continue without, non-acting).

### 2. Expansion, one level (R8)

| Source | Read in full | List only |
|---|---|---|
| Epic / issue with children | the issue, each child (cap 10) | linked issues |
| Story / bug | the issue | parent (summary), links |
| Confluence page | the page | child pages |
| Key mentioned in a read text | nothing | listed once as `mention` |

The template names the calls: `getJiraIssue KEY fields=*all`, `searchJiraIssuesUsingJql "parent = KEY"`
(or the equivalent ToolSearch finds), `getJiraIssue` per child. Over 10 children → gate ⏸ *read all /
read these / none*; headless default: **list only** (non-acting).

### 3. Capture and the code-built envelope (review C14, C1)

The MCP `PostToolUse` hook, with a route active:

1. Identifies the tool (`get*`, `search*`, `fetch*`, `read*`) and extracts the document(s) from the
   response: key, summary, type, parent, links, and the text fields (the existing `NOT_THE_TICKET`
   stripping). A `search*` response is reduced to key + summary per hit (53 KB → ~2 KB for the real
   run's broad JQL).
2. Writes `requirements/<key>.json` `{key, url, title, type, relation, derivedFrom, retrievedVia,
   retrievedAt, sourceVersion, updatedAt, content, rawHash}` and appends `requirement`.
3. Does **nothing else**: no map, no step message. The ground step runs once, when the model calls
   `route next` after fetching (12 §3).

`requirements normalize` then builds the envelope from the captures: `asked` sources are the URLs in
the args; a capture with `relation: child|parent|link` must chain to an asked key (`derivedFrom`),
else `requirements-derived-orphan`. The model contributes only what code cannot: `route next
--conflict "<summary>" --sources A,B` and, after the conflict gate, `--resolution`. There is no
paraphrase to detect, so v1's `requirements-paraphrased` and its normalizer are gone.

Fallback, prompt-provided text (sandbox or pasted): the model pipes the v0.4.0 envelope on
`--evidence -`; the entry is `builtFrom: model`, and the report labels those sources "as provided by
the model".

### 4. Acceptance criteria

`requirements acs` splits each captured content into units: explicit AC/"Definition of done"
sections by bullet or number; else bullets and numbered items; else sentences ≥ 40 chars with a
modal. `AC-<key>-<nn>`, stable for unchanged text. The plan's AC → section table and the report's Not
covered cite them; `plan check` counts unmapped ids. The splitter is a signal until a labelled sample
gives its precision (P23); for the plan eval the three epics' ACs are hand-labelled (33 §4).

### 5. Conflicts

The model reports them; `requirements-conflicting` raises a gate ⏸ "which source governs?"; the answer
is `acceptance {gate: conflict}`; the non-acting default is *stop* (`exit blocked`).

## Interfaces

```ts
interface Requirements {
  template(urls, task): TemplateOutput;
  capture(hookInput, task): LedgerEntry | null;        // MCP PostToolUse, route active only
  normalize(task | evidenceStdin): NormalizedRequirements;
  acs(task): AcceptanceCriterion[];
}
```

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `requirements-server-disconnected` | bound server not connected | connector settings named; gate: continue without |
| `requirements-expansion-capped` 🆕 | > 10 children | gate; headless: list only |
| `requirements-derived-orphan` 🆕 | a capture with no chain to an asked key | dropped with a notice |
| `requirements-not-captured` 🆕 | an asked URL has no capture when `route next` runs | the message names the fetch call; second time → gate: continue without |
| existing 13 codes | unchanged | unchanged |

## What changes from v0.4.0

Capture replaces the model-built envelope for MCP sources; template replaces the shared reference;
expansion allowed and instructed; `search*` tools recognized; ACs; binding rule; no hook work without
a route.

## Open problems

- P8 Capture must know each server's response shape; two shapes are in the captured sessions
  (`benchmarks/FE/*.jsonl`); a third server needs a fixture. (Replaces v1's P7.)
- P23 AC splitting precision.
- P39 `builtFrom: model` envelopes are the v0.4.0 trust level; the sandbox measures that path, real
  sessions the capture path. The two are labelled apart in every report and in `score`.

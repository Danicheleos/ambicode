# Module: Requirements (ticket and page intake)

## Purpose

Get the whole requirement into evidence, not just the URL that was typed (M11), keep it
verbatim and provable (rawHash), and make its acceptance criteria countable so a plan or a
report can show which ones it covers (abstract 02, block Q). The CLI still never fetches:
the session's MCP tools do, and a hook records what came back.

## Inputs

- URLs or ticket keys in the skill args; `--requirement <url>` repeats.
- The configured binding `requirements.mcpServer` (nullable) and the connected servers the model
  can see.
- `PostToolUse` payloads of MCP read tools (`get*Issue|Page`, `fetch*`, `read*`, and 🆕
  `search*Jql|search*`), which carry the raw response.
- The envelope the model builds, piped on `--evidence -` (unchanged transport).

## Outputs

- **Template**: `$A requirements template --requirement <url>… [--task <slug>] --json` prints the
  binding (server name, how to match it), the envelope skeleton with every field present, and the
  expansion instruction for the source's type. One call replaces reading `requirements-mcp.md`,
  `config`, and the ToolSearch probe (M1).
- **Normalized envelope** (zod, strict) with `derivedFrom`, available to every consuming command.
- **AC list**: `$A requirements acs --task <slug>` prints numbered units `AC-ORD-17-01 …` from the
  retrieved text, deterministic (bullets, numbered items, "Acceptance criteria" sections, else
  sentences), with the source id and a quote. The model may merge or split, but cites the ids.
- Ledger: `requirement` entries with `rawHash` (from the hook) and `normalizedHash` (from the
  envelope). ⛔ `requirements-paraphrased` when they differ after normalization.

## Workflow

### 1. Binding (fixes G2)

The template prints the bound server and the match rule: a connected tool `mcp__<server>__<tool>`
matches when `<server>` equals the configured name, or, when the configured name has no exact match,
when the configured name is a case-insensitive token of the server segment (`atlassian` matches
`claude_ai_Atlassian_Rovo`). With `mcpServer: null` and exactly one matching server, the template
names it and asks the model to tell the user to pin it; with several, the template lists them and the
route raises a gate ⏸ (release: *continue without requirements*, recorded as `default-taken`).

### 2. Expansion, one level (R8)

| Source type | Read in full | List only (key + summary) |
|---|---|---|
| Epic, or an issue with children | the issue, every child (cap 10; beyond that, list and ask) | linked issues |
| Story / bug / task | the issue | parent (summary), linked issues |
| Confluence page | the page | child pages (titles) |
| Issue mentioned in the text of a read issue | nothing | listed once as `mention` |

The template's expansion instruction names the exact tool calls: `getJiraIssue KEY fields=*all`, then
`searchJiraIssuesUsingJql "parent = KEY"` (or the server's equivalent found by ToolSearch) and
`getJiraIssue` per child. The naked model did this unprompted (M11); the plugin stops forbidding it.
Every retrieved document becomes an envelope source with `relation: asked|child|parent|link` and
`derivedFrom: <key>`; the CLI accepts them (today's "nothing else" check becomes "nothing without a
`derivedFrom` chain to an asked URL").

### 3. Raw hashes

The MCP `PostToolUse` hook (exists) now also appends `requirement {id, via, rawHash}` after
normalizing the response text: strip HTML/ADF to text, collapse whitespace, drop URLs, keys, UUIDs
and timestamps (the existing `NOT_THE_TICKET` stripping). `normalize` applies the same function to
each envelope `content` and compares. Mismatch → ⛔ `requirements-paraphrased`, with the first
differing 80 characters; the release is to re-send verbatim. The same hook still triggers the
search pass of the route (14 → 10), so a ticket read produces both evidence and the map.

### 4. Acceptance criteria

`requirements acs` splits each source's content into units:

1. explicit "Acceptance criteria" / "AC" / "Definition of done" sections, by bullet or number;
2. otherwise bullets and numbered items anywhere;
3. otherwise sentences ≥ 40 chars that contain a modal ("must", "should", "never", "only", "can").

Each unit is `AC-<sourceId>-<nn>` with its quote. Numbering is stable across runs for unchanged text.
The plan's "Requirements → sections" table and the report's "Not covered" use these ids; `plan check`
([17-workers.md](17-workers.md) §3) counts unmapped ids. The model may say "AC-ORD-17-04 and -05 are
one requirement": that is judgment and allowed; dropping an id silently is what the count catches.

### 5. Conflicts

Unchanged: the model reports contradictions in `conflicts`; `requirements-conflicting` stops the
route with a gate ⏸ "which source governs?" whose answer is recorded as `acceptance {gate:
conflict, answer}` and carried in the envelope as `resolution`.

## Interfaces

```ts
interface Requirements {
  template(urls, task?): TemplateOutput;             // binding + skeleton + expansion steps
  normalize(input): NormalizedRequirements;          // v0.4.0, plus derivedFrom and hash check
  acs(task): AcceptanceCriterion[];
  recordRaw(hookInput): LedgerEntry | null;          // from the MCP PostToolUse hook
}
```

Envelope v2 adds per source: `relation`, `derivedFrom`, `fields` (which fields were requested, so
"5 fields only" is visible), and `rawHash` is *not* a field the model fills (the hook has it).

## Failure modes and exits

| Code | Cause | Release |
|---|---|---|
| `requirements-server-disconnected` | bound server not connected | message names the connector settings; gate: continue without |
| `requirements-paraphrased` 🆕 | content differs from the hook's raw text | re-send verbatim (mechanical) |
| `requirements-expansion-capped` 🆕 | more than 10 children | the list is in the message; gate: read all / read these / none |
| `requirements-derived-orphan` 🆕 | a source with no `derivedFrom` chain to an asked URL | drop it or add the asked URL |
| existing 13 codes | unchanged | unchanged |

## What changes from v0.4.0

- `requirements-mcp.md` (818 words) is replaced by `requirements template` output (~1.2 KB) that the
  route delivers at the step where it is needed.
- Expansion allowed and instructed; `derivedFrom` sources accepted.
- Hash check; AC list; binding match rule.

## Open problems

- P7 Hash normalization across servers: Rovo returns ADF/markdown; another server may return
  rendered HTML. The normalizer is tested against captured payloads from the two servers seen
  (`benchmarks/FE/*.jsonl` hold real ones); a third server may need a third fixture.
- P8 `searchJiraIssuesUsingJql` payloads are large (53 KB for a broad query in the real run). The hook
  strips to key + summary for `search*` tools; a child read in full goes through `getJiraIssue`.
- P23 AC splitting by sentence modals will over- and under-count on prose tickets; the count is a
  signal for the plan checker, not a gate, until a labelled sample (≥ 30 tickets) gives precision.

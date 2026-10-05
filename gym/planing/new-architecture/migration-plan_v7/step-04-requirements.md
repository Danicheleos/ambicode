# Step 04 — Requirements complete: field-list template, expansion gate, binding, `search*` capture, coverage, conflicts, ACs

> Prerequisites: step 03 integrated **and** decision A recorded as *proceed* by the user. Spend: $0
> (this step has no paid item). Read [05-working-rules.md](05-working-rules.md) first; it governs
> this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §1, §3,
> §5, §7, §8; [v6/14](../v6/modules/14-requirements.md) whole; [v6/32](../v6/32-artifacts.md) §4
> (`requirements-*` entries) and §6; [v6/12](../v6/modules/12-route.md) §3.3 (`--conflict`), §3.4
> and §3.5 (registry `policy`); [v6/25](../v6/skills/25-review.md) step 2;
> [v6/22](../v6/skills/22-investigate.md) steps 1–3; [v6/23](../v6/skills/23-plan.md) steps 2–3 and
> [v6/24](../v6/skills/24-task.md) step 1 (how plan and task consume the envelope and ACs);
> [v6/01](../v6/01-goals-and-constraints.md) M11, R8, D17; [v6/40](../v6/40-open-problems.md) P8,
> P23, P39, P53; [v6/33](../v6/33-measurement.md) §7.
> Background (PRIMARY only, read-only): `$PRIMARY/gym/planing/investigation/archive/real-run-VS-6735-2026-10-02.md`
> §6 row B1 and §4 (what the `*all` JQL put into context; which fields the real session used).

## Goal

Get the whole requirement into evidence by code. The template tells the model exactly which calls
and fields to use, expands one level, and stops before child reads when a JQL returns more than 10
hits. The hook binds the right server and keeps what came back, reducing `search*` lists to key +
summary. `normalize` computes coverage before choosing captures or args. The conflict gate and the
deterministic AC splitter complete the module for plan, task and review.

## Starting point

Recheck these at dispatch. Step 03 is the owner of most of the files below; use the names it
actually delivered and list any difference in the report.

- Today (before step 03) `src/requirements/` holds only `normalize.ts` (401 lines: the v0.4.0
  model-built evidence envelope, `normalizeRequirements`, `loadRequirementEvidence`) and
  `requirements.test.ts`. `NOT_THE_TICKET` (the text-field deny set) and `textOf` live in
  `src/hook/events/prepare-on-skill.ts`. `src/contracts/requirements.ts` holds `RequirementSource`
  and `RequirementConflict`. `src/contracts/config.ts`: `requirements: {mcpServer, lsp}`,
  `SUPPORTED_SCHEMA_VERSION = 1`. `hooks/hooks.json` matches `mcp__.*([Aa]tlassian|[Jj]ira|[Cc]onfluence|[Rr]ovo).*`.
- From step 03 (per [step-03](step-03-route-engine-investigate.md) Contract, 03-Q1 … 03-Q8, 01-contracts §2–§7
  and the 00-README layout/ownership table):
  - `src/requirements/{has-requirement,template,capture,envelope,acs}.ts`: `hasRequirement(args,
    {mcpServer})` exactly as v6/14; `requirementsTemplate({sources, task, mcpServer}) → {text, bytes}`
    (server binding, field lists, one-level expansion, the > 10 early-stop sentence, the completion
    command); `captureRequirement(HookInput, CaptureDeps)`: the MCP capture of get/search/fetch/read
    shapes with `NOT_THE_TICKET` stripping, `rawHash`, `relation`, `derivedFrom`, list-only reduction
    to `requirements/search-<12 hex of rawHash>.json` and no hook advance; `normalizeEnvelope` in
    `envelope.ts` with `asked`/`missingAsked`, captures-or-args, the orphan notice,
    `requirements-not-captured` (first) / `requirements-not-captured-twice` (second), and the partial
    notice/refusal by skill; the first `splitAcs(EnvelopeSource[])` with `AC-<key>-<nn>` ids.
    `normalize.ts` keeps the v0.4.0 review code and only reuses `envelope.ts`.
  - `src/hook/events/run-hook.ts`: the `mcp__.*` PostToolUse capture path, gated on an active route
    (the active-route pointer, with the ledger scan fallback). `hooks/hooks.json` matcher `mcp__.*`.
  - `src/route/{engine,fold,routes,gates,flags,consent,context,command-tail}.ts`: one advance
    algorithm; `routes/gates.yaml` complete from v6/32 §4, with `policy: {review: stop}` on
    `requirements-server-disconnected`, `requirements-server-ambiguous` and
    `requirements-not-captured-twice`; dynamic `{servers…}`/`{keys}`/`{sources…}` options instantiated
    before validation and printing; the handler results of `src/route/handlers.ts`: `failed {code,
    message, recoverable: true}` (refused, no `completed`, no `exit`) used for
    `requirements-not-captured` and `requirements-missing`, and `raise {gate, values}`; same-error ×2 offers
    `stop:blocked`; fixture-only routes for steps not yet shipped; `route stop`.
  - CLI: `route start/next/status/stop`, `requirements template/normalize/acs` in `SPECS`/`USAGE`;
    `requirements normalize` has the command tail. `route next` flags per [v6/31](../v6/31-cli.md),
    including `--conflict "<s>" --sources A,B`, parsed by `flags.ts` into `AdvanceInput.conflict
    {summary, sources}` (step 03 parses it; nothing in step 03 validates or raises it).
  - Config v3 reader (`SUPPORTED_SCHEMA_VERSION = 3` for reading, v1/v2 with notices).
  - `routes/investigate.yaml` (template/fetch/ground/scope/read/report-step/write).
- From step 02: `kinds.ts` `requirement {key, via, rawHash, bytes, relation, capture, derivedFrom?}`
  and `envelope {sources[], builtFrom, asked[], missingAsked[], hash}` (both `passthrough()`);
  `appendLedger`/`withLedgerLock`; `buildReport` with its `Requirements` line and the
  `envelope.missingAsked` items under `Not verified` (02-R3); `taskDirFor(...).requirements`.
- From step 00: `evals/scripts/src/analysis/ledger-metrics.mjs` already emits `envelopeBuiltFrom`
  and `noRouteMcpSpawns: null` with the reason `MCP_SPAWNS_UNMEASURED`. `evals/evals-core/README.md`
  documents the ledger fields `score` reads.
- `src/util/skill-content.test.ts` "F3 documented outcomes": every literal `new AmbicodeError('<code>'`
  must appear in a skills Markdown file.
- Recordings for P8 (PRIMARY, ignored): `$PRIMARY/benchmarks/FE/*.jsonl` (three session files).
  Read their JSON key paths only, never values.

## Files

Budgets are source lines added or changed, tests excluded (05-working-rules §2.3). As a guide,
tests for this step should total about 900 lines, plus synthetic fixtures.

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/requirements/template.ts` | change | +110 | per-source call lists with field lists, observed-name fallback, acceptance field, binding header (04-T*) |
| `src/requirements/binding.ts` | create | 60 | `serverOf`, `bindServer`, `capturedServers` (04-B*); imported by the hook path, so it imports nothing heavy |
| `src/requirements/capture.ts` | change | +70 | binding before capture; `search*` reduction to key + summary; both P8 shapes (04-C*) |
| `src/requirements/expansion.ts` | create | 70 | hit count, the `requirements-expansion-capped` decision and the chosen-keys fetch instruction (04-X*) |
| `src/requirements/envelope.ts` | change | +90 | `normalizeEnvelope` ground order: binding, expansion, coverage, envelope branch; orphan drop, `conflicts` on the envelope (04-E*, 04-K*) |
| `src/requirements/conflict.ts` | create | 60 | validate `--conflict/--sources`, raise the gate, record the governing source (04-K*) |
| `src/requirements/acs.ts` | change | +50 | the three-tier splitter, deterministic ids (04-A*) |
| `src/route/gates.ts` | change | +25 | answer-handler seam for raised gates; step 03 has none (D7) |
| `src/route/flags.ts` | change | +15 | route step 03's parsed `AdvanceInput.conflict` to `raiseConflict` (D8) |
| `src/contracts/config.ts` | change | +4 | `requirements.acceptanceField` (04-T5) |
| `src/config/defaults.ts` | change | +1 | `acceptanceField: null` |
| `src/task/report.ts` | change | ±15 | the `Requirements` line names `captures` or `args` (04-R1) |
| `evals/evals-core/README.md` | change | +4 | sandbox runs are always `builtFrom: args` (04-R3) |
| `skills/review/references/outcomes.md` | change | — | any new literal error code (Contract) |
| `src/requirements/fixtures/*.json` | create | — | synthetic P8 payload shapes and texts (Tests) |
| `src/route/fixtures/review-requirements.yaml` (or step 03's fixture-route directory) | create | — | synthetic review route for S7/S8 (Tests) |

Unchanged in this step: `hasRequirement` (D17, step 03), `routes/gates.yaml` (registry defaults,
releases and policies), `routes/investigate.yaml`, `hooks/hooks.json`, every `SKILL.md`,
`benchmarks/*/.ambicode/config.yaml`, `evals/scripts/src/analysis/ledger-metrics.mjs` (see 04-R2),
`src/route/ownership.ts`, `src/hook/guard/*`.

## Contract

```ts
// src/requirements/binding.ts
export type Binding =
  | { state: 'bound'; server: string; how: 'exact' | 'token' | 'only-candidate' }
  | { state: 'none' }
  | { state: 'ambiguous'; servers: string[] };                 // sorted, distinct
export const CANDIDATE_TOKENS = ['atlassian', 'jira', 'confluence', 'rovo'] as const;
export function serverOf(toolName: string): string | null;    // 'mcp__<server>__<tool>' → '<server>'
export function capturesFrom(configured: string | null, server: string): boolean;   // hook-time filter (04-B2)
export function bindServer(configured: string | null, servers: readonly string[]): Binding;   // ground-time (04-B3)

// src/requirements/template.ts (extends step 03's `requirementsTemplate`; adds `observedTools` and
// the config field). `mcpServer` is the `configured` value of 04-T7 and 04-B*; each source string is
// classified into an `AskedSource` by 04-T1.
export function requirementsTemplate(input: { sources: readonly string[]; task: string;
  mcpServer: string | null; acceptanceField: string | null;
  observedTools: readonly string[] }): { text: string; bytes: number };
export type AskedSource = { kind: 'jira'; key: string; url: string | null } | { kind: 'confluence'; id: string; url: string };

// src/requirements/expansion.ts
export function hitCount(list: CapturedList): number;
export type ExpansionDecision =
  | { state: 'none-needed' }
  | { state: 'raise'; parent: string; keys: string[] }
  | { state: 'fetch'; parent: string; keys: string[] }        // answered read all / read these
  | { state: 'done' };
export function expansionFor(view: RouteView, window: readonly LedgerEntry[]): ExpansionDecision;

// src/requirements/conflict.ts — both run inside the advance's lock (03-O6) and write through its
// `LockedLedger`; the raise is step 03's `HandlerResult` `raise`, printed by the engine (03-E4)
export function raiseConflict(input: { view: RouteView; ledger: LockedLedger; summary: string;
  sources: readonly string[] }): Promise<HandlerResult>;   // raise {gate: 'requirements-conflicting', values: {sources, summary: [summary]}} | failed requirements-conflict-sources
export function recordGoverning(input: { view: RouteView; ledger: LockedLedger;
  acceptance: AcceptanceEntry }): Promise<LedgerEntry | null>;

// src/requirements/acs.ts (step 03's function and input; output type widened with `where`)
export interface AcceptanceCriterion { id: string; key: string; quote: string; where: string }
export function splitAcs(sources: readonly EnvelopeSource[]): AcceptanceCriterion[];
```

**Persisted fields** (step 03 shapes; this step relies on them and adds only `hits`, `conflicts`
and `governing`). If step 03 delivered different names, keep step 03's and report the mapping.

| Record | Fields |
|---|---|
| `requirement` (full capture) | `key, via` (full tool name), `rawHash, bytes, relation` `asked\|child\|parent\|link`, `capture: 'full'`, `derivedFrom` (string or null), `route` |
| `requirement` (search list) | `key` (the `K` of a `parent = K` JQL, else `SEARCH`), `via, rawHash, bytes, relation: 'list', capture: 'list', derivedFrom` (`K` or null), `hits` (number), `route` |
| `requirements/<key>.json` | v6/32 §6: `{key, url, title, type, relation, derivedFrom, retrievedVia, retrievedAt, sourceVersion, updatedAt, content, rawHash}` |
| `requirements/search-<12 hex of rawHash>.json` (step 03's path) | `{query, total, hits: [{key, summary}], retrievedVia, retrievedAt, rawHash}` — nothing else from the payload |
| `envelope` | `sources[], builtFrom 'captures'\|'args', asked[], missingAsked[], hash`, optional `server`, optional `conflicts: [{summary, sources: string[], governing: string, acceptance: <ledger id>}]` |

**Config.** `requirements.acceptanceField: string | null`, matching `^customfield_\d+$`, default
`null`. Additive and nullable; absent from v6/32 (implementation reading, 03-review-resolution #129).
Read by the v3 reader; v1/v2 configs load it as `null`. Step 09 proposes and writes it through init.

**CLI.** `route next --task <slug> --conflict "<summary>" --sources A,B` and
`route next --task <slug> --answer requirements-conflicting=<source>` (v6/12 §3.3, v6/31).

**Error and notice codes** used here (raised by step 03's code unless marked new):
`requirements-server-ambiguous` (gate), `requirements-expansion-capped` (gate),
`requirements-conflicting` (gate), `requirements-not-captured`, `requirements-not-captured-twice`
(gate), `requirements-partial` (notice), `requirements-missing` (refusal of `ground`),
`requirements-derived-orphan` (notice). New: `requirements-conflict-sources` (`bad-argument` class:
fewer than two distinct `--sources`, or a source id not in the latest envelope; release names the
envelope's source keys). Every new literal `AmbicodeError` code is documented in
`skills/review/references/outcomes.md` with its release.

## Rules

**T — template** (v6/14 §2; extends step 03's template and its tests)
- 04-T1 An asked source is classified by its text: a URL containing `/wiki/` or `confluence` →
  `confluence` (id = the numeric page id in the path); a URL with `/browse/<KEY>` or a bare key
  `[A-Z][A-Z0-9]+-\d+` → `jira`. Any other URL is printed as "fetch this URL with the bound server's
  read tool" and counts as asked under its URL.
- 04-T2 A `jira` source prints, in this order:
  1. `getJiraIssue <KEY> fields=summary,description,issuetype,parent,issuelinks[,<acceptanceField>]`;
  2. "If issuetype is Epic or the issue has children: `searchJiraIssuesUsingJql "parent = <KEY>"
     fields=key,summary`";
  3. the sentence **"if the JQL returned more than 10 hits, stop here and run `route next --task <slug>`"**
     (step 03's 03-Q2 wording);
  4. "else `getJiraIssue <child>` with the same field list for each child (at most 10)";
  5. "Linked issues and the parent: list them by key and summary; do not read them."
- 04-T3 A `confluence` source prints: read the page; list its child pages by title; do not read them.
- 04-T4 Every template ends with "Keys mentioned inside a text you read: do not fetch them; name
  each once as a mention." and the completion command `$A route next --task <slug>`.
- 04-T5 `acceptanceField` non-null → it is appended to the field list in 04-T2 steps 1 and 4.
  `null` → the field is omitted and the template says "acceptance field not configured
  (`requirements.acceptanceField`); acceptance criteria are read from the description". The CLI
  makes no remote query to find it.
- 04-T6 Literal tool names: `observedTools` is the set of distinct `requirement.via` values in the
  task ledger. When it contains `mcp__<bound server>__getJiraIssue` / `__searchJiraIssuesUsingJql`,
  the template prints that full name. Otherwise it prints the call class and server prefix
  (`the Jira get-issue tool of mcp__<server>__`, or `mcp__<server matching atlassian|jira|confluence|rovo>__`
  when unbound) followed by "(exact tool name not observed)". Field lists are printed in both forms.
- 04-T7 Binding header: `configured` set → "Use MCP server `<configured>`". `configured` null and
  the task ledger holds captures from exactly one server → "Bound `<server>`; tell the user to pin
  `requirements.mcpServer: <server>`". `configured` null otherwise → "Use the connected server whose
  name contains atlassian, jira, confluence or rovo; if several are connected AMBICODE will ask".
  These three headers replace step 03's 03-Q2 binding line, including its null-server line.
- 04-T8 Rendered template for one `jira` and one `confluence` source, with `acceptanceField` set and
  no observed tools, is at most 1,536 bytes.

**B — binding** (v6/14 §1, §3; 01-contracts §7)
- 04-B1 `serverOf` returns the segment between `mcp__` and the next `__`, or null.
- 04-B2 `capturesFrom` (hook time, route active): `configured` set → true when the server equals
  `configured`, or when `configured` (lowercased) equals one of the server's lowercased tokens
  (split on `_`, `-`, `.`). `configured` null → true when a server token contains one of
  `CANDIDATE_TOKENS`. Otherwise false: the payload is ignored and nothing is written.
- 04-B3 `bindServer` (ground time, over `capturedServers` = distinct `serverOf(requirement.via)` in
  the window): an exact match → `bound/exact`. Else exactly one token match → `bound/token` (with
  `configured` set) or `bound/only-candidate` (with `configured` null). Two or more → `ambiguous`.
  No captured server → `none`.
- 04-B4 `ambiguous` at ground → raise `requirements-server-ambiguous` with options = the servers
  then `continue without`, **before** coverage. Answer a server → only that server's captures are
  used. `continue without` (the default) → an args envelope (`builtFrom: args`) and a notice.
- 04-B5 `bound/only-candidate` → ground prints the notice "tell the user to pin
  `requirements.mcpServer: <server>`" once per route chain.
- 04-B6 No route active → the hook exits before reading config or calling any 04-B function
  (step 03's early exit, unchanged; measured in 04-H1).

**C — capture** (v6/14 §3, P8)
- 04-C1 The tool is classified by the lowercased tool segment's prefix: `get` → full, `search` →
  list, `fetch` or `read` → full (Confluence body). Any other prefix, or a payload matching neither
  fixture shape, writes nothing.
- 04-C2 A `get*` capture keeps the text fields after `NOT_THE_TICKET` stripping (step 03's
  extraction). A `fetch*`/`read*` capture keeps the page body. Both write `requirements/<key>.json`
  and one `requirement` record with `capture: 'full'`.
- 04-C3 A `search*` capture writes `requirements/search-<12 hex of rawHash>.json` (step 03's path) holding only `{query, total,
  hits: [{key, summary}], retrievedVia, retrievedAt, rawHash}` and one `requirement` record with
  `capture: 'list'` and `hits` = `hitCount`. For a 53 KB synthetic payload with 20 hits the file is
  at most 2,048 bytes. Summaries are stored verbatim.
- 04-C4 `relation` and `derivedFrom`: an asked key → `asked`, null. A key returned by a
  `parent = K` search, then fetched in full → `child`, `K`. A key named in an asked issue's
  `parent` field → `parent`; in its `issuelinks` → `link`, with `derivedFrom` = that asked key.
  Any other key → `derivedFrom` = null.
- 04-C5 Both P8 shapes are supported: the two key-path structures present in
  `$PRIMARY/benchmarks/FE/*.jsonl` responses. Fixtures are synthetic with mirrored key paths; each
  fixture file's test names the mirrored paths in a comment. No recording value is copied.
- 04-C6 The hook writes captures only; it never appends `map`, `step` or `envelope`, and prints no
  step message (unchanged from step 03).

**X — expansion gate** (v6/14 §2, #81)
- 04-X1 `hitCount` = the larger of `hits.length` and a numeric `total` in the payload.
- 04-X2 At ground, for each asked `jira` key `K` whose latest list capture has `hitCount > 10`,
  when no `requirements-expansion-capped` answer for `K` exists in the window and no `child` capture
  with `derivedFrom: K` exists: raise `requirements-expansion-capped` (options `read all`,
  `read these: {keys}`, `none`; `{keys}` = the stored hit keys) **before** normalize runs. One gate
  per `K`, in asked order.
- 04-X3 Answers: `read all` → every stored hit key. `read these: A,B` → the comma-separated keys
  after the colon that are among the stored hits, in that order; others are dropped with a notice;
  an empty list is treated as `none`. `none` (also the headless default) → list only.
- 04-X4 `read all` / `read these` → ground does not complete. It returns step 03's recoverable
  `failed` result (`recoverable: true`) with an instruction listing exactly one `getJiraIssue <key> fields=…` line per chosen key (04-T2
  field list, 04-T6 naming), then `$A route next --task <slug>`. On the next advance ground runs
  normally; chosen keys still not captured are named in a notice. This instruction is printed once
  per answer.
- 04-X5 Non-chosen hit keys stay list-only: they are neither sources nor `missingAsked`.

**E — envelope and coverage** (v6/14 §3, G5; 01-contracts §7; extends step 03's `normalize`, same
handler and port)
- 04-E1 Ground order: binding (04-B3/B4) → expansion (04-X2) → `asked` (the args URLs and keys, via
  04-T1) → `missingAsked` = asked − {keys with a `capture: 'full'` record from the bound server} →
  envelope branch. `missingAsked` is computed before the branch in every case.
- 04-E2 A list-only hit for an asked key does not count as its capture. A payload that wrote nothing
  (04-C1) does not count.
- 04-E3 Captures exist → `builtFrom: 'captures'`, `server` = the bound server. Sources = full
  captures whose `derivedFrom` chain (followed through `derivedFrom` links) reaches an asked key, or
  that are asked. A capture with no such chain is dropped with the notice `requirements-derived-orphan`
  naming its key; it is not a gate.
- 04-E4 No captures and `!args.hasRequirement` → one source `{key: 'ARGS', title: <first line>,
  content: <rest>}` from the args minus flags; `builtFrom: 'args'`; nothing under `requirements/`.
- 04-E5 `args.hasRequirement` and no captures: first advance → `requirements-not-captured` naming
  the fetch call (ground not completed); next advance still none → raised gate
  `requirements-not-captured-twice` (*continue without* → args envelope; *stop* → exit).
- 04-E6 Captures and non-empty `missingAsked`, skill `investigate`, `plan` or `task` →
  `requirements-partial` notice naming each missing source; the envelope keeps `missingAsked`
  (step 02's report lists each under `Not verified`).
- 04-E7 Same, skill `review` → ⛔ `requirements-missing` naming each missing source: ground is
  refused, no `completed`, no `exit`, the position stays at ground. Release text: "fetch them and run
  `route next` (ground re-runs normalize), or `route start` without that `--requirement`". A second
  identical refusal offers `stop:blocked` (step 03's same-error rule). The engine's generic
  `onError` must not turn this refusal into an exit.
- 04-E8 After 04-E7, a capture of the missing source followed by `route next` completes ground and
  delivers the route's next step. `route stop` is the only path to an exit here.

**K — conflicts** (v6/14 §5, v6/12 §3.3, #94)
- 04-K1 `route next --conflict "<summary>" --sources A,B` requires at least two distinct ids, each a
  source key of the latest envelope; otherwise `requirements-conflict-sources`, nothing recorded.
- 04-K2 Valid → raise `requirements-conflicting` with question "which source governs?", options =
  the source ids then `stop`; default and release `stop` (registry, unchanged). The gate print's
  `object` is absent.
- 04-K3 The answer is `--answer requirements-conflicting=<source>` (one gate id) or a bound hook
  answer. Both options are non-acting, so a flag answer records `acceptance {gate:
  'requirements-conflicting', answer: <source>, via: 'flag', instance}` (01-contracts §5). An option
  outside the instantiated list is refused by the engine (no `"*"` mapping).
- 04-K4 A source answer → `recordGoverning` appends a new `envelope` equal to the latest plus
  `conflicts[]` item `{summary, sources, governing, acceptance: <acceptance id>}` and a new `hash`.
  It is idempotent per acceptance id. `stop` (answered, headless default, or three unanswered
  advances) → `exit` with reason `blocked`.

**P — review policy** (v6/12 §3.5, v6/25 step 2; registry from step 03)
- 04-P1 For `requirements-server-disconnected`, `requirements-server-ambiguous` and
  `requirements-not-captured-twice`, a route with `skill: review` resolves default and release to
  `stop`: headless → `default-taken` *stop* → `exit` reason `blocked`, and no reviewer step is
  delivered. A route with `skill: investigate` takes *continue without* and completes ground with an
  args envelope.
- 04-P2 Interactive review on `requirements-server-ambiguous` still prints the server options; a
  bound answer naming a server continues with that server's captures.

**A — acceptance criteria** (v6/14 §4; extends step 03's `acs`, no second splitter)
- 04-A1 Per source, the first tier that yields at least one unit wins:
  1. sections whose heading (Markdown `#…` line or a line ending in `:`) matches, case-insensitively,
     `acceptance criteria`, `AC`, or `definition of done`: each bullet (`-`, `*`, `•`) or numbered
     item (`1.`, `1)`) up to the next heading;
  2. every bullet or numbered item in the content;
  3. every sentence of at least 40 characters containing `must`, `shall`, `should`, `will`,
     `needs to`, `has to` or `cannot`.
- 04-A2 `id` = `AC-<key>-<nn>`, `nn` = 1-based position within that source, zero-padded to two
  digits (three from 100). `key` is the source key (`ARGS` for an args envelope). `quote` is the unit
  text, trimmed. `where` = `section:<heading>`, `list` or `prose` (keep step 03's values if it
  already defined `where`).
- 04-A3 Same source texts in the same order → byte-identical output. Duplicate bullets each get their
  own id. Two sources number independently.

**R — report and score labels** (P39, D17)
- 04-R1 The report's `Requirements` line always names the envelope origin:
  `Requirements: <n> source(s) from captures (<keys>) via <server>` or
  `Requirements: built from the args text (not captured)`, plus `; missing: <keys>` when
  `missingAsked` is non-empty. `report --json` carries the same `evidence` text.
- 04-R2 `score` keeps step 00's `envelopeBuiltFrom`. `noRouteMcpSpawns` stays `null` with
  `MCP_SPAWNS_UNMEASURED` because traces do not show hook spawns; this step does not change
  `ledger-metrics.mjs`. If the dispatcher supplies a trace format that records hook spawns, that is
  a follow-up, not this step.
- 04-R3 `evals/evals-core/README.md` states that a sandbox run is always `builtFrom: args` (no MCP;
  D17) and that `captures` is measured only in real sessions.

**H — measurements and statements** (v6/33 §7)
- 04-H1 Re-measure the MCP hook's no-route exit after the capture code grew: built bundle
  (`scripts/ambicode.mjs hook`), a synthetic `mcp__x__getJiraIssue` PostToolUse input with no active
  route, 20 spawns, median, interleaved with the pre-change bundle (step 01's method). Budget:
  median ≤ 90 ms. Report both medians.
- 04-H2 The report states: the template's field lists are the only lever on requirement text in
  context (v6/30 §3); this step cannot measure the peak; v6/33 §7 measures it in steps 06–07.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 Overlap with step 03. v6 step 03 §6 already assigns coverage, orphan, not-captured and partial
  semantics to step 03. Where step 03 delivered a rule above, this step adds the named test and
  changes no code for it. Where it did not, this step implements it in the listed file.
- D2 `observedTools` comes from `requirement.via` in the task ledger only (04-T6). The CLI cannot see
  the model's tool catalog. This fallback is an implementation reading, not a config field
  (V6 step 04 §1). Normally the first template has nothing observed and prints the class form.
- D3 Jira issue type is unknown before the read, so the template prints the epic branch as a
  condition on `issuetype` (04-T2 step 2), not as a separate template.
- D4 "A key mentioned in a read text … listed once as `mention`" is a template instruction (04-T4).
  No `mention` record or envelope field is written.
- D5 With `configured` null, the candidate set is the token list of today's `hooks.json` matcher
  (`atlassian|jira|confluence|rovo`). Ambiguity is detected at ground from captured servers (04-B3),
  because the hook sees one call at a time and no extra state store is created.
- D6 With `configured` set and no exact match, two or more token matches also raise
  `requirements-server-ambiguous` (v6/14 §1 "several → raised gate").
- D7 `recordGoverning` is invoked through a raised-gate answer seam that this step adds to
  `gates.ts` (gate id → handler run once per acceptance id, inside the advance that folds the
  acceptance). Step 03's `gates.ts` has no such seam; later steps register on this one.
- D8 `--conflict`/`--sources` are parsed by step 03's `flags.ts` into `AdvanceInput.conflict`. This
  step adds only the validation and the raise (04-K1/K2), wired from that field.
- D9 The chosen-keys fetch instruction (04-X4) reuses step 03's recoverable `failed` result of `ground` (the
  `requirements-not-captured` path). It adds no counter and no route step. `read all` reads every
  hit: the human chose it, and the cap of 10 applies only to the automatic child reads.
- D10 AC ids are positional per source (04-A2). Stability is promised for unchanged text only
  (v6/14 §4; 03-review-resolution reading 7). No hash ids. Insertion stability, if wanted later, is
  proposed separately with its schema consequences.
- D11 Asked identity: a Jira URL or bare key → the key; a Confluence URL → the page id; another
  URL → the URL itself (04-T1). Coverage compares capture `key` with these ids.

## Non-goals (a reviewer may not raise these)

- No fetch from the CLI; no remote query for the acceptance field or the tool catalog.
- No change to `hasRequirement`, the registry's defaults/releases/policies, `hooks.json`, the
  investigate route, or the hook's no-route early exit.
- No trigger for `requirements-server-disconnected`; its policy is tested only (04-P1).
- No third server shape beyond the two P8 shapes; no generic JSON walker for unknown payloads.
- No collector subagent (v6/17 appendix; backlog). No hand-labelled ACs (step 06). No AC precision
  measurement (P23 stays signal).
- No insertion-stable or hash-based AC ids.
- No live review route (step 08); S7/S8 run on a synthetic fixture route.
- No `init` proposal or write of `acceptanceField` (step 09).
- No change to `ledger-metrics.mjs` or a new spawn counter (04-R2).
- No peak-context measurement (04-H2).
- No handling of adversarial payloads (huge key lists, crafted `derivedFrom` cycles beyond simple
  termination, hostile server names). The plugin is not a security sandbox (01-contracts §5).
- No change to `benchmarks/*/.ambicode/config.yaml` (D17); no recording values read or copied.

## Tests

Name each test after its rule. Use real temporary task directories and step 03's engine/CLI entry
points; inject sessions, clocks and the route context. No test reads anything under `gym/` or
`benchmarks/`.

1. `template.test.ts` (snapshot, synthetic keys): jira and confluence templates (04-T1 … 04-T4);
   the > 10 sentence present verbatim (04-T2); acceptance field set versus null (04-T5); observed
   versus class naming (04-T6); the three binding headers (04-T7); 1,536-byte cap (04-T8).
2. `binding.test.ts`, table-driven: `serverOf` (04-B1); exact, token
   (`atlassian` ↔ `claude_ai_Atlassian_Rovo`), none, several, null-config candidate (04-B2, 04-B3,
   D6); ambiguous gate raised before coverage and its two answers (04-B4); pin notice once (04-B5).
3. `capture.test.ts`: prefix classification and the unrecognized payload writing nothing (04-C1);
   `get*` stripping and Confluence body (04-C2); 53 KB / 20-hit search → ≤ 2,048 bytes, only the
   listed fields (04-C3); relation/derivedFrom cases (04-C4); both P8 shapes with the mirrored-path
   comments (04-C5); no `map`/`step`/`envelope` from the hook (04-C6).
4. `expansion.test.ts`: `hitCount` with and without `total` (04-X1); synthetic 12-hit capture → the
   gate is raised at the first advance, before normalize and before any child capture (04-X2);
   *read these: A,B* → the next instruction names exactly those two fetches, ground not completed,
   next advance completes (04-X3, 04-X4); *read all*; *none* and headless default → list only, hit
   keys not in `missingAsked` (04-X5).
5. `normalize.test.ts`: order and `missingAsked` before the branch (04-E1); list-only hit and
   unrecognized payload stay missing (04-E2); orphan dropped with notice (04-E3); args envelope
   (04-E4); not-captured first/second and both gate answers (04-E5); partial notice for investigate,
   plan and task (04-E6).
6. `conflict.test.ts`: source validation (04-K1); gate print options/default (04-K2); flag answer
   round trip and refused unknown option (04-K3); governing source on the new envelope, idempotent;
   *stop* → exit blocked (04-K4).
7. `policy.test.ts` with a synthetic `skill: review` route and the shipped investigate route:
   all three gates, review headless → exit blocked and no reviewer step; investigate → args envelope
   (04-P1); interactive ambiguous offers servers (04-P2).
8. `acs.test.ts` on three synthetic texts (explicit section, bullets only, prose with modals):
   tiers (04-A1); id format, `ARGS` key (04-A2); determinism, duplicate bullets, two keys (04-A3).
9. `report.test.ts` and CLI: both `Requirements` line forms and `; missing:` (04-R1); a scorer test
   over a synthetic args-envelope ledger shows `envelopeBuiltFrom: 'args'` and
   `noRouteMcpSpawns: null` (04-R2).
10. **S7** (owner 04 → final 08) on the synthetic review fixture route `review-requirements`
    (start → fetch → ground → `estimate` declared gate): two `--requirement`, one fully captured →
    ground refused `requirements-missing` naming the other, no `exit`, no reviewer step (04-E7);
    capture the second, `route next` → normalize complete → `estimate` printed (04-E8); `route stop`
    → separate exit; variants: a list-only hit for the second, and an unrecognized payload → still
    missing (04-E2).
11. **S8** mechanism (owners 03/04 → final 08) on the same fixture: bound server, no recognized
    capture over two advances → `requirements-not-captured-twice`, policy review:stop, no reviewer
    (04-E5, 04-P1); disconnected and ambiguous defaults; interactive ambiguous offers servers (04-P2).
12. F3 outcomes test passes with any new code documented.

Measurement (model-free, local): 04-H1. No paid item exists in this step.

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass.
- [ ] `npm run verify` is green; the report states the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff` of `routes/gates.yaml`, `routes/investigate.yaml`, `hooks/hooks.json`,
      `skills/*/SKILL.md`, `benchmarks/`, `evals/scripts/src/analysis/ledger-metrics.mjs` and the
      `hasRequirement` source is empty.
- [ ] 04-H1 medians (new and pre-change) are in the report; the 90 ms budget is met or the overrun is
      reported as a finding, not hidden.
- [ ] The report lists under *Decisions* the readings D2 (observed-name fallback), D10 (AC id
      stability for unchanged text) and the `acceptanceField` config reading, and states 04-H2.
- [ ] The report follows 05-working-rules §4.

## Hand-off to steps 06, 07, 08 and 09

- Step 06 (plan) consumes `envelope` and `splitAcs` unchanged: AC ids for the AC → section table
  and `plan check`'s unmapped count. It hand-labels the three epics' ACs (P23); it adds no splitter.
- Step 07 (task) consumes the same template and envelope; no new intake code.
- Step 08 (review) reruns S7 and S8 against the shipped review route with the fixture inputs of
  tests 10–11; the policy and the `requirements-missing` refusal are not re-implemented.
- Step 09 proposes and writes `requirements.acceptanceField` through init; the schema and default
  tests stay here.
- Every later step reads requirement evidence through `envelope` entries and `requirements/*.json`;
  none adds a capture path, binding rule or second AC splitter.

## Coverage of the v6 brief

| v6 step-04 requirement | Here |
|---|---|
| Prerequisites: 03 integrated and decision A *proceed*; $0; unrun eval is pending | Header, 04-H1 (local only) |
| Template per source: epic/children call and field list, JQL with field list, > 10 stop sentence, child reads cap 10, linked list only | 04-T1, 04-T2, D3 |
| Story/bug: issue, parent summary and links listed; Confluence page, child pages listed; mention not fetched | 04-T2 step 5, 04-T3, 04-T4, D4 |
| `requirements.acceptanceField` additive nullable; schema/default tests here, init in 09; absent → omit and say so; no CLI remote query | Contract (Config), 04-T5, Hand-off |
| Literal tool names when observed; else class + server prefix and "not observed"; no pretend catalog | 04-T6, D2 |
| Template ≤ 1.5 KiB; extend step 03's template and tests | 04-T8, Files |
| Expansion gate on early `route next`, before child reads; options; chosen keys printed as next fetch step; headless default none; hit count from captured `search*` | 04-X1 … 04-X5, D9 |
| Test: 12 hits → gate at first advance; *read these: A,B* → exactly two fetches | Test 4 |
| Binding: exact, else case-insensitive token; null + one → name and pin; several → ambiguous gate (default continue without) | 04-B1 … 04-B5, D5, D6 |
| Non-matching servers ignored with a route; no route → exit at once | 04-B2, 04-B6 |
| P53: no-route spawn count in `score` if the trace shows it, else `null` | 04-R2 |
| `search*` reduced to key + summary on disk; `get*` text after `NOT_THE_TICKET`; `fetch*`/`read*` body; requirement record fields | 04-C1 … 04-C3, Contract |
| Two P8 shapes from synthetic fixtures mirroring key paths only; test names mirrored paths | 04-C5, Non-goals |
| `requirements-derived-orphan` dropped with notice | 04-E3 |
| Extend step 03's normalize, same handler and port; `builtFrom`; asked = args URLs; not-captured / not-captured-twice (default continue without, args envelope) | 04-E1, 04-E4, 04-E5, D1, D11 |
| `--conflict --sources` → `requirements-conflicting`, source options + *stop* default; one gate id answer; acceptance; envelope records governing source | 04-K1 … 04-K4, D7, D8 |
| Three gates carry `policy: {review: stop}`; review exits blocked, investigate continues with args envelope; synthetic route via registry policy resolution | 04-P1, 04-P2, Test 7 |
| AC splitter tiers; `{id, key, quote, where}`; `AC-<key>-<nn>`; extend step 03's `acs` | 04-A1, 04-A2 |
| Same text → same ids; no hash ids; tests for determinism, duplicates, separate keys; insertion stability proposed separately | 04-A3, D10 |
| P23 stays signal; hand labels in step 06 | Non-goals, Hand-off |
| Report and `score` distinguish `captures` from `args`; sandbox always `args`; measurement README says so | 04-R1 … 04-R3 |
| Proofs: verify green; snapshot templates; > 10 sentence; expansion gate; binding cases; 53 KB → ≤ 2 KB; orphan; conflict round trip; ACs on three texts | Tests 1–8, Done when |
| Hook timing: no-route exit over 20 spawns ≤ 90 ms, re-measured | 04-H1 |
| Context budget statement: field lists the only lever; peak measured in steps 6–7 | 04-H2 |
| Do not fetch from the CLI; do not touch benchmark configs or read recording values; do not change `hasRequirement` or registry defaults; no collector; no hand-labelled ACs | Non-goals, Files (unchanged list) |
| Hand-off acceptance: six deliverables with tests; verify; timing reported; interpretations listed | Done when |
| missingAsked before captures/args; partial notice for investigate/plan/task; review refuses ground with `requirements-missing`, no exit or reviewer | 04-E1, 04-E6, 04-E7 |
| List-only hit is missing; second source + next → ground → estimate; explicit stop separate | 04-E2, 04-E8, Test 10 |
| Synthetic review fixture drives S7/S8 now; step 08 reuses it | Tests 10–11, Hand-off |
| No overbroad generic `onError` stop for S7 | 04-E7 |
| Report interpretations: acceptanceField, tool-catalog fallback; hash-AC interpretation removed; unchanged-text determinism | Done when, D2, D10 |
| Measurement status separate from implementation; unauthorized paid proof reported pending | Header (no paid item), 05-working-rules §4 |

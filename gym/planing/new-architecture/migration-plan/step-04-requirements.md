# Step 4 — Requirements complete: expansion with field lists, ACs, binding, `search*` capture, conflict gate

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: none needed — `confirmed`
> - Decision A outcome (step 3): `proceed` — this step is dispatched only on `proceed`

## Why this step exists

The real run showed the requirement procedure **cost** requirements: the naked model read three
child tickets, both plugin arms read only the epic (M11). v5 gets the whole requirement into
evidence by code from what the MCP tools returned (R1, R3), expanded one level with field lists
(R8), with acceptance criteria numbered so coverage can be counted (plan's AC coverage metric,
33 §4). Step 3 built the part investigate needs; this step completes the module for plan and task.
Design: [../v5/modules/14-requirements.md](../v5/modules/14-requirements.md) whole;
[../v5/41-migration.md](../v5/41-migration.md) step 4.

## Read first

1. `CLAUDE.md`.
2. `../v5/modules/14-requirements.md` whole; `../v5/32-artifacts.md` §4 (the `requirements-*` registry
   entries), §6 (captured requirement JSON); `../v5/modules/12-route.md` §3.3 (`--conflict`), §3.5;
   `../v5/skills/23-plan.md` steps 2–3 (how plan consumes ACs), `../v5/skills/24-task.md` step 1,
   `../v5/skills/25-review.md` step 2 (`policy: {review: stop}`); `../v5/01-goals-and-constraints.md`
   M11, R8, D17; `../v5/40-open-problems.md` P8, P23, P39, P53.
3. Code after step 3: `src/requirements/*` (`has-requirement.ts`, `template.ts`, `capture.ts`,
   `envelope.ts`, `acs.ts`, `normalize.ts`), `src/hook/run-hook.ts` (the MCP capture path),
   `src/route/gates.ts`, `routes/gates.yaml`, `src/contracts/requirements.ts`.
4. `gym/planing/investigation/archive/real-run-VS-6735-2026-10-02.md` §B1 and §4 (what the `*all`
   JQL did to context; which fields the real session used).

## Deliverables

### 1. Template with field lists and expansion (14 §2)

`requirements template` prints, for each asked source, the exact calls and fields:
- Epic / issue with children: `getJiraIssue KEY fields=summary,description,issuetype,parent,issuelinks,customfield_<acceptance>`
  then `searchJiraIssuesUsingJql "parent = KEY" fields=key,summary`, then the sentence **"if the JQL
  returned more than 10 hits, stop here and run `route next`"**, else `getJiraIssue` per child with
  the same field list (cap 10). Linked issues: list only.
- Story / bug: the issue; parent summary and links listed.
- Confluence page: the page; child pages listed.
- A key mentioned in a read text: nothing fetched; listed once as `mention`.
The `customfield_<acceptance>` id is a config value (`requirements.acceptanceField`, nullable; `init`
proposes it in step 9); absent → the field is omitted from the list and the template says so. The
tool names come from the bound server's actual tool list the model can see (14 §1) — the template
names the **class** (`get issue`, `search by JQL`) and the bound server; it does not hard-code one
vendor's tool names beyond the binding rule's tokens. ≤ 1.5 KB.

### 2. Expansion gate before the child reads (14 §2, #81)

On the early `route next` after a JQL with > 10 hits, ground raises `requirements-expansion-capped`
⏸ *read all / read these: {keys} / none* **before** any child is read, and prints the chosen keys as
the next fetch step. Headless default: *none* (list only). The hit count comes from the captured
`search*` payload (key + summary per hit on disk). Test: a synthetic capture with 12 hits → the gate
is raised at the first advance; *read these: A,B* → the next step names exactly those two fetches.

### 3. Binding rule and `search*` capture (14 §1, §3)

- Binding exactly as 14 §1: exact server-name match, else case-insensitive token match
  (`atlassian` ↔ `claude_ai_Atlassian_Rovo`); `mcpServer: null` and one match → the template names
  it and asks the model to tell the user to pin it; several → raised gate
  `requirements-server-ambiguous` (default *continue without*). Non-matching servers are ignored
  with a route active; no route → exit at once (P53 count is measured in 33 §7 — add the no-route
  spawn count to `score` if the trace shows the hook's spawns; otherwise report `null`).
- `search*` responses reduced to key + summary **on disk**; `get*` keeps the text fields after
  `NOT_THE_TICKET` stripping; `fetch*`/`read*` (Confluence) keep the body. `requirement {key, via,
  rawHash, bytes, relation, derivedFrom, capture}`.
- The two response shapes (P8): fixtures built synthetically with the key structure of the servers
  seen (`benchmarks/FE/*.jsonl` names them; read **only** the JSON key paths of those recordings,
  never copy values; say in the test which paths were mirrored).
- `requirements-derived-orphan`: a child whose `derivedFrom` chains to no asked key is dropped with a
  notice (not a gate).

### 4. Envelope and conflicts (14 §3, §5)

- `requirements normalize` complete: `builtFrom: captures|args`; asked sources are the URLs in the
  args; `requirements-not-captured` (first) / `requirements-not-captured-twice` gate (second; default
  *continue without*, args envelope).
- `route next --conflict "<summary>" --sources A,B` raises `requirements-conflicting` ⏸ "which
  source governs?" with the source ids as options and *stop* as the non-acting default; the answer is
  `--answer requirements-conflicting=<source>` (one gate id, #94); `acceptance {gate:
  requirements-conflicting, answer: <source>}`; the envelope records the governing source.
- `requirements-server-disconnected` with `policy: {review: stop}`: the registry entry already
  exists (step 3); test that a review route exits `blocked` on it while investigate continues with an
  args envelope (the review route file itself ships in step 8; test through the registry's policy
  resolution with a synthetic route).

### 5. Acceptance criteria (14 §4)

`requirements acs`: explicit AC / "Definition of done" sections by bullet or number; else bullets
and numbered items; else sentences ≥ 40 chars with a modal (`must|should|shall|will|needs to`).
`AC-<key>-<nn>`, stable for unchanged text (ids derived from a hash of the unit text, not the
position, so an inserted unit does not renumber the rest — report this as the implementation's
reading of "stable"). Output `{id, key, quote, where}`. P23: it is a signal; the plan eval uses
hand-labelled ACs (33 §4) — the hand-labelled ACs for the three epics are produced in step 6, not here.

### 6. Report and `score` labels (P39)

The report's Requirements line and `score`'s `envelope-builtFrom` field distinguish `captures` from
`args` in every output; a sandbox run is always `args` (D17) and the measurement README says so.

## Proofs

- `npm run verify` green. Tests: template text per source type (snapshot tests with synthetic
  keys), the > 10 early stop sentence present, expansion gate before child reads, binding rule
  cases (exact, token, none, several), `search*` reduction size (a 53 KB synthetic payload → ≤ 2 KB
  on disk), orphan drop, conflict gate round trip, ACs splitter on three synthetic texts (explicit
  section, bullets only, prose with modals) with stable ids under insertion.
- Hook timing: the MCP hook's no-route exit over 20 spawns ≤ 90 ms (re-measure after the capture
  code grew).
- Context budget statement: the template's field lists are the only lever on requirement text in
  context (30 §3). Nothing here can measure the peak; 33 §7 does in steps 6–7. Say so.

## Do not

- Do not fetch anything from the CLI; the session's MCP tools fetch, the hook keeps what came back.
- Do not touch `benchmarks/*/.ambicode/config.yaml` (D17); do not read recording **values**.
- Do not change `hasRequirement` (D17, step 3) or the registry defaults.
- Do not build the collector subagent (17 appendix; backlog).
- Do not hand-label ACs here (step 6 does, for the plan eval).

## Done when

The six deliverables exist with tests; `verify` is green; the no-route hook timing is reported; the
report lists the id-stability and template-vendor-neutrality readings under interpretations.

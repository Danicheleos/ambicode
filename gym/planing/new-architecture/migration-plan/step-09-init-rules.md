# Step 9 — init `--apply --set`, `doctor`, config v3 migration, ecosystem adapters; rules drafts / quotes / apply / revert

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: none needed — `confirmed`
> - Decision A outcome (step 3): `proceed`; decision 5-I outcome (step 5, codeindex default): `__________`

## Why this step exists

Today the model edits `config.yaml` and `.gitignore` itself, and rules go live without confirmation
(F7). v5: `init` produces a proposal, one gate with a non-acting default, the CLI writes the YAML on
acceptance, `doctor` proves every command starts; `rules` drafts packs with verbatim quotes, confirms
a disposition table, wires through the document API and can revert. `init` is also where the
ecosystem adapters (R16, D18) and the explicit search layers (D9) are written. Design:
[../v5/skills/20-init.md](../v5/skills/20-init.md), [../v5/skills/21-rules.md](../v5/skills/21-rules.md),
[../v5/modules/11-policy.md](../v5/modules/11-policy.md) §3–§4, [../v5/32-artifacts.md](../v5/32-artifacts.md) §5;
[../v5/41-migration.md](../v5/41-migration.md) step 9 and "Compatibility".

## Read first

1. `CLAUDE.md`.
2. `../v5/skills/20-init.md` and `21-rules.md` whole; `../v5/modules/11-policy.md` §3–§4, Failure
   modes; `../v5/modules/10-search.md` §1 (default layer lists `init` writes; adapter table), §4
   (the ignore line for `index/`); `../v5/32-artifacts.md` §1 (what `init --apply` gitignores), §5
   (config v3); `../v5/modules/15-guard.md` §1 (deny rows during init, step 1); `../v5/30-harness.md`
   §9; `../v5/01-goals-and-constraints.md` D8, D9, D18, R4, R16; `../v5/40-open-problems.md` P16, P57;
   `../v5/41-migration.md` "Compatibility".
3. Code: `src/config/{detect,init,load,defaults}.ts`, `src/contracts/config.ts` (`schemaVersion:
   z.literal(1)`, `SUPPORTED_SCHEMA_VERSION = 1`, `requirements.lsp`), `src/cli/commands/init.ts`,
   `src/cli/init-gitignore.test.ts`, `src/policy/{load,validate,resolve,provenance}.ts`,
   `src/cli/commands/policy-check.ts`, `skills/init/SKILL.md`, `skills/rules/SKILL.md` and
   `references/pack-format.md`, `fixtures/definitions.mjs` (the 20 fixtures `init` must pass on),
   `docs/policy-authoring.md`, `docs/rule-migration.md`.

## Deliverables

### 1. Config schema v3 and migration (32 §5; 41 Compatibility)

`schemaVersion: 3`. Code today knows only 1 (there is no 2 in code; the design's "1 and 2" refers
to design versions — load `1` with a notice, treat any `2` the same). New fields: `search.index:
none | codeindex`, `search.layers.{prompt, context}` (explicit, editable; `map` refuses unknown
names), `workers.approved: []`, `guard.askOutsideMap: false`, `review.onInvalid: void | drop`,
`projects[].commands.format: null | {argv}`, `requirements.acceptanceField` (step 4), each
project's `ecosystem` plus an `adapter` block the adapter table fills. **Removed**: `requirements.lsp`,
`task.lspPlugins`, `search.exactMaxFiles` — a file carrying them loads with a notice naming them
(D8). `init --apply` migrates 1 → 3 through the YAML document API (comments kept). `SUPPORTED_SCHEMA_VERSION`
becomes 3; `config-schema-too-new` message unchanged in shape.

### 2. Ecosystem adapter table (R16, D18; 10 §1, 20 step 1)

`src/config/ecosystems.ts`: per ecosystem (`typescript`, `python` today; the table is the only
place that may name one): declaration patterns for the harvest, source globs (`SHORTLIST_DEFAULTS`
move here), the `export` filter for TypeScript, i18n location if any, runner and formatter adapters
(`prettier` / `black` / `ruff format` detection → the `format` slot), index grammars. `init` detects
the ecosystem per project and writes the adapter name into config; `map`, `harvest`, `format` read
the table by name. An unknown ecosystem → "unknown ecosystem: shortlist and grep only" and the route
still runs (20 Open problems). A test greps `src/route/`, `routes/`, `src/code-intelligence/map.ts`
and every `routes/steps/*.md` for ecosystem names and fails on a hit outside the table.

### 3. `init --dry-run --json` proposal (20 step 1)

Projects with ecosystem adapter, commands, packs, rule sources, gitignore lines (incl.
`.ambicode/index/`, `metrics.jsonl`, `reviews/`, `task/`, legacy `notes/`), `format` tools, index
tooling on PATH or in `node_modules/.bin`, default `search.layers` (plus `index.find` / `index.relates`
appended when the proposed index is not `none` — default `none` unless decision 5-I says otherwise),
`requirements.acceptanceField` candidates. ≤ 6 KB. ⛔ `not-a-repository`; `config-unparsable` →
raised gate ⏸ *back up and regenerate* / *stop* (default stop).

### 4. `init-apply` gate and `init --apply --set` (20 steps 3–5) ⤵

One `AskUserQuestion`: *Apply as proposed* / *Adjust* / *Cancel*; MCP server if several; runner
mapping or null; `search.index`. *Adjust* → the proposal is re-printed with the human's free text
quoted and asked again as *Apply as adjusted*, so the written values are in `acceptance.answer`
(#96). Release *Cancel*; **default (headless, never-asked): write nothing**, print the proposal and
the exact `init --apply --set k=v…` line. `$A init --apply --set k=v…` is honoured only with an
`acceptance {gate: init-apply}` per 12 §3.4 (⛔ `init-unconfirmed` otherwise); writes YAML through the
document API, existing file → diff and missing slots only; `.gitignore` lines written **now, on
acceptance** (30 §9). Tail: `doctor`.

### 5. `doctor` (20 step 5)

`--version` or an empty selection per non-null command; `argv[0]` resolved; detached `index build`
if an adapter is set; a failing command is **reported, not nulled**. Table output; Stop hook (b) for
init: the table the model reads back equals the doctor's.

### 6. `routes/init.yaml`, `skills/init/SKILL.md` ≤ 1.5 KB

Steps per 20's table; `allowed-tools` **loses** `Write(.ambicode/config.yaml)` and
`Edit(.ambicode/config.yaml)` (the guard denies them during init, step 1). The body: purpose, the
fallback start line, how to present the proposal, the one gate. Measured acceptance: 100% of
non-null commands pass `doctor` on the 20 fixtures; 0 model edits of YAML or `.gitignore`; median
command-to-config under 60 s on the fixtures (measure with `node fixtures/materialize.mjs --all`).

### 7. Rules: drafts, quotes, duplicates, apply, revert (11 §4; 21)

- `rules discover [--json]`: rule-source candidates (`detectRuleSources` exists) + Confluence URLs →
  the requirements template (capture on read).
- Drafts under `.ambicode/policies/drafts/` (the only place `rules` may Write; `allowed-tools`
  narrows to `Write(.ambicode/policies/drafts/**)` and loses `Edit(.ambicode/config.yaml)`). Each
  draft rule carries `source.quote` (verbatim, ≥ 20 chars) and `source.location`; `PolicyRule`
  schema gains `source` (required for drafts, optional for built-ins — 11 "What changes").
- `policy check --drafts --project <id>` ⤵: schema, loader rules, glob counts, **quote verification**
  (`pack-quote-missing` when the quote is absent from the named local file; Confluence sources
  checked against the captured payload), **near-duplicate detection** against built-ins
  (`pack-duplicates-builtin`, edit distance with a threshold set so no built-in flags another — P16;
  print the threshold and the test that fixes it). Tail: `onFail: revise draft`, `draft` `repeat: 3`,
  then "not migrated: <reason>" per rule.
- `rules-table` gate: *Apply all* / *Apply with changes* / *Discard drafts*; release *Discard*;
  **default: do not apply** (drafts stay).
- `rules apply [--project]` ⤵: drafts → live, `policyFiles` wired via the document API, one covered
  and one uncovered probe per pack (`policy` resolution on a matching and a non-matching path);
  ⛔ `rules-apply-unconfirmed` without an honoured acceptance. `rules revert <pack-id>`: unwire and
  move the pack back to drafts, one command.
- `routes/rules.yaml` per 21's table (`sources` gate: default the files named in args, else `exit
  human`); `skills/rules/SKILL.md` ≤ 2.5 KB; `pack-format.md` stays as a named reference.
- Measured acceptance (21): 0 `pack-glob-matches-nothing` after apply; 0 near-duplicates; 100%
  quotes verified; **0 packs live before the gate** (fixture with a declining fake human); source
  rule count equals table rows; the `revise draft` loop stops at 3 writes with a permanently bad quote.

### 8. Docs

`docs/policy-authoring.md` and `docs/rule-migration.md` updated for drafts/quotes/apply/revert;
`docs/installation.md` for `init --apply --set` and config v3; `outcomes.md` for every new code
(`init-unconfirmed`, `rules-apply-unconfirmed`, `pack-quote-missing`, `pack-duplicates-builtin`,
`search-layer-unknown`, `search-layers-not-for-model`, `config-unparsable` gate).

## Proofs

- `npm run verify` green; the gates table test covers `init-apply`, `config-unparsable`, `sources`,
  `rules-table`, and the `revise draft` bound.
- `node fixtures/materialize.mjs --all <dir>`: for each of the 20 fixtures, `init --dry-run --json`
  then a synthetic acceptance then `init --apply` → `doctor` 100% pass on non-null commands; the
  guard denies a `Write` to `config.yaml` while the init route is active (ledger shows the
  `active-route`); median wall time reported.
- Migration: a v1 config fixture with `requirements.lsp` → loads with the notice; `init --apply`
  writes v3 with comments kept (diff shown).
- Rules on `ts-feature-boundary` with a synthetic `CONTRIBUTING.md`: discover → drafts written by
  test code with one bad quote → `policy check --drafts` fails it → corrected → table → synthetic
  *Apply all* → live, probes pass → `rules revert` → back to drafts.

## Do not

- Do not let the model write `config.yaml`, `.gitignore` or live packs; the CLI does, on record.
- Do not propose `codeindex` by default unless decision 5-I said so.
- Do not keep `requirements.lsp` / `task.lspPlugins` as live fields (D8); do not consult
  `claude plugin list` (P24 closed).
- Do not name an ecosystem outside `src/config/ecosystems.ts` (R16).
- Do not change the resolver (`resolve.ts`): "no measured defect" (02 §6).

## Done when

Deliverables 1–8 are built and tested; the 20-fixture run, the migration diff and the rules
walk-through are shown; `verify` is green.

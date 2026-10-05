# Step 03b — Decision A tuning: answer is the note, smaller start, cleaner map

> Prerequisites: step 03 integrated (`ef7ab1f`) and its run 4 measured. This is the fallback that
> 03-A6 requires to have its own step file. Spend: $0 except 03b-V3, which needs named
> authorization and a ceiling. Read [05-working-rules.md](05-working-rules.md) first.
> Normative sources: [step 03](step-03-route-engine-investigate.md) (Contract, 03-I, 03-K, 03-A);
> [v6/22](../v6/skills/22-investigate.md); [v6/12](../v6/modules/12-route.md) §3.1, §8;
> [v6/10](../v6/modules/10-search.md) §1, §2; [v6/33](../v6/33-measurement.md) §1, §2.
> Owner of: the investigate route shape and texts, the `answer: note` step field, the Stop hook's
> note save, the route-side map text and term hygiene, the session contract text, the localize
> harness fixes. No other route changes here.

## Goal

Bring investigate under the 03-A5 cost limit (≤ 1.15x of the cached naked arm) without losing
recall. Remove the ceremony path (the final answer becomes the note), cut the context delivered
before the first model call, and stop the map from being built from request boilerplate.

## Starting point

Recheck at dispatch.

- Run 4 (2026-10-05, 10 localize cases × 1 plugin run): cost 1.44x (FAIL), recall Δ +0.068 against a
  band of 0.068 (PASS). Runs that answered at `read` cost 1.11x; runs that walked
  `route next → write → note save → answer` cost 1.63x. The call-1 context was 3.9–6.7k tokens
  larger than naked's; a fit over 9 runs gives ≈ 2.29k fixed + 0.40 tok/B of the read step + 0.32
  tok/B of the prompt. 14 of 178 map candidates were true files.
- `routes/investigate.yaml`: template, fetch, ground, scope, read, report-step, write.
- `src/route/engine.ts`: `endingCommand`/`producerHint` (:159-171), `runCode` payload save (:246),
  `runModel` header and "Not done yet" (:292-329).
- `src/route/dsl.ts`, `src/route/routes.ts` (`validateRoute` :195-236, instruction cap 1,500).
- `src/hook/events/stop-check.ts` (`problemsOf` :71-82, conditions :121-135, one block :143,
  `ended-route` clearing :161). `src/task/notes.ts` `saveNote` (:116; `NoteDeps.ledger?`).
  `src/task/ledger-lock.ts` refuses a nested lock (:49-52). `src/task/navigation-line.ts`.
- `src/route/handlers-modules.ts` (`renderSources`, `requirements.acs`, `search.map`,
  `policy.stage`). `src/code-intelligence/map.ts` (`rankTerms` :55-75, pass 2 :156-157, text
  :194-205). `src/code-intelligence/locate.ts` (`tokenize`, `STOPWORDS` :515-525).
  `src/requirements/envelope.ts` (`askedKeys`, `normalizeEnvelope` :113-154).
- `src/hook/events/run-hook.ts` `deliverSharedContract` (:139-170); `prompts/shared-operating-contract.md`
  (2,275 B, also used by the reviewer prompt and `prepare`).
- `evals/scripts/src/analysis/trace-analysis.mjs` `harvestTraces` (:161-204);
  `evals/scripts/src/cases/bench-cases.mjs` `graderFiles` (:150-207);
  `evals/scripts/src/validation/eval-gate.mjs`.
- Built-in plugin loading (`cc-plugin-sec-default`) is decided by Claude Code; nothing in this
  repository controls it. In run 4 it loaded in the plugin arm only.

## Files

| File | Change | Budget |
|---|---|---|
| `routes/investigate.yaml` | rewrite: template, fetch, ground, scope, read | ≤ 45 lines |
| `routes/steps/investigate-read.md` | rewrite | ≤ 700 chars |
| `routes/steps/investigate-write.md` | delete | — |
| `skills/investigate/SKILL.md` | rewrite | ≤ 900 B |
| `src/route/dsl.ts`, `src/route/routes.ts` | `answer` field and its validation | ±30 |
| `src/route/engine.ts` | ending text for `answer: note`; empty payload save; header de-duplication | ±30 |
| `src/hook/events/stop-check.ts` | report-shaped answer, note save, advance, basename resolution | ±90 |
| `src/route/handlers-modules.ts` | args-only envelope/acs, compact map text, empty policy pointer | ±40 |
| `src/code-intelligence/map.ts` | term hygiene, pass 2, `candidatePaths`, `leadsText` | ±80 |
| `src/task/kinds.ts` | optional `candidatePaths` on `map` | ±3 |
| `src/requirements/envelope.ts` | prose URLs are not missing requirements when no fetch is asked | ±10 |
| `src/hook/events/run-hook.ts`, `src/policy/shared-contract.ts`, `prompts/session-contract.md` (new) | session contract | ±25, ≤ 1,024 B |
| `evals/scripts/src/analysis/trace-analysis.mjs` | session transcript harvest, missing-trace warning | ±30 |
| `evals/scripts/src/validation/eval-gate.mjs` | built-in plugin info and warning | ±30 |
| `evals/scripts/src/cases/bench-cases.mjs` | localize `--prompt with` graders | ±15 |
| tests named in Tests | change / add | — |

## Contract

```ts
// src/route/routes.ts — StepDef gains one optional field
interface StepDef { /* … step 03 fields … */ answer: 'note' | null }

// ledger `map` entry — one optional field
{ kind: 'map', /* … step 03 fields … */ candidatePaths?: string[] }   // top ≤ 20, in rank order
```

Route YAML: `answer: note` on a `model` step. Validation error (existing code `route-invalid`):
`answer: note needs produces note{<kind>}` / `answer is for model steps only`.

`prompts/session-contract.md`: delivered by `SessionStart` (and `UserPromptSubmit` after a new
epoch) under the reference `builtin/prompts/session-contract.md`. `shared-operating-contract.md`
is unchanged and stays the reviewer's and `prepare`'s contract.

No new error codes, CLI options or ledger kinds.

## Rules

**N — the answer is the note**
- 03b-N1 A model step with `answer: note` must produce exactly one `note{<kind>}`; any other actor
  or a missing produce is `route-invalid`.
- 03b-N2 Its header `Then:` reads `answer the user; your answer is saved as the <kind> note when
  you stop`. No `note save` or `route next` command is printed for it, and `route next` at that
  position re-delivers it without a "Not done yet" prefix or a `repeated` entry.
- 03b-N3 `routes/investigate.yaml`: steps template, fetch, ground, scope (unchanged), then `read`
  with `produces: ["note{investigation}"]` and `answer: note`. `report-step` and `write` are
  removed, as is `routes/steps/investigate-write.md`.
- 03b-N4 Stop, main thread, active route at an `answer: note` step, last assistant text read:
  the text is **report-shaped** when it cites at least one existing repository path (with or
  without a line). A text that is not report-shaped allows and writes nothing.
- 03b-N5 A report-shaped text first goes through `problemsOf`, citations only (an investigation
  runs no checks and records no acceptance, so "tests pass" and "accepted" are not claims here); a
  range is checked by its first line.
  With problems and no `stop-block` in the chain, Stop blocks once (unchanged 03-K behaviour) and
  saves nothing.
- 03b-N6 Otherwise Stop saves the note: `saveNote` with a runtime rooted at the repository,
  `session` = the route head's owner (`head.session`, not the Claude session id), `context: null`,
  body = the answer plus a blank line and `navigationLine` of the chain, `route` = the head id.
  The ledger lock is released before Stop calls `engine.advance({task, session: owner, cause:
  'note save'})`; the route completes and exits `done` when nothing is unverified.
- 03b-N7 After 03b-N6, the `ended-route` written by that completion is removed in the same Stop,
  so the next Stop does not re-check the route.
- 03b-N8 `problemsOf`: a cited relative path missing at the repository root is looked up as a path
  suffix in `git ls-files` (a bare name, or a path relative to a feature directory). One match:
  checked against that file. Several: not reported. None: "does not exist".
- 03b-N9 `routes/steps/investigate-read.md`: read the map's leads and the code; use the map as
  leads and skip candidates that do not fit; cite `path:line` for each claim; keep facts apart
  from assumptions; answer in the shape asked (03b-N13). No `find`/`refs` line.
- 03b-N10 `skills/investigate/SKILL.md`: what investigate is, the read-only boundary with its
  reason, "your answer is saved as the investigation note", and the fallback line
  `route start investigate "$ARGUMENTS"`. No judgment list (it lives in the read step).
  Removing `"$ARGUMENTS"` would not shorten the context: Claude Code appends `ARGUMENTS: …` when
  the placeholder is absent.
- 03b-N11 When 03b-N5 blocks an `answer: note` step, the answer is kept in the task directory as
  `answer-blocked.md` beside `stop-check.md`. The reason depends on the route head's `mode`:
  interactive: ask the user with AskUserQuestion whether to keep the answer or rewrite it, and on
  rewrite write the whole answer again (it replaces the previous one); headless: write the whole
  answer again with the citations fixed.
- 03b-N12 On a later stop after that block, with no note saved: a report-shaped text is saved as
  in 03b-N6; otherwise (the user kept the answer, or the model sent path-less corrections) the
  note is `answer-blocked.md` + `## Citation problems` (the stop-check list) + the last message,
  saved and advanced as in 03b-N6. A conversational stop with no block before it still saves
  nothing (03b-N4).
- 03b-N13 The read step's last judgment line asks for a complete files answer: every existing file
  the change touches, its tests, types and schemas included.

**C — context before the first call**
- 03b-C1 `requirements.normalize` and `requirements.acs` return an empty payload when every
  envelope source has relation `args` and there are no notices. The `envelope` ledger entry is
  unchanged.
- 03b-C2 A code step whose handler returns a null payload saves an empty payload file, so a payload
  from an earlier run of the step in the same chain is not delivered.
- 03b-C3 A model step's body omits the instruction's first non-empty line when the header's `Now:`
  already carries it.
- 03b-C4 `policy.stage` returns an empty payload when the stage has no prompt text and no rules
  (only the omitted count); the `policy` ledger entry is unchanged.
- 03b-C5 The hook delivers `prompts/session-contract.md` (≤ 1,024 B: evidence, untrusted content,
  scope, the policy labels) with the one line `AMBICODE operating contract (<reference>, <hash>). It governs every
  AMBICODE skill in this session.` The `prepare … --with-contract` sentences are removed from the
  hook text.

**M — map**
- 03b-M1 Before terms are mined, URLs, host names, UUIDs, `__`-prefixed attribute names and
  markup tags are removed from the source text. Quoted or backticked strings that are markdown
  headings (`#…`), shell commands (`cd …`, `git …`, `npm …`) or a bare directory (`x/`) are not
  terms.
- 03b-M2 `rankTerms` drops the request words: repo, repository, file, files, change, changes,
  implement, implemented, below, above, touch, section, answer, question, anything. The shared
  `STOPWORDS` of `locate.ts` (used by `prepare`) is unchanged.
- 03b-M3 Pass 2 keeps the first 6 pass-1 terms, then up to 6 harvested names, then the rest of
  pass 1, capped at 12.
- 03b-M4 The route's map payload is one line of terms and the top 8 candidates as
  `N. <path> — <first reason>`, ≤ 1,200 B. The CLI `map` text is unchanged.
- 03b-M5 No further gate: the map is delivered whenever it has candidates, and `map.empty` keeps
  its meaning (see Decided readings).
- 03b-M6 The ledger `map` entry records `candidatePaths` (top ≤ 20).
- 03b-M7 With `--headless` or `hasRequirement` false, `missingAsked` holds only explicit
  `--requirement` sources; a URL in the prose is not a missing requirement.

**H — harness**
- 03b-H1 `harvestTraces` copies `e-<id>/config/projects/*/*.jsonl` to
  `<traces>/sessions/e-<id>/` beside the trace copy.
- 03b-H2 After a run, each run the result names without a harvested trace is listed on stderr.
- 03b-H3 `eval-gate` prints, per arm, the built-in plugins and skills from each trace's `init`
  event, and a warning line when the arms' sets differ. It decides nothing.
- 03b-H4 Localize cases served with `--prompt with` carry no `helper-ran` and no `plugin-fired`
  grader; the llm, no-edit and no-peek graders stay.

**V — verification**
- 03b-V1 Offline ($0), on the run-4 cases through the rebuilt bundle: read step ≤ 3,000 B and
  inline; no term from 03b-M1/M2's classes; true files in the top 8 reported against run 4; the
  number of empty maps does not rise.
- 03b-V2 Offline ($0): the 9 traced run-4 final answers replayed through Stop against fixture
  ledgers give no false citation problem, save a note and complete the route.
- 03b-V3 Paid, only with named authorization and a ceiling: 10 localize cases × 3 plugin runs with
  `--prompt with`, gated by the 03-A3 command plus `--min-runs 3`. 03-A5 applies unchanged.

## Decided readings

- The answer is the note (user decision, 2026-10-05). This replaces 03-I1's `report-step`/`write`,
  03-I2's write text, and v6/22's ceremony budget: 0 ceremony calls on the no-requirement path,
  1 (`route next` after fetch) with a requirement. The Before-report policy stage and the report
  shape headings are not delivered for investigate.
- 03-K1 (c) gains a writer: Stop saves the note. Stop still blocks at most once per route; a
  blocked answer is saved on the next stop with its problems recorded.
- The map stays, cleaned and gated (user decision). The gate proposed at planning (omit the map
  below 2 identifier-shaped terms) is not built: on the run-4 cases it would have removed the true
  leads of 3 of 10 cases, whose terms are plain words. Cleaning alone moved true files in the top 8
  from 14 of 178 candidates (run 4, all candidates) to 14 in the top 8 and 20 in the top 20.
- The CLI `map` text and `prepare` are unchanged; `buildMap`'s pass-2 rule (03b-M3) applies to the
  CLI `map` command too.
- `$ARGUMENTS` stays in the skill's fallback line: 03-I3 pins it. Whether it doubles the request
  in the first message is inferred, not seen; the 03b-H1 transcripts decide whether a later step
  changes it.
- Built-in plugins cannot be equalized from the repository; the gate reports them (03b-H3). The
  cached naked baseline stays the reference.
- The v6 design files are not edited; this brief and the CHANGELOG record the deviations.

## Non-goals (a reviewer may not raise these)

- Changing plan, task, review, init or rules skills or routes.
- Changing the reviewer prompt or `prepare`'s contract reference.
- An index or LSP layer for the map; re-ranking beyond 03b-M1…M5.
- Shortening the descriptions of model-invocable skills.
- Re-running the naked baseline.
- Removing the `find`/`refs` commands from the CLI.

## Tests

- `src/route/routes.test.ts`: 03b-N1 valid and invalid `answer`.
- `src/route/investigate.route.test.ts`: 03b-N2 ending text and re-delivery; 03b-N3 the step list
  and the walks (one model step, two with a requirement); existing 03-I1 scope and boilerplate
  tests kept.
- `src/hook/events/stop-check.test.ts`: 03b-N4 conversational stop; 03b-N5 block then save;
  03b-N6 note entry, owner session, `exit done`; 03b-N7 no second check; 03b-N8 basename one,
  many, none.
- `src/route/owner-session.test.ts`: the 74-95 walk moves to the Stop save.
- `src/util/skill-content.test.ts`, `src/cli/context-cost.test.ts`: 03b-N9, 03b-N10 pins and caps.
- `src/hook/events/stop-check.test.ts`: 03b-N11 interactive and headless reasons, `answer-blocked.md`;
  03b-N12 corrections-only stop saves the blocked answer with its problems. `skill-content.test.ts`: 03b-N13.
- `evals/scripts/src/analysis/ledger-metrics.test.mjs`: `ledgersOf` over several trace directories.
- `src/route/investigate.route.test.ts`: 03b-C1, 03b-C2, 03b-C3, 03b-C4.
- `src/code-intelligence/search.test.ts`: 03b-M1, 03b-M2, 03b-M3, 03b-M4, 03b-M6.
- `src/requirements/requirements.test.ts`: 03b-M7.
- `src/hook/events/run-hook.test.ts`: 03b-C5.
- `evals/scripts/src/analysis/trace-analysis.test.mjs`: 03b-H1, 03b-H2;
  `validation/eval-gate.test.mjs`: 03b-H3; `cases/bench-cases.test.mjs`: 03b-H4.

## Done when

- [ ] Every rule above has a named test, except 03b-V1…V3, which are reported.
- [ ] `npm run verify` exits 0; the bundle is rebuilt.
- [ ] 03b-V1 and 03b-V2 results are in the report.
- [ ] Case graders regenerated with `evals-bench.mjs select` ($0).
- [ ] The report lists file sizes against the budgets and every out-of-list change.
- [ ] 03b-V3 is run only after authorization; until then the step is reported partial.

## Hand-off

Decision A is taken again on 03b-V3. Steps 04–09 receive the `answer` field (available to any
route, used only by investigate), the session contract, and the term hygiene in `rankTerms`. Steps
06 and 07 do not rebuild them.

## Coverage of the v6 brief

| v6/22 or step 03 item | Here |
|---|---|
| "What the model loads": `SKILL.md` ≤ 2 KB, judgment, boundary, fallback | 03b-N10 (judgment moved to the read step, 03b-N9) |
| Route rows 1–3a (start, fetch, ground, scope) | unchanged; 03b-C1, 03b-C4, 03b-M1…M7 change their payloads only |
| Route row 4 (`read`, ≥ 2 hypotheses, `find`/`refs`) | 03b-N9 (decided reading: leads, not a checklist; no `find`/`refs` line) |
| Route rows 5–6 (report step, write, `note save`) | replaced by 03b-N3, 03b-N6 (decided reading) |
| Route row 7 (Stop checks the note's citations) | 03b-N5, 03b-N8 |
| Ceremony budget 2 / 3 | decided reading: 0 / 1 |
| Context budget cap 16 KB, expected 6–8 KB | 03b-V1 (read step ≤ 3,000 B) |
| Measured acceptance (recall within band, cost ≤ 1.15x) | 03b-V3 with 03-A3, 03-A5 unchanged |
| 03-K1 … 03-K7 | kept; 03b-N4 … 03b-N8 extend K1 (c) |

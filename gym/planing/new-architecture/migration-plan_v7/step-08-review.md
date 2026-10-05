# Step 08 — Review route: estimate gate, index dependents, missing-source stop, `review-run` re-entry, verbatim coverage, selection metrics, review prompts, live reviewer tier

> Prerequisites: step 07 integrated (with 00–06 and 09 before it); decision 0-R and the
> P37(b)/P58 probe report attached. Spend: $0 unless the dispatch names a paid item with its
> ceiling. Read [05-working-rules.md](05-working-rules.md) first; it governs this brief, the review
> and the report. An unrun eval is "measurement pending"; finish all model-free work.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §3, §5,
> §7, §8; [02-scenarios](02-scenarios.md) S7, S8, S12, S14 and the full gate table;
> [v6/25](../v6/skills/25-review.md) whole (incl. "The D2 trade, stated");
> [v6/16](../v6/modules/16-checks-review.md) §1, §4–§8; [v6/32](../v6/32-artifacts.md) §1, §3, §4, §8;
> [v6/12](../v6/modules/12-route.md) §3.1, §3.5; [v6/33](../v6/33-measurement.md) §0.7, §6;
> [v6/41](../v6/41-migration.md) step 8, "Deleted" and "Kept"; [v6/31](../v6/31-cli.md) (the audit);
> [v6/40](../v6/40-open-problems.md) P19, P20, P29, P51.

## Goal

Ship `routes/review.yaml`: one target, requirements fetched and normalized when asked for, a dry
estimate printed as the gate `estimate` (default *skip*, non-acting), the reviewer run only on an
honoured *run*, waiting checks re-entered as route steps, the "not covered" block read back verbatim
and checked by the Stop hook, and selection metrics recorded by the page. The review pipeline and
the Kept files stay byte-for-byte. Also: the eight review with-prompts, the trigger-suite flip, the
final CLI audit and integrated scenario run, and the live reviewer tier (built; run only on a named go).

## Starting point

Recheck these at dispatch. Steps 03–07 and 09 run before this one; their symbols below are named as
their v6 step files, 01-contracts and 00-README's ownership table name them. Where the integrated
code uses another name, use the actual one and list the mapping in the report.

Existing code (inspected at `9ede018`):

- `src/review/bundle.ts` (602 lines): `assembleBundle(options)` and `writeBundleArtifacts`. Context
  enters the bundle as `named = contextPaths.map(p => ({path, reasons: ['named with --context']}))`,
  then `findDependents` adds name-search dependents (deduplicated). `src/review/prompt.ts:356`
  prints each dependent as `- <path> — <reasons joined by '; '>`.
- `src/code-intelligence/dependents.ts`: `findDependents({git, projects, files})` →
  `{terms, dependents: {path, reasons}[], limitations}`, capped at `MAX_DEPENDENTS = 8`.
- `src/review/validate.ts` (233 lines): `validateFindings(options)` →
  `{kind:'ok', findings} | {kind:'invalid', reason, rejections}`. One bad finding voids the result.
- `src/cli/commands/review.ts` (294 lines): `runReview`, `renderReview` (calls `renderReport`).
  `src/cli/target-option.ts`: `TARGET_OPTIONS` (values `base, mr, evidence, task`; repeated
  `requirement, approve, decline, exclude, only, context`; flags `json, branch, with-tests`) and
  `validateTargetArgs` (raises `conflicting-target`, `baseline-not-applicable`).
- `src/review/report.ts` (Kept): `renderReport`; the fourth part starts with the line
  `4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE` and is built from `result.coverage`,
  `result.omissions` and `result.reviewer.rejections` only.
- `src/snapshot/limits.ts` (Kept): `partitionChange`, `measureInput`, `enforceReviewInputLimits`
  (`input-too-large`). `src/snapshot/snapshot.ts` (Kept): `planSnapshot` (checks the limits before
  anything is written; `snapshot-too-large`), `writeSnapshot`.
- `src/contracts/review.ts`: `ReviewResult` is a `z.strictObject` with `reviewId`, `createdAt`,
  `reviewer: ReviewerRun | null` (`durationMs`, `usage.costUsd`), `findings` (each with `id`,
  `ruleRefs`), `omissions`, `status: complete|partial|blocked|error`, `statusReason`.
  `src/config/defaults.ts`: `REVIEWS_DIR = '.ambicode/reviews'`, `REVIEWS_LEAF = 'reviews'`.
- `src/page/server.ts` (645 lines): the submit handler calls `options.store.recordSubmission(record,
  submission)`; `options.store.directory` is the review directory. `src/page/view-model.ts`:
  `buildPageModel`, `FindingCard.publishable`. `src/publication/store.ts` (Kept): `RESULT_FILE`.
- `src/review/replay-reviewer.ts`: `EVAL_AMBICODE_REVIEWER_REPLAY`; `fixtures/reviewer-recordings.json`
  holds six recordings keyed by `snapshotId` (one is `regression-ts`); a miss raises `replay-miss`.
- `fixtures/definitions.mjs`: `ts-source-regression` is an **uncommitted** change on a committed base.
- `skills/review/SKILL.md`: 5,896 bytes, model-invocable, names `references/impact.md` (step 3).
  `src/util/skill-content.test.ts:351` asserts `impact.md` content; `src/cli/context-cost.test.ts`
  caps `review/SKILL.md` at 6,500 bytes.
- `evals/scripts/src/harness/prompt-transport.mjs`: `writePluginPrompt(caseDir, command)`,
  `pluginPrompt(source, command)` (types the command before the first non-blank body line, same
  line; every other byte kept), `INVESTIGATE_COMMAND`. `evals/scripts/src/cases/bench-cases.mjs`:
  `writeCase` calls `writePluginPrompt` for localize cases only; review cases get `prompt.md` and
  `reviewScaffoldFile(...)` (commit the base, then `git apply` the change, left uncommitted).
  `evals/scripts/src/harness/evals-bench.mjs` records `promptMarkdown` (naked body) and
  `pluginPromptMarkdown` (served body); `run --dry-run --prompt with` exists.
- `evals/evals-triggers/`: review-positive cases (a `review-fired.md` grader with `min: 1`):
  `collide-code-review`, `collide-verify`, `review-bench-shape`, `review-check-push`, `review-mr`,
  `review-vs-ticket`, `url-review`, `verb-review` (also `helper-ran.md`, `skill-before-helper.md`);
  diagnostic `url-bare` has `fired-review.md` and `any-skill-fired.md`. `neg-http/graders/no-skill-fired.md`
  and `unrelated-question/graders/no-helper.md` are the negative grader shapes.

From earlier steps (consume; do not rebuild):

- Step 03: `src/route/{engine,fold,routes,gates,flags,consent,context,command-tail}.ts`; the route
  DSL of v6/32 §3 with the fixed `when` vocabulary (`args.hasRequirement`, `gate.<id>.is(<option>)`);
  `routes/gates.yaml` complete, with `policy: {review: stop}` on `requirements-server-disconnected`,
  `requirements-server-ambiguous` and `requirements-not-captured-twice`; `RouteContextPort.consent`;
  the command tail (`review` is one of its evidence-writing commands); the gate-table test that
  iterates every route file and registry entry; the prompt-launch hook (channel `hook`); the Stop
  hook's report-shaped check (b) in `src/hook/events/stop-check.ts` (03 D17); the `HandlerRegistry`
  in `src/route/handlers.ts`; the config v3 reader (`search.index`, `review.onInvalid: void |
  drop`); the ceremony counter used for investigate. Step 03's `route start` syntax, `StartInput` and
  `RouteArgs` carry no review target (`--branch`, `--base`, `--mr`); this step adds it (08-R2,
  D12). Step 03's `HandlerInput.revise` carries a re-entry's `$answer` (03-F12).
- Step 04: complete `requirements template/normalize` with `asked`/`missingAsked`, the
  `requirements-missing` refusal of `ground` (no completion, no exit), list-only and unrecognised
  payload handling, and the synthetic review fixtures for S7 and S8.
- Step 05: `IndexAdapter` (`none` | `codeindex`) through `indexAdapterFor(deps, project)`, with
  `relates(path)` and `status(project)`; `declarationCensus(git, project, names)`, the project-wide
  declaration census that sets `collides` for `refs` (this brief calls it "the census").
- Step 06: `src/workers/process-runner.ts` (the reviewer invocation runs through it unchanged) and
  `worker run`.
- Step 07: `check --only` with the `--approve` consent rule; the baseline-scoped `review --task`;
  the first `review --estimate` seam: `src/review/estimate.ts` with `estimateReview(runtime,
  options: AssembleOptions)`, `renderEstimate(estimate)` and the `ReviewEstimate` shape of this
  brief's Contract, with `history` null and `refusal.suggestions` empty; the `review.evaluate`
  handler of task's `review-run` code step, which evaluates a model-run `review` result and raises
  `check-only-unauthorized` per waiting key through `raiseGate` (03-G13); `review --task --approve`
  honoured only through consent inside a route (07-K5), with one consent check and one `declined`
  writer (07-K2 … 07-K4).
- Step 09: the gate question-text seam in `src/route/gates.ts` (09-G2's `Values:` line uses it).
- Step 09: `init --apply` writes `.ambicode/metrics.jsonl` into `.gitignore`; `doctor`.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). As a guide, tests for this step
should total about 1,400 lines.

| File | Action | Budget | Purpose |
|---|---|---|---|
| `routes/review.yaml` | create | 70 | the route (08-R1) |
| `routes/steps/review-fetch.md`, `review-readback.md`, `review-view.md` | create | ≤ 1,500 chars each | model step texts |
| `src/review/estimate.ts` (step 07's estimator) | change | +140 | history, snapshot bytes, size refusals with suggestions, narrowing (08-E1 … 08-E6) |
| `src/review/route-handlers.ts` | create | 120 | `review.estimate` handler for `estimate-step`; on the review route, step 07's `review.evaluate` with its waiting branch only (no `scope`/`fix` steps here); start-tail ignore check |
| `src/route/handlers.ts` | change | +5 | register `review.estimate` |
| `src/route/engine.ts`, `src/cli/commands/route.ts` | change | +30 | `route start review --branch [--base <ref>] \| --mr <url>` → `StartInput.target` → `RouteArgs.target`, validated with `validateTargetArgs`, part of `hash` when present (08-R2, D12) |
| `src/hook/events/prompt-launch.ts` | change | ±5 | only if its argument tokenizer is not the one `route start` uses: pass the same target flags (08-R2) |
| `src/route/gates.ts` | change | +5 | register the `estimate` gate's `renderEstimate()` text on step 09's question-text seam |
| `src/review/coverage-block.ts` | create | 40 | `notCoveredBlock`, `normalizeBlock` (08-C2) |
| `src/hook/events/stop-check.ts` (step 03's Stop module, 03 D17) | change | +40 | the review verbatim check (08-C3) |
| `src/review/bundle.ts` | change | ±50 | index dependents and "verify import" reasons (08-D1 … 08-D4) |
| `src/review/validate.ts` | change | +35 | `onInvalid: 'drop'` branch (08-V1 … 08-V3) |
| `src/cli/commands/review.ts` | change | +60 | `--estimate` dispatch, `partial` mapping, `--approve` without `--task` through step 07's consent check and `declined` writer (07-K2 … 07-K4) |
| `src/cli/target-option.ts` | change | +2 | the `estimate` flag |
| `src/cli/main.ts` | change | ±5 | USAGE line for `review --estimate` |
| `src/contracts/review.ts` | change | +15 | optional `selection` on `ReviewResult` (D9) |
| `src/page/selection-metrics.ts` | create | 80 | per-finding selection rows (08-M1 … 08-M4) |
| `src/page/server.ts` | change | +15 | call it after `recordSubmission` |
| `skills/review/SKILL.md` | rewrite | ≤ 2,048 bytes | 08-K1 … 08-K3 |
| `skills/review/references/impact.md` | delete | — | v6/41 "Deleted" |
| `skills/review/references/outcomes.md` | change | — | only if a new code is raised |
| `evals/scripts/src/harness/prompt-transport.mjs` | change | +2 | `REVIEW_COMMAND` |
| `evals/scripts/src/cases/bench-cases.mjs` | change | +2 | review cases call `writePluginPrompt` |
| `evals/scripts/src/analysis/selection-metrics.mjs` | create | 60 | accepted rate per repository (08-M5) |
| `evals/scripts/src/harness/live-review.mjs` | create | 220 | the live tier runner, 0-R branch (ii) only (08-L2) |
| `evals/evals-triggers/<9 cases>/graders/*`, `evals/evals-triggers/README.md` | change | — | 08-T1, 08-T2 |
| `evals/evals-core/README.md` | change | +30 | live tier section (08-L6) |

Test files that change by name: `src/util/skill-content.test.ts` (the `impact.md` assertion is
removed with the file; this is a named behaviour change), `src/cli/context-cost.test.ts`
(`review/SKILL.md` cap lowered from 6,500 to 2,048), new `src/cli/cli-surface.test.ts` (08-I1).

Unchanged in this step, byte-for-byte against the dispatch baseline: `src/review/prompt.ts`,
`src/review/report.ts`, `src/snapshot/*`, `src/providers/*`, `src/publication/*`, `policies/*.yaml`,
`prompts/reviewer-role.md`, `templates/*.eta` except `review.eta`. Also unchanged:
`src/code-intelligence/dependents.ts`, `src/review/claude-reviewer.ts` and the process runner,
`routes/gates.yaml`, `fixtures/reviewer-recordings.json`, `skills/review/references/{merge-request,requirements}.md`,
`hooks/hooks.json`. `templates/review.eta` may change by at most 10 lines and only if 08-M2 cannot
be computed server-side.

## Contract

```ts
// src/review/estimate.ts — fields this step guarantees on step 07's estimator
export interface ReviewEstimate {
  target: string;                                   // one line, e.g. "uncommitted work" / "branch feature..main"
  files: number; changedLines: number;              // after --only/--exclude and review.excludePaths
  checks: { key: string; decision: 'run' | 'waiting' | 'skip' | 'forbid'; reason: string | null }[];
  waitingKeys: string[];                            // keys whose policy is propose and have no honoured acceptance
  snapshotBytes: number | null;                     // planSnapshot().totalBytes; null when refused
  history: { reviews: 5; medianDurationMs: number; medianCostUsd: number | null } | null;  // null = "no history"
  refusal: { code: 'input-too-large' | 'snapshot-too-large'; message: string; suggestions: string[] } | null;
}
export function estimateReview(runtime: Runtime, options: AssembleOptions): Promise<ReviewEstimate>;
export function renderEstimate(estimate: ReviewEstimate): string;     // ≤ 2,048 bytes

// src/review/coverage-block.ts
export function notCoveredBlock(result: ReviewResult): string;        // part 4 of renderReport, verbatim
export function normalizeBlock(text: string): string[];               // 08-C2

// src/review/validate.ts
export interface ValidateOptions { /* existing fields */ onInvalid?: 'void' | 'drop' }   // default 'void'
export type ValidatedFindings =
  | { kind: 'ok'; findings: Finding[] }
  | { kind: 'invalid'; reason: string; rejections: string[] }
  | { kind: 'partial'; findings: Finding[]; reason: string; rejections: string[] };  // only with 'drop'

// src/page/selection-metrics.ts
export interface SelectionRow { at: string; reviewId: string; findingId: string; rule: string | null;
  offered: boolean; selected: boolean; edited: boolean; posted: boolean }
export function selectionRows(input: { at: string; result: ReviewResult; model: PageModel;
  submission: ParsedSubmission; outcome: SubmissionRecord }): SelectionRow[];
export function recordSelection(fs: FileSystem, reviewDirectory: string, rows: SelectionRow[]): Promise<void>;
```

**CLI.**
`ambicode review --estimate [--branch [--base <ref>] | --mr <url>] [--task <slug>] [--only <glob>]… [--exclude <glob>]… [--json]`.
`--estimate` is valid with every existing target option except `--approve`, `--decline` and
`--evidence` (those refuse with `bad-argument`, field `--estimate`). It writes nothing: no
snapshot, no check run, no reviewer, no publication, no ledger entry, no command tail (01-contracts §3).

**Route.** `route start review [--branch [--base <ref>] | --mr <url>] [--requirement <url>]… [--task <slug>] [--headless] [--answer estimate=run]`.

```yaml
skill: review
version: 3
budget: { modelSteps: 6, wallMinutes: 45 }
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: []
steps:
  - { id: template, actor: code, when: args.hasRequirement, run: requirements.template }
  - { id: fetch, actor: model, when: args.hasRequirement, instruction: file:routes/steps/review-fetch.md }
  - { id: ground, actor: code, when: args.hasRequirement, run: requirements.normalize, produces: [envelope], repeat: 2 }
  - { id: estimate-step, actor: code, run: review.estimate }
  - id: estimate
    actor: human
    gate:
      question: "Run the independent reviewer on this change?"   # followed by renderEstimate()
      options: [run, narrow, skip]
      acting: [run]
      default: skip
      release: skip
      onAnswer: { narrow: revise estimate-step --narrow $answer, "*": revise estimate-step --narrow $answer }
      maxRevises: 3
  - { id: review-run, actor: code, when: gate.estimate.is(run), needs: [review], run: review.evaluate, produces: [review], repeat: 2 }
  - { id: readback, actor: model, when: gate.estimate.is(run), instruction: file:routes/steps/review-readback.md }
  - { id: view, actor: model, when: gate.estimate.is(run), instruction: file:routes/steps/review-view.md }
```

Field names follow step 03's DSL; the step ids, actors, `when`s, gate options, `acting`,
default, release, `repeat`s and budget above are this step's contract. The `renderEstimate()` text
after the question is printed through step 09's question-text seam; `review.evaluate` is step 07's
handler.

**Route args.** `StartInput.target?: ReviewTarget` and `RouteArgs.target?: ReviewTarget`, with
`ReviewTarget = { branch: boolean; base: string | null; mr: string | null }`. The field is absent
for every other skill and for a review of uncommitted work; when present it is added to the
03-E8 hash input as `target`, so hashes of routes without a target do not change. A target flag
on `route start <skill>` for any skill other than `review` → `bad-argument` (field `--branch`,
`--base` or `--mr`).

**Persisted fields.** `ReviewResult.selection` (optional, absent until the first submit):
`{ submittedAt: string; rows: { findingId, offered, selected, edited, posted }[] }[]`, one element
per submit. `.ambicode/metrics.jsonl`: one `SelectionRow` JSON line per finding per submit, keys in
the order of v6/32 §8. No new ledger kind or field.

**Error codes.** No new code. Existing codes raised on the route: `conflicting-target`,
`baseline-not-applicable`, `requirements-missing`, `input-too-large`, `snapshot-too-large`,
`check-only-unauthorized`, `bad-argument`.

## Rules

**R — the route**
- 08-R1 `routes/review.yaml` is exactly the Contract YAML. It validates at build with step 03's
  loader and ships in the package candidate with its three step files.
- 08-R2 Start: `route start review` (CLI and the `/ambicode:review …` launch, which tokenizes
  the same flags) parses `--branch`, `--base <ref>` and `--mr <url>`, validates them with the
  existing `validateTargetArgs` before any entry is written, and stores `RouteArgs.target`
  (Contract). `conflicting-target` and `baseline-not-applicable` refuse at start with their current
  messages. The same start with a different target is a different hash (step 03's 03-O3 rules).
  Headless `args.hasRequirement` is true only with `--requirement` (D17, step 03's predicate).
- 08-R3 With no requirement, `route start` runs `estimate-step` at its tail and prints the
  `estimate` gate; with a requirement, `template` runs, `fetch` is delivered, and the `route next`
  after the fetch runs `ground` then `estimate-step`. Ceremony per v6/25: no requirement → 1
  (the gate); with requirement → 2 (`route next` + the gate). Work commands: `review` ×1–2.
- 08-R4 Answer `skip`, a headless or never-asked default, or an untrusted acting `run` (S14) skip
  `review-run`, `readback` and `view` (their `when` is false). The route completes and its report
  carries the `default-taken` or `declined` entry under Not verified. No reviewer process starts.
- 08-R5 Answer `run` honoured (bound hook answer, or a trusted-start preanswer consumed at the
  printed instance, 01-contracts §5) makes `review-run`'s `when` true while its `needs: [review]` is
  unmet, so the advance delivers the run instruction instead of running the handler (as task's
  07-R7): the exact `review` command with the flags of `RouteArgs.target`, `--task <slug>`, and the
  `--only/--exclude` tokens `estimate-step` last used (08-E6). The `review` command's tail then
  satisfies `needs` and `review.evaluate` reads that result. `review.evaluate` never runs while no
  `review` entry is in its window.
- 08-R6 `readback` text: read the four parts back as printed, in order; copy part 4 verbatim
  (08-C1); name `references/outcomes.md` for an error code. `view` text: when the target is `--mr`
  or there is at least one finding, run `view --review <id>` in the background and give the
  tokened URL as a link; publication stays on the page, by the human. Each text ≤ 1,500 chars.
- 08-R7 The start tail checks `git check-ignore -q .ambicode/metrics.jsonl`. When it is not
  ignored, the start output carries one warning line naming `init --apply`. The route still starts.
- 08-R8 `review --task <slug>` while the slug has an open review route: the target is
  `RouteArgs.target` (a target flag on the command that differs from it → `conflicting-target`);
  no baseline scoping and no baseline omission (07-B4); it refuses `review-not-accepted` unless
  `context.consent(view, 'estimate')` is `honoured` with answer `run` (01-contracts §5: consumer
  commands call consent; same check as 07-B5).

**E — estimate** (v6/16 §5, v6/25 step 3)
- 08-E1 `estimateReview` runs `assembleBundle`'s target resolution, `partitionChange`,
  `enforceReviewInputLimits` and `planSnapshot` on the same inputs a review would use. It never
  calls `writeSnapshot`, a check runner, the reviewer or publication.
- 08-E2 `checks` lists each selected check with the authorization decision `authorizeCommand`
  gives today (`run`, `waiting` for propose without an honoured acceptance, `forbid`), or `skip`
  with the existing limitation as `reason`. Nothing is executed.
- 08-E3 `input-too-large` and `snapshot-too-large` are caught and returned as `refusal` (exit 0
  from `--estimate`). `suggestions`: for `snapshot-too-large`, the `--exclude "<path>"` lines the
  existing error already carries; for `input-too-large`, `--exclude "<path>"` for the three
  included files with the most changed lines, plus `--only "<dir>/**"` for each top-level directory
  of the included files when there are 2–3 such directories.
- 08-E4 `history`: read every `result.json` under `<repo>/.ambicode/reviews/*/` and
  `<repo>/.ambicode/task/*/reviews/*/` that parses as `ReviewResult` (skip the rest silently), keep
  those with `reviewer.status === 'ok'` and `reviewer.durationMs !== null`, take the 5 newest by
  `createdAt`. Fewer than 5 → `history: null`, printed `history: no history` (P20). Otherwise the
  median `durationMs`, and the median of the non-null `usage.costUsd` values (null if none).
- 08-E5 `renderEstimate` prints target, files/lines, each check with its decision, waiting keys,
  snapshot bytes, history, and the refusal with its suggestions first when present. Output ≤ 2,048
  bytes for 200 changed files and 30 checks; beyond that, lists are truncated with "… N more".
  `--json` prints the `ReviewEstimate` object.
- 08-E6 `narrow`: the free-text answer (`"*"` key) is a list of `--only <glob>` / `--exclude
  <glob>` tokens. The re-entry records it as `revise {args: {narrow: [<text>]}}` (03-F12), and
  `estimate-step` reads it from `HandlerInput.revise.args.narrow`, never from the gate's window. It
  re-estimates with those tokens and reprints the gate. The `narrow` option itself carries no
  tokens: the estimate is reprinted unchanged with the line "give the --only/--exclude tokens as
  your answer". Any other token → `bad-argument` (field `narrow`), gate reprinted with the previous
  narrowing. A later run of `estimate-step` with `revise: null` (no narrowing in force) estimates the
  full target. Free text is never acting (01-contracts §5).

**D — dependents** (v6/16 §6, D8)
- 08-D1 `search.index === 'none'` (the default): `findDependents` is called exactly as today; the
  dependent paths and their order are unchanged.
- 08-D2 `search.index !== 'none'` and the adapter's `status` reports a usable index: for each
  changed file, `IndexAdapter.relates(path)` importers enter the bundle through the same channel as
  `--context` (the `named` list), reason `imports <changed file> (index)`, capped at
  `MAX_DEPENDENTS`; `findDependents` is not called. Adapter error or unusable index → 08-D1, and
  one omission line `index unavailable: <reason>; dependents by name search`.
- 08-D3 For each dependent whose reasons mention a term that the census marks as colliding, append
  the reason `verify import: <term> is declared in more than one file`. This is the only change to
  prompt content; it is made in `bundle.ts`, never in `prompt.ts`.
- 08-D4 No language service, no `refs --exact`, no LSP anywhere in the review path.

**Q — missing sources** (v6/25 step 2, 01-contracts §7, G5)
- 08-Q1 On the review route, the registry `policy: {review: stop}` makes *stop* the default and
  the release of `requirements-server-disconnected`, `requirements-server-ambiguous` and
  `requirements-not-captured-twice`. Interactive `requirements-server-ambiguous` still prints the
  actually connected servers as options. Headless or three unanswered advances take *stop*: route
  `exit` `blocked`, no estimate, no reviewer.
- 08-Q2 Partial captures, a list-only `search*` hit, or an unrecognised payload → `ground` refuses
  `requirements-missing`; `missingAsked` names each requested source; no `exit` entry, no
  `estimate-step`, no reviewer. Fetching the missing source then `route next` → normalize completes
  → `estimate-step` runs. `route stop` is the only exit from that state.
- 08-Q3 Standalone `ambicode review --requirement <url>` (no route) keeps its existing refusal for
  an unretrieved requirement; it never falls back to a quality review.

**W — waiting checks and `review-run`** (v6/25 step 5, #77)
- 08-W1 `review-run` reuses step 07's handler. A `review` entry with waiting keys raises
  `check-only-unauthorized` per key (options approve/decline, default decline); approve →
  `revise review-run` through `$raisedBy`, so the re-run is a route step.
- 08-W2 When two or more keys are waiting, each gate text names one re-run command carrying every
  waiting key as `--approve <key>`; approving them one after the other is two human cycles.
- 08-W3 At `repeat: 2` the still-declined or unanswered keys are listed under Not verified and the
  route proceeds to `readback`.
- 08-W4 `review --approve <key>` is honoured only with an honoured `acceptance {gate:
  check-only-unauthorized}` for that exact key (`RouteContextPort.consent`). A model-typed
  `--approve` without one, on every channel and in every mode, records `declined {via: flag,
  reason: acting-needs-human}` and the check stays waiting. An honoured answer is executed without
  another question.

**C — verbatim coverage** (v6/25 step 6, v6/15 §3)
- 08-C1 The readback must contain part 4 of the printed report verbatim.
- 08-C2 `notCoveredBlock(result)` = the lines of `renderReport({result, …})` from
  `4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE` to the end. `normalizeBlock` trims each
  line, drops empty lines and collapses inner runs of whitespace to one space.
- 08-C3 Stop check (b) on a review route: find the latest `review` entry in `review-run`'s window,
  read its `result.json`, and require `normalizeBlock(notCoveredBlock(result))` to appear as a
  contiguous run in `normalizeBlock(<last assistant message>)`. Missing → block once with the
  reason `the "not covered" block is not reproduced verbatim`, and step 03's `limit {stop-block}`;
  a second failing stop allows. No `review` entry → this check does not apply.

**M — selection metrics** (v6/16 §8, v6/32 §8, D4)
- 08-M1 After `recordSubmission` succeeds, the page computes one `SelectionRow` per finding of
  `result.findings` and calls `recordSelection`. A failure to write metrics is logged and never
  fails the submit.
- 08-M2 `offered` = the finding's `FindingCard.publishable` in the page model at submit;
  `selected` = in the parsed selection; `edited` = the submitted body differs from the draft body
  the page offered; `posted` = the submission's outcome for that finding is `published` or
  `already-published`; `rule` = `ruleRefs[0] ?? null`.
- 08-M3 `recordSelection` appends the rows to `<the nearest ancestor of reviewDirectory named .ambicode>/metrics.jsonl`
  (one `appendText` per submit) and appends one element to `result.json`'s `selection`, written
  temp-then-rename. A review directory outside `.ambicode/` writes only `result.json`.
- 08-M4 Code under `src/page/*` (and `templates/review.eta` only if needed) is the only place that
  writes metrics. `src/publication/*` is unchanged.
- 08-M5 `node evals/scripts/src/analysis/selection-metrics.mjs <repo>…` reads each
  `<repo>/.ambicode/metrics.jsonl` and prints, per repository, offered, selected, posted and the
  accepted rate `posted / offered` (`n/a` when offered is 0). Unparsable lines are counted and
  reported, not used.

**V — `review.onInvalid`** (v6/16 §7)
- 08-V1 Default `void` (absent config): `validateFindings` behaves exactly as today.
- 08-V2 `drop`: findings with an invalid location, unknown rule or unknown requirement are removed
  and their rejections kept; the over-`maxFindings` case still voids. Result `{kind:'partial'}`
  when at least one finding was dropped.
- 08-V3 `review.ts` maps `partial` to `status: 'partial'`, `statusReason` `N invalid finding(s)
  dropped (review.onInvalid: drop)`, and the rejections into `reviewer.rejections`, so part 4 states
  the drop. Nothing turns `drop` on by default.

**K — skill body** (v6/25 "What the model loads", D2)
- 08-K1 `skills/review/SKILL.md` ≤ 2,048 bytes: what the pipeline is; the four reporting rules with
  their reasons (empty ≠ clean; failed reviewer ≠ clean; skipped check ≠ pass; one bad location
  voids); the fallback start line in step 03's form for investigate.
- 08-K2 Front matter `disable-model-invocation: true`; the description states the D2 trade in one
  sentence: a natural-language "review my change" goes to Claude Code's built-in review; AMBICODE's
  review runs only when typed.
- 08-K3 `references/impact.md` is deleted and nothing references it. `merge-request.md` and
  `outcomes.md` are named only by step texts.

**B — byte ceilings** (01-contracts §8, #130)
- 08-B1 Built outputs: body ≤ 2,048 bytes; `route start review` output ≤ 3,072 bytes; `review
  --estimate` output and the printed `estimate` gate each ≤ 2,048 bytes; every review step
  instruction ≤ 1,500 chars after inclusion. Generic CLI (8,000 chars) and hook (9,800 chars) caps
  and the 300-char file fallback are unchanged. No limit is raised.

**P — review with-prompts** (#117, #151)
- 08-P1 `prompt-transport.mjs` exports `REVIEW_COMMAND = '/ambicode:review --headless --answer estimate=run'`.
  `writeCase` calls `writePluginPrompt(directory, REVIEW_COMMAND)` for every review case, so all 8
  get `prompt.with.md` whose first body line starts with `/ambicode:review --headless --answer estimate=run`, with no target flag
  (the same `pluginPrompt` prefix form as investigate). Front matter, the rest of the body and the
  naked `prompt.md` bytes are unchanged.
- 08-P2 No target flag because `reviewScaffoldFile` commits the base and leaves the change
  uncommitted, and review's default target is uncommitted work. No code reads `truth.json` or any
  grader to pick files.
- 08-P3 `promptMarkdown` stays the naked body; `pluginPromptMarkdown` records the served body
  (step 00's mechanism, unchanged).
- 08-P4 No live plugin arm runs unless P37(b) or P58 proved a trusted start. An external runner
  also needs a proven hook start or an authenticated harness adapter, never a public trusted flag.
  Otherwise the plugin arm is reported `pending: trusted launch unproven`.

**T — trigger suite** (D2)
- 08-T1 In the same change as 08-K2, each of the 8 review-positive cases replaces `review-fired.md`
  and `sibling-fired.md` with a copy of `neg-http/graders/no-skill-fired.md`; `verb-review` also
  replaces `helper-ran.md` and `skill-before-helper.md` with a copy of
  `unrelated-question/graders/no-helper.md`. `url-bare` drops `fired-review.md`; if no `fired-*`
  grader remains, `any-skill-fired.md` is replaced by `no-skill-fired.md`. Prompts, `case.yaml`,
  scaffolds and split tags are unchanged; run-validity checking is unchanged.
- 08-T2 The suite README lists these cases as negatives. The suite is not run without a named go.

**I — integration and audit**
- 08-I1 `src/cli/cli-surface.test.ts` embeds the v6/31 command table (commands and flags, as
  synthetic data; no read of `gym/`) and asserts each is in `SPECS`/`USAGE`, including
  `worker run`, `doctor`, `note list`, `note promote`, `init --set`, `check --only/--phase`,
  `review --estimate`, and that no command has a `channel` or `trusted` flag. A gap owned by an
  earlier step is a `todo` test naming that step, and the report status is `partial`.
- 08-I2 After integration, run every S1–S14 test and the full gate-table test; report each with
  its command and outcome. A failure in another step's mechanism is reported with the owner; it is
  not fixed here (05-working-rules §2.2).
- 08-I3 The integration test (Tests 10) runs on the actual route with the replay reviewer.

**L — live reviewer tier** (v6/33 §0.7, §6; paid; needs a named go and a trusted launch)
- 08-L1 Per decision 0-R: (i) credential pass-through inside the sandbox, or (ii) a runner outside the sandbox for the 8 review cases × 3 runs, 2 arms, live reviewer, cost including the reviewer.
  Branch (i): the harness passes only the names already in the reviewer's environment allowlist;
  values are never printed, logged or stored. Branch (ii): 08-L2. 0-R undecided → build nothing
  for the tier beyond 08-L6 and report `pending: 0-R`.
- 08-L2 `live-review.mjs` (branch ii): materializes each case's `scaffold.sh` in a temporary
  directory, runs the arm's served prompt (plugin: `prompt.with.md`; naked: `prompt.md`) outside
  the sandbox, collects the session result, the review `result.json` and the reviewer usage, and
  writes one results JSON beside the existing eval results. `--dry-run` prints the sanitized plan and
  spawns nothing. `--max-cost-usd` is required for a real run and stops the sweep when reached.
- 08-L3 Measures: `complete` share ≥ 90% when no check waits; location validity 100%; accepted rate tracked; finder hypothesis: thread recall vs naked.
  Cost includes the reviewer. Untrusted or default-skipping plugin runs are counted as launch or
  consent failures, never in the "live reviewer succeeded" denominator.
- 08-L4 Planted caller-break cases (G7) for index `relates` vs name search, only when step 05
  shipped an adapter.
- 08-L5 **Decision 8-F**: live-reviewer thread recall ≤ naked at > 1.5x cost over 3 runs → the user decides whether review is described as a publication and coverage tool. Present; do not decide.
- 08-L6 Budget and provenance, stated in the evals-core README live-tier section and in the
  measurement report: Review live-tier budget $8–16 historically covers 24 reviewer calls; two-arm full-session overhead
  must be estimated and separately bounded from observed cost before dispatch, not hidden in that
  figure. The new live tier uses two arms as v6/33 §6 requires; an authorized naked comparison
  session for this tier is an experiment arm, not a new global curated baseline. Use the
  user-authorized 2026-10-04 working naked reference for the early curated gate; retain the
  unverified naked/true-without equivalence assumption. Report both the fresh live-tier comparison
  and any cached comparison separately, including version uncertainty and reviewer cost.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 The review route names its normalize step `ground`. v6/25 step 2 calls the refusal "a refusal
  of the `ground` step"; v6 step 08's step list omits the id. The step runs only `when:
  args.hasRequirement`.
- D2 Selection metrics are written by the page's submit handler, not by a route step. v6 step 08
  lists `metrics (code, on submit)` in the route, but the human selection before it "is not a route
  step", so no advance can reach a code step after it, and v6/25's ceremony 1–2 leaves no room for
  another `route next`. The behaviour (rows on submit) is unchanged.
- D3 `narrow` re-enters `estimate-step` as a human revise (`onAnswer`), bounded by `maxRevises: 3`;
  v6/32 §3 exempts `onAnswer` targets from the `repeat ≥ 2` rule.
- D4 With an index, `relates` importers enter through the bundle's existing `--context` channel
  inside `assembleBundle` (v6/16 §6 "passed with `--context`"), not as flags the model types.
- D5 "Verify import" reasons apply in both configurations; with `index: none` the dependent paths
  and their order stay exactly as today (v6/16 §6 "unchanged in the default configuration").
- D6 History needs 5 qualifying reviews (P20 "Estimate history needs 5 reviews"); fewer prints
  "no history".
- D7 Under `drop`, the over-`maxFindings` case still voids the whole result: dropping there would
  "silently keep the first N", which `validate.ts` forbids.
- D8 The with-prompt keeps `pluginPrompt`'s prefix form: the command is typed before the original
  first body line, on that line (step 00's actual transport; v6 step 00 §3 describes investigate the
  same way).
- D9 v6/16 §8 says the page records selections "into `result.json`". `ReviewResult` is strict, so
  this needs an optional `selection` field in `src/contracts/review.ts`; existing results without
  it parse and re-serialize byte-identically. `src/publication/*` stays unchanged.
- D10 The integration proof uses the default target (uncommitted work), not `--branch`:
  `ts-source-regression` is an uncommitted change, and #151 removed `--branch` from the review path.
  If the replay reviewer misses on this fixture (P19), the test injects a fake reviewer through
  `ReviewDependencies` and says so; the recordings are not re-keyed.
- D11 The start-tail ignore warning (08-R7) is built although step 09 now runs first: repositories
  initialized before schema 3 lack the line until they re-run `init --apply`.

- D12 The review target travels as `RouteArgs.target` (Contract), not as text: v6 step 08
  requires a start with `--branch`/`--mr` but step 03's args have no field for it. Adding it only
  when present keeps every earlier route's hash unchanged.
- D13 `review-run` gets `needs: [review]` like task's `review-run` (07-R7): v6/12 §8 has the model
  run the reviewer and a code actor evaluate the recorded result; without `needs` the code step
  would evaluate before the model ran anything.

User decisions this step does not take: 0-R (08-L1 branches), P37(b)/P58 (08-P4), 8-F (08-L5),
5-I (08-D2 applies only when the user enabled an index), paid runs.

## Non-goals (a reviewer may not raise these)

- No change to the pipeline's status rules, error codes, prompt template, snapshot, providers or
  publication (M18; Kept). No change to reviewer invocation, its environment allowlist or its tools.
- No re-keyed reviewer recordings (P19). No replay recording for new fixtures.
- No language service, LSP or `refs --exact` for dependents (D8). No Python import resolution (P29).
  Colliding names are flagged, not resolved (P51).
- No automatic publication; the page's selection stays human-only.
- `onInvalid: drop` is not enabled anywhere, and its experiment is step 10's.
- No change to `requirements template/normalize`, the registry, `hasRequirement`, the fold,
  consent or ownership. The only engine change is the `target` start arg (08-R2). No new gate in
  `routes/gates.yaml`.
- No fix to another step's scenario or CLI gap found by 08-I1/08-I2; report it.
- No new baseline, no naked-vs-without equivalence run, no change to gate thresholds.
- No running of the trigger suite, the live tier or any probe without a named go.
- No handling of hostile edits to `metrics.jsonl`, `result.json` or review directories (01-contracts §5).
- No package publication or install; 04-release-acceptance owns the candidate checks.

## Tests

Name each test after its rule. Use materialized synthetic repositories (`fixtures/definitions.mjs`),
injected sessions, clocks and fake runners. No test reads anything under `gym/` or ignored inputs.

1. `estimate.test.ts`: no snapshot, check, reviewer or ledger write, with spies that fail if called
   (08-E1, Contract CLI); check decisions table-driven (08-E2); both refusals with their
   suggestions (08-E3); history with 0, 4, 5 and 7 synthetic results, null cost (08-E4); 200 files ×
   30 checks ≤ 2,048 bytes and `--json` shape (08-E5, 08-B1); narrow tokens accepted and a bad token
   refused; S-walk: free-text `--exclude x` → `revise estimate-step` → the re-estimate excludes `x`
   (read from `HandlerInput.revise`) and the run command carries it (08-E6, 08-R5).
2. `review-route.test.ts` (route level): YAML validates and is packaged (08-R1); one-target refusals;
   `--branch --base main` and `--mr <url>` reach `RouteArgs.target` and the hash, a target flag on
   another skill refuses (08-R2); after an honoured `run`, the advance delivers the command and
   `review.evaluate` is not called until a `review` entry exists (08-R5); `review --task` in the
   review route: no `baseline-missing`, target from the route, `review-not-accepted` without an
   honoured `run` (08-R8); ceremony 1 without and 2 with a requirement (08-R3); skip, headless default, never-asked
   default and untrusted `--answer estimate=run` start no reviewer (08-R4, S14); trusted preanswer
   honoured at the reached instance, run command names target, task and narrowing, nothing asked
   again (08-R5, S14); step texts' content and caps (08-R6, 08-B1); ignore warning on and off (08-R7);
   a late bound answer after a never-asked default supersedes it (S12).
3. `bundle` tests: `index: none` dependents byte-identical to the pre-change output on the same
   fixture (08-D1); fake adapter importers with reasons and cap, adapter error falls back with the
   omission line (08-D2); a colliding term adds the reason; `git diff --stat` on the Kept files is
   empty (08-D3, Done when).
4. Missing sources on the shipped route, reusing step 04's fixtures (S7, S8): two requirements with
   one captured → `requirements-missing`, `missingAsked`, no exit and no reviewer; capture the
   second + `route next` → estimate; `route stop` → exit; list-only hit and unrecognised payload stay
   missing (08-Q2). Disconnected, ambiguous (interactive offers servers) and not-captured-twice →
   *stop* (08-Q1). Standalone `review --requirement` refusal unchanged (08-Q3).
5. Waiting checks: one key → gate → bound approve → `revise review-run` → re-run; two keys → one
   command with both `--approve`, two cycles; `repeat` reached → Not verified (08-W1 … 08-W3); model
   `review --approve` on cli/hook/harness × interactive/headless → declined, still waiting (08-W4, S14).
6. Coverage: `notCoveredBlock` equals part 4 for a result with coverage gaps, omissions and
   rejections; normalization cases (08-C2); Stop fixtures: verbatim passes, missing block blocks
   once, second failure allows, no review entry not checked (08-C3).
7. Metrics: rows for offered/selected/edited/posted combinations (08-M2); `metrics.jsonl` line
   shape and `result.json` `selection` appended; outside `.ambicode/` writes only `result.json`; a
   failing metrics write leaves the submit successful (08-M1, 08-M3); an existing `result.json`
   without `selection` re-serializes byte-identically (D9); aggregator on two synthetic repositories,
   with one bad line (08-M5).
8. Validate: default unchanged on the existing validate fixtures (08-V1); drop keeps valid, drops
   invalid, over-limit voids (08-V2); status, reason and part-4 text (08-V3).
9. Skill and triggers: body ≤ 2,048 bytes, flag, D2 sentence, no `impact.md` reference anywhere
   (08-K1 … 08-K3); every former review-positive case asserts no AMBICODE skill fires and no grader
   expects `ambicode:review` with `min ≥ 1` (08-T1).
10. Integration (08-I3) on materialized `ts-source-regression` with a synthetic `propose` check:
    `route start review` → estimate printed → synthetic *run* → `review` with the replay reviewer
    (`EVAL_AMBICODE_REVIEWER_REPLAY` with `fixtures/reviewer-recordings.json`, or D10's fake) → one
    waiting key → gate → synthetic approve → `revise review-run` → re-run → readback; the Stop
    fixture checks part 4 verbatim. The test prints the ledger; the report shows it.
11. Prompts (08-P1 … 08-P3) in `bench-cases.test.mjs` / `evals-bench.test.mjs`: eight synthetic
    review cases get with-prompts starting with the command and no `--branch`; naked bytes
    unchanged; `run --dry-run --prompt with` lists them; on a synthetic scaffold built like
    `reviewScaffoldFile`, `review --estimate` selects exactly the changed files, and `--branch`
    excludes those uncommitted changes (no matching file set, or `baseline-not-applicable`); a later
    model `route next --answer estimate=run` is declined.
12. Audit (08-I1) and the integrated S1–S14 and gate-table run (08-I2).
13. Live tier (branch ii only): `live-review.mjs --dry-run` with a runner that throws if called;
    refusal without `--max-cost-usd`; no credential value in output (08-L1, 08-L2).

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass (08-L rules: only those
      that are model-free).
- [ ] `npm run verify` is green and `node --test 'evals/scripts/src/**/*.test.mjs'` passes; the
      report states the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff --stat <dispatch baseline> -- src/review/prompt.ts src/review/report.ts src/snapshot src/providers src/publication policies prompts/reviewer-role.md templates ':!templates/review.eta'`
      is empty, and the report shows the command and its output.
- [ ] The integration ledger (Tests 10) is shown in the report.
- [ ] S1–S14 and the gate table are reported with commands and outcomes (08-I2); audit gaps, if
      any, are named with their owner step.
- [ ] Measurements: the live tier ran under a named go, or is reported `awaiting go` with the
      blocking item (0-R, P37(b)/P58, authorization); decision 8-F is presented as v6/33 §6 says,
      without deciding it. Measurement status is reported separately from implementation status.
- [ ] The report follows 05-working-rules §4.

## Hand-off to core acceptance and step 10

- 04-release-acceptance receives the shipped review route, the integrated S1–S14 and gate-table
  results, the CLI audit, and the Kept-file diff. It re-runs them on the merged candidate; it does
  not rebuild them.
- Step 10 receives `review.onInvalid: drop` (flag only, default `void`) and the live-tier runner;
  its experiments use this same runner under their own authorization. No second runner.
- The eight review with-prompts and `REVIEW_COMMAND` are the review arm's prompts for every later
  measurement; no agent adds another prompt switch.
- `selection-metrics.mjs` is the only aggregator of `metrics.jsonl`.
- Open user decisions carried forward: 0-R if still pending, 8-F, and the plugin arm's trust
  (P37(b)/P58).

## Coverage of the v6 brief

| v6 step-08 requirement | Here |
|---|---|
| Dispatch defaults, prerequisites (07, 0-R, P37(b)/P58), paid items need named authorization, unrun eval is pending | Header, 08-L1, 08-P4, Done when |
| Why: pipeline kept (M18, 41 Kept); estimate, index dependents, missing-requirement stop, re-entry, verbatim, D4 metric; replay-miss → live tier | Goal, Non-goals, 08-L |
| Read-first list (design sections, code symbols, eval README, `evals-reviewer.mjs`) | Header sources, Starting point |
| `review --estimate`: files, lines, checks and decisions, waiting keys, snapshot bytes, median of last 5 or "no history" | Contract, 08-E1, 08-E2, 08-E4, 08-E5 |
| Catch `input-too-large`/`snapshot-too-large` before the snapshot, with `--only/--exclude` suggestions | 08-E1, 08-E3 |
| Gate `estimate` run / narrow / skip, default skip non-acting | Contract YAML, 08-E6, D3 |
| Evals pass `--answer estimate=run` only at a proven trusted start; later acting flags never authority; S14 trusted headless without preanswer skips reviewer | 08-R4, 08-R5, 08-P4, Tests 2, 11 |
| `index: none` → `findDependents` unchanged; with index `relates` as `--context` | 08-D1, 08-D2, D4 |
| Colliding names "verify import" added where the bundle assembles context; `prompt.ts` byte-for-byte; `git diff --stat` empty | 08-D3, D5, Done when |
| Registry `review: stop` on disconnected, ambiguous, not-captured-twice; interactive ambiguous offers servers | 08-Q1 |
| Partial / list-only / unrecognised → `requirements-missing` at ground, `missingAsked`, no exit, no reviewer; recovery → estimate; explicit stop exits | 08-Q2, D1 |
| S7 recovery and S8 on the actual route, reusing 04 fixtures | Tests 4 |
| Standalone requirement review keeps its refusal | 08-Q3 |
| `review-run` repeat 2, `check-only-unauthorized` per key default decline, approve → `revise review-run` (`$raisedBy`), declined keys under Not verified | 08-W1, 08-W3 |
| Two keys = two human cycles; one command with both `--approve` keys | 08-W2 |
| Four parts read back; "not covered" verbatim; Stop (b) normalized diff | 08-R6, 08-C1 … 08-C3 |
| Page records offered/selected/edited/posted into `result.json` and `metrics.jsonl` on submit (32 §8) | 08-M1 … 08-M3, D9 |
| `init --apply` gitignores `metrics.jsonl` (step 9); until then start tail warns | 08-R7, D11 |
| Aggregation script prints accepted rate per repository | 08-M5 |
| Metrics touch `src/page/*` and `review.eta` only | 08-M4, Files, D9 |
| `review.onInvalid: drop` flag, default void, drop downgrades status and states the drop | 08-V1 … 08-V3, D7 |
| SKILL.md ≤ 2 KB with pipeline, four rules with reasons, fallback line; `disable-model-invocation`; D2 trade sentence | 08-K1, 08-K2 |
| Delete `impact.md`; `merge-request.md`/`outcomes.md` named by step text | 08-K3, 08-R6 |
| `routes/review.yaml` steps, `conflicting-target`/`baseline-not-applicable`, headless `--requirement` only, view `--mr` background tokened URL, selection not a route step, `metrics` on submit | Contract YAML, 08-R1 … 08-R6, D1, D2 |
| `budget.modelSteps: 6`; ceremony 1–2 | Contract YAML, 08-R3 |
| Live tier per 0-R (i)/(ii), 8 × 3 × 2 arms, cost incl. reviewer | 08-L1, 08-L2 |
| Measures: complete ≥ 90%, location validity 100%, accepted rate, thread recall vs naked | 08-L3 |
| Planted caller-break cases when step 5 shipped an adapter | 08-L4 |
| Decision 8-F presented, not decided | 08-L5 |
| Proofs: verify green, Kept diff empty, tests per deliverable, gates table covers `estimate`, `check-only-unauthorized` under review, disconnected stop | Done when, Tests 2, 4, 5, 12 |
| Integration on `ts-source-regression` with replay reviewer, waiting key, approve, re-run, Stop fixture, ledger shown | 08-I3, Tests 10, D10 |
| Do not: change pipeline/Kept; run reviewer on skipped estimate or publish; language service; keep `impact.md`; re-key recordings; enable drop by default | Non-goals, 08-R4, 08-D4, 08-K3, 08-V3 |
| Hand-off acceptance: deliverables built and tested, Kept diff empty, ledger shown, live tier run or awaiting go with 8-F | Done when |
| Review per-arm prompts: all 8 `prompt.with.md` via select's hook; first line `/ambicode:review --headless --answer estimate=run`, no target flag; scaffold commits base, change uncommitted | 08-P1, 08-P2, D8 |
| Preserve body/front matter and naked bytes; `promptMarkdown` / `pluginPromptMarkdown` | 08-P1, 08-P3 |
| Synthetic scaffold: `--estimate` selects changed files; `--branch` excludes them; no secret truth list | 08-P2, Tests 11 |
| Tests: eight with-prompts, naked unchanged, dry run lists them, real estimator/start selected, later flags declined | Tests 11 |
| No live plugin arm until P37(b)/P58; external runner needs proven start or authenticated adapter, no public trusted flag; unsupported → pending | 08-P4 |
| Byte ceilings: body 2,048; start 3 KiB; estimate and gate 2 KiB; instructions 1,500 chars; generic caps unchanged; large synthetic inputs; no raised limits | 08-B1, Tests 1, 2 |
| Run complete S1–S14 and the registry gate matrix after integration; 04-release-acceptance for package/compatibility | 08-I2, Non-goals, Hand-off |
| Final completeness audit of v6/31 CLI incl. `worker run` and `doctor` | 08-I1 |
| Estimator extends step 07's seam; writes no snapshot/check/reviewer/publication effect | Starting point, Contract CLI, 08-E1 |
| Aggregator touches evals; default validate behaviour stays void | 08-M5, 08-V1 |
| Live-tier budget $8–16 vs session overhead; experiment arm not a new baseline; 2026-10-04 reference; equivalence unverified; fresh vs cached reported separately | 08-L6 |
| Measurement status separate from implementation; unauthorized paid proof reported pending | Done when |
| Trigger-suite migration in the same change as disabling invocation; preserve inputs and validity; synthetic assertions; no paid run | 08-T1, 08-T2, Tests 9 |

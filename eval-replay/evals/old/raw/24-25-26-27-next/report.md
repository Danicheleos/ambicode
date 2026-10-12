# AMBICODE v7 follow-up: full audit of runs 06_1853 and 07_1933

Date: 2026-10-08. Investigation report, not an accepted implementation plan. This audits the new 20-case investigate suite and the changes since [the previous analysis](../24-25-26-27-analysis.md). It uses saved artifacts and model-free calculations. Product files, the existing uncommitted wording, and original eval reports were left unchanged. No paid eval, fresh bare run, application diagnostic, or product verification suite was run.

## Decision supported by the evidence

**Keep the v7 harness structure and the new measurement foundations. Do not accept the stronger wording as a successful optimization. Do not treat a 12 KB cap as a demonstrated solution to its cost failure.**

Run 06 passes the declared gate. Run 07 changes tool choice in the intended direction, but costs **1.1538356× bare**, above the **1.1×** limit. Relative to 06, it spends **18.03% more**, raises reading requests **29.39%**, raises peak context **13.81%**, and gains only **0.00887 recall**. Precision and F1 improve, but that does not establish an overall gain worth the measured cost.

The weak point is broader than a model habit of searching first or reading one file at a time:

- **Search still delivers poor ownership evidence.** The actual map contains no truth file in **seven of 20 cases**, not six. Delivered macro recall is **21.30%**, and micro recall is **34/442 = 7.69%**. Both runs receive identical maps.
- **The reporting pipeline hides one case.** A truth list containing `package.json` makes `run-report.mjs` reject the entire list as file truth. This drops analytics map/read diagnostics and undercounts zero-truth maps. The preset scorer already handles root-file bullets; reporting has not fully adopted that contract.
- **Forced first reading exposes a repository-root mismatch.** Run 07 has **47 per-file refusals**. Thirteen first reader calls return no source, accounting for **41** refusals, before the model changes into `repo/`. The CLI reader and its task-ledger recorder resolve repositories differently.
- **More batching does not mean less work.** Singleton shares are essentially unchanged between the new runs: **34.2% → 34.6%**. Reading rounds rise **228 → 295**. Many new helper requests cover whole files rather than selected evidence spans.
- **The worst regressions are not controlled by the reader's byte cap.** Every reader-containing result in `fe-vs-6141` is below **7,086 bytes**; every such result in `fe-vs-5948` is below **6,368 bytes**. A 12 KB cap does not reduce those calls. One expensive FE-5948 attempt uses no helper at all.

The next direction should be: repair report diagnostics; align reader execution with the route's repository; remove the unconditional “read before any search” ordering; improve map intent and ownership; then test bounded span reading and smaller budgets offline. Preserve the cached baseline and trusted gate semantics. Do not add a larger route or more agents to compensate for wrong evidence.

## Scope and reproducibility

The three matched arms are:

| Arm | Saved iteration | Cases × repetitions | Role |
|---|---|---:|---|
| Cached bare | `2026-10-07/30_2248_localize-naked-sonnet-5-5` | 20 × 3 | Locked reference; reused, not rerun |
| 06 | `2026-10-08/06_1853_localize-ambicode-with-prompt-sonnet-5-5` | 20 × 3 | Phases A–D and prompt-word fix, earlier read wording |
| 07 | `2026-10-08/07_1933_localize-ambicode-with-prompt-sonnet-5-5` | 20 × 3 | Stronger first-read/no-Read-or-cat wording |

There are **180 evaluated attempts**: 120 plugin and 60 cached bare. Each iteration's trace directory contains **196 trace files**, including **136 unrelated traces**. Those unrelated files include older failed/rate-limited sessions and are excluded. Counting everything under `traces/` would corrupt this audit. Exports are bound back to matched sandbox IDs through `source.json`.

The saved metadata pins Sonnet 5.5, Claude Code 2.1.292, concurrency four, typed investigation prompts, and plugin version 0.5.1. Both feedback records state effort `low`, matching the baseline. However, effort is not a checked identity field in the lock or result metadata. The statement is supported by the records, not by a machine-enforced compatibility guarantee.

Current source HEAD is `3a62dec3e8f948d23076c55e7df4f6b013af8639`. Only `routes/investigate/read.md` was dirty at the start of this audit. The feedback's claim that all Phase D changes remain uncommitted is stale: current HEAD includes Phase D. No immutable executed-bundle hash is present in the historical result. Saved step text and map receipts establish what these model steps received, but a shared plugin version is not full build provenance.

The audit validates all lock source-result hashes, including its other skill sources, but compares only the investigate source. It independently extracts final answers and reproduces the repository's preset scoring on all **180 attempts**. It recovers the bare traces directly from their source iteration instead of following the standard report's composite-baseline path.

The reference is the naked plugin's saved arm, assumed equivalent to running without the plugin. That equivalence has not been measured for this build. The gate and this report retain that explicit limitation; validating hashes does not validate behavioral equivalence. Neither a fresh bare run nor a claim of equivalence is needed to correct the saved reporting defects.

Artifacts: [audit.json](audit.json), [attempts.json](attempts.json), [toolcalls.json](toolcalls.json), [maps.json](maps.json), [case-manifest.json](case-manifest.json), and [read-budget-replay.json](read-budget-replay.json). The [analysis script](analyze.mjs) and [budget replay script](replay-read-budgets.mjs) are saved beside them. Exact trace and session paths are carried on each attempt.

The new suite is larger and uses different case bases/truth than the earlier six-case audit. Its 0.52 recall should not be compared directly with the old 0.64–0.79 as a plugin regression. It remains two TypeScript projects and one skill, so it does not establish cross-language or full-plugin performance.

## Metrics: gate, behavior, cost, and tails

Means below use equal case weights because each case has three attempts. Cost is the actual `costUsd` reported by the eval, not a reconstruction from token prices. Judging is separate.

| Metric | Cached bare | Run 06 | Run 07 |
|---|---:|---:|---:|
| Recall | 0.49428 | 0.52046 | 0.52932 |
| Precision | 0.70869 | 0.67196 | 0.69721 |
| Mean answer F1 | 0.52954 | 0.52414 | 0.55115 |
| Harness score / pass | 1.0 / 60 of 60 | 1.0 / 60 of 60 | 1.0 / 60 of 60 |
| Agent cost total | $13.1675 | $12.8721 | $15.1931 |
| Agent cost per attempt | $0.21946 | $0.21454 | $0.25322 |
| Judging total | $0.48254 | $0.45178 | $0.46452 |
| Agent cost ratio to bare | 1.00000× | **0.97757×** | **1.15384×** |
| Agent + judging ratio | 1.00000× | 0.97611× | 1.14708× |
| Harness turns | 10.13 | 9.40 | 10.25 |
| Model/API requests | 7.82 | 7.68 | 8.67 |
| Tool calls | 9.13 | 8.38 | 9.23 |
| Wall seconds | 59.30 | 47.98 | 54.37 |
| Reported API seconds | 47.25 | 31.34 | 36.67 |
| Scaffold/setup seconds | 3.19 | 6.12 | 6.20 |
| First context tokens | 16,017 | 18,841 | 18,994 |
| Peak context tokens | 39,054 | 38,348 | 43,644 |
| Output tokens | 3,886 | 3,834 | 4,597 |
| Tool-result bytes | 47,549 | 39,886 | 50,170 |

The gate replays as **06 pass; 07 fail cost; one `meanDelta` gap each**. Run 07's turns are +0.1167 above bare and within +2. The gap is expected for a cached reference: recall delta supplies the comparison. It is not a reason to buy another bare arm. The gate is noninferiority within a range, not proof of an improvement.

The current gate explicitly excludes judging from its cost ratio. My previous report's attribution of the old cost ratio to “including judging” was incorrect: actual eval `costUsd` is agent cost and judging is separate. This audit uses the declared agent-only policy, and also exposes the total-spend ratio. Run 07 fails under either ratio.

The paid runs cost **$28.0653 agent + $0.9163 judging = $28.9816** together. The historical baseline cost is not newly incurred by this comparison. Run 07 would need roughly **$0.01181 less per attempt**, or **4.67% less agent spend**, to meet the 1.1× threshold at the same reference. That is a target, not a prediction that a byte cut achieves it.

### Tails

| Tail metric | Bare | 06 | 07 |
|---|---:|---:|---:|
| Harness turns p95 / max | 19.05 / 21 | 17 / 20 | 20.05 / 26 |
| Model requests p95 / max | 12.05 / 16 | 13.05 / 14 | 15.05 / 20 |
| Wall seconds p95 / max | 160.45 / 204 | 84.05 / 95 | 91.85 / 124 |
| Peak context p95 / max | 57,319 / 60,776 | 58,902 / 68,833 | 67,036 / 73,765 |
| Tool bytes p95 / max | 85,720 / 93,434 | 75,218 / 100,315 | 91,663 / 109,736 |

Run 06 has the best measured cost/turn tradeoff. Run 07 raises tails as well as means. The large historical bare wall tail shows why a 59→48 second mean should not be attributed entirely to the plugin: host/API timing and day-to-day conditions are uncontrolled. Cost, output bytes, and requests are more useful for diagnosing the wording than wall alone.

### Noise and uncertainty

Bare repetition mean recalls are 0.52282, 0.49274, 0.46729; range **0.0555273**. Run 06's range is **0.0233050**; run 07's is **0.0344368**. The gate's 0.056 band is consequently driven by bare.

As feedback says, both observed recall gains are inside that band. But this range is not a confidence interval, and applying the same suite-level range to every case is not a case-specific significance test. “Beyond the band” is a reporting heuristic.

A supplementary deterministic case-blocked bootstrap of observed case means gives:

| Comparison | Recall delta | Conditional 95% interval |
|---|---:|---|
| 06 − bare | +0.02617 | −0.00286 to +0.05864 |
| 07 − bare | +0.03504 | +0.01163 to +0.05991 |
| 07 − 06 | +0.00887 | −0.01981 to +0.03599 |

These intervals resample the 20 observed case means, use the same cached observations, and exclude within-case sampling uncertainty. They are descriptive sensitivity evidence, not a replacement acceptance policy or proof of general production gains. The 07-versus-06 recall interval includes zero; its cost increase is consistent across case resampling. The widening-band design still deserves correction: an unstable treatment can otherwise enlarge its own allowable loss. Use a fixed declared tolerance, case-matched comparisons, and a separately reported uncertainty/variance measure.

## What the earlier fixes accomplished

| Earlier issue | Current evidence | Status |
|---|---|---|
| Shared newer tree vs historical ticket | Preset generator uses each ticket's implementation base, whole-tree git archive, and separate existing/created/deleted truth. | **Addressed in the new dataset design.** Historical changed-file necessity is still an oracle limitation. |
| Repeated bare runs / loose baseline discovery | One v2 lock; source hashes validated; shared resolver used by score/gate/report; no bare arm rerun for 06/07. | **Addressed.** Effort, scaffold/config/profile, executed bundle, and scorer identity remain unpinned. |
| Optional review automatically accepted | Eval decision table explicitly skips optional task review; core review remains enabled for a review suite. | **Addressed statically.** Not exercised by these investigate-only runs. |
| Batch reading lacked a concrete API | Reader has validated paths, spans, truncation messages, and ledger receipts. | **Implemented.** Adoption increases, but root mismatch and work expansion are measured failures. |
| Serialized-map truncation controlled delivered leads | Delivered leads now come from full ranking; paths take priority; bytes/hash/path receipt exists. | **Addressed structurally and verified in 120 payloads.** Ranking remains weak. |
| Seven stale terminal tails | All 120 plugin attempts have terminal exports, explicit exits, exported notes, and matching note hashes. | **Addressed in these runs.** Export failures are still partly silent in code. |
| Mixed Bash reads invisible | Read segments and model-request grouping now exist. | **Improved.** Compound helper commands, cwd, globs, and path-versus-span revisits remain heuristic. |
| Misleading Skill-fired count | Typed routes demonstrably launch 120/120 while gate prints zero Skill tool calls. | **Still misleading wording.** Rename/measure activation. |
| Precision/F1 hidden by perfect pass | Deterministic scores available, but 180/180 host attempts still pass. | **Still unresolved as a release-quality claim.** Gate has no precision/F1 guard. |

This is real progress in correctness and observability. It does not establish that every issue from the earlier report has been fixed, or that every layer is now covered.

## Eval/reporting layer: new dataset, remaining ruler defects

### Base snapshots are now appropriate

[preset-cases.mjs](../../../evals/scripts/src/cases/preset-cases.mjs), `writeCase`, selects the recorded implementation base and refuses a conflicting fixture commit. [base-scaffold.mjs](../../../evals/scripts/src/cases/base-scaffold.mjs) archives the whole tree rather than only source. This restores manifests and configuration needed to understand project behavior and avoids exposing later implementation history.

The budget replay reads git objects at those bases; successful captured file headers resolve against that content. This is stronger than the earlier shared snapshot. However, the scaffold copies the benchmark project's `.ambicode/config.yaml` separately, and the lock does not hash the scaffold or that configuration. Current case hashes in [case-manifest.json](case-manifest.json) document this audit, not the exact scaffold bytes served by each historical run.

### The report silently discards a top-level-file truth list

[run-report.mjs](../../../evals/scripts/src/analysis/run-report.mjs), `fileTruth` before `analyzeResult`, accepts a truth list only if **every** string contains `/`. The analytics case includes `package.json` and `tsconfig.app.json`, so its entire nine-file truth becomes empty in report diagnostics. Main preset scoring still knows those files; the defect is in reporting's independent truth classification.

Consequences measured here:

- Reports say **18 zero-truth attempts / six cases**. Corrected raw-map analysis says **21 / seven**, adding `be-vs-5075`.
- Its named-file, true-read, map-missed, and outside-map diagnostics are omitted or underestimated.
- Corrected outside-map counts are **54/60 attempts, 414 occurrences** in 06 and **54/60, 447 occurrences** in 07, rather than the report's 51/60 and 402/435. These are path occurrences across answers, not distinct files or proof of reads.

The preset scorer already enables root bullets through `namedFiles(..., {bareBullets: true})` and already provides role-split recall. Reporting calls the default helper and omits those split metrics. A small reproduction in `audit.json` shows the default helper ignoring a canonical `package.json` bullet while the preset helper recognizes it. **Do not describe this as a main preset gate bug**; use the already existing preset contract in reporting and diagnostics.

Change ownership: `run-report.fileTruth`, `analyzeResult`, `toolFiles`, metric rendering, and the shared extraction functions in [bench-score.mjs](../../../evals/scripts/src/analysis/bench-score.mjs), lines 37–86. File identity should be determined by case kind and valid strings/catalog, not the existence of a slash. Also retain the earlier caveat: unique suffix normalization against truth can be optimistic compared with resolving against the entire repository.

### Bare context is recoverable; the standard report loses it

The v2 lock combines investigate, plan, task, and review sources. `lockedBaseline.file` is their paths joined with ` + `. [run-report.mjs](../../../evals/scripts/src/analysis/run-report.mjs), `buildReport`, around lines 704–708, treats that combined display string as one file path when finding baseline traces. The report therefore marks bare model requests/context/read metrics unmeasured even though the investigate trace directory is present.

Loading the matched source directly recovers all 60 bare traces. The actual first-context overhead is **+2,824 tokens in 06 and +2,977 in 07**, above the existing 2,500-token observation target. The report's gap is honest about its missing measurement, but the gap itself is avoidable. Thread per-source trace directories through the resolver/result rows; separate a human display label from a filesystem location.

The new wording does not explain the entire first-context difference. Step text, map, host framing, skill/session instructions, and cached system context all contribute. Do not equate a map's ≤1.6 KB projection with the roughly 3k-token initial overhead.

### Previous-run comparisons still mix incomparable populations

Baseline selection is improved. Previous-run selection still admits any earlier plugin run sharing a case. `findingsOf` averages all previous with-arm rows without first matching cases and kinds. Run 07 consequently claims an improvement against the eight-case, multiple-skill walk run 05, while its localization table shows only two previous localization attempts. The “0.529 vs 0.469” finding is not a 20-case investigation regression/improvement comparison.

Ownership: [run-report.mjs](../../../evals/scripts/src/analysis/run-report.mjs), `findComparisons` at line 333 and previous-primary loop around line 453. Require same model/effort/prompt treatment and score kind; compare the explicit case intersection with matching weights; display coverage and refuse a release verdict from an unrelated mixed-skill average. The 06→07 comparison is well matched; the generic 05 finding is not.

### Perfect pass, role metrics, and historical file necessity

All **180** matched attempts pass the host grader. [preset-cases.mjs](../../../evals/scripts/src/cases/preset-cases.mjs), `fileGraders`, still requires at least one merged truth file, plus no-edit/peek checks. This is a useful behavioral floor, not comprehensive localization.

The new oracle has **442 touched files: 391 existing-at-base and 51 created**. Nine deleted files are a subset of existing-at-base, not nine additional files. Exact proposed filenames can be underdetermined by a ticket. Some changed files can be incidental maintenance. A large changed set, such as 69 FE files, is not automatically 69 essential owners discoverable from a few requirements.

The existing scorer already computes separate recalls; this audit exposes them:

| Role recall | Bare | 06 | 07 | Denominator |
|---|---:|---:|---:|---|
| Existing-at-base | 0.5307 | 0.5587 | 0.5637 | All 20 cases |
| Created | 0.2952 | 0.3433 | 0.3214 | Nine cases with creations |
| Deleted | 0.2778 | 0.2778 | 0.5278 | Two cases with deletions |

The means use only cases where that role exists. They should not be summed or weighted as if all had the same denominator. `fe-vs-5164` finds its one existing truth file but has three proposed creations; 0.25 aggregate recall is not the same problem as missing three existing owners. Conversely, `be-vs-6140` has recall 1.0 but precision about 0.510 in 07 versus 1.0 bare, revealing unnecessary additions that the saturation label hides. Do not discard “saturated” cases solely because recall is high; they can still reveal precision and cost regressions.

Add role/necessity metrics to standard reporting using the existing scorer. Keep measured historical-file recall as one view, and audit essential/supporting/incidental obligations. Clarify the route's existing-file instruction against the eval request to distinguish creations/deletions. Prefer obligation coverage for proposed artifacts when exact filenames are not specified. These improvements can rescore saved answers and cached bare evidence offline; they do not require repeating the model just to fix a report.

## Search and delivered evidence

### Projection receipts work; useful coverage remains low

Both runs have the same 20 distinct delivered-map hashes, repeated consistently for each case. **120/120 delivered payloads match their receipt hashes**, with no mismatch. This confirms the projection fix rather than merely assuming a top-20 ledger equals model context.

Ownership: [map.ts](../../../src/modules/search/text/map.ts), `MapResult.ranked`, `leadsOf` around line 470; [common.ts](../../../src/skills/common.ts), map handler around lines 149–161. The handler records original ranking, serialization count, and delivered paths/bytes/hash. It preserves paths before trimming terms/reasons and no longer makes full-JSON truncation determine visible leads.

Measured actual-run coverage:

| Map measurement | Both runs |
|---|---:|
| Delivered macro recall | **0.2130** |
| Ranked top-20 macro recall | **0.2580** |
| Delivered micro recall | **34/442 = 0.0769** |
| Ranked top-20 micro recall | **48/442 = 0.1086** |
| Mean delivered path precision vs historical truth | 0.1928 |
| Cases with zero delivered truth | **7/20** |
| Cases with zero ranked-top-20 truth | **6/20** |
| Delivered map bytes, min–max | 557–1,389 |

The map can exceed 1,200 total bytes because the feature line has a separate allowance; that range is not itself a cap failure. Historical creation paths cannot be found in a pre-change catalog, so micro recall across all touched files is not the sole map acceptance metric. However, six cases still have zero truth in the ranking, including cases containing many existing truth files. That cannot be fixed by increasing the projection budget alone.

Seven delivered-zero cases are `be-vs-4835`, `be-vs-5075`, `fe-vs-3571`, `fe-vs-5948`, `fe-vs-6086`, `fe-vs-6141`, and `fe-vs-6292`. The report misses analytics. Some contain correct owners deeper in the rank, while others miss them completely. Keep ranked coverage, projected coverage, and model utilization as separate failures.

### Wrapper words and synthetic identifiers still dominate weak queries

The prompt-word fix helped in its saved offline experiment, but a blacklist cannot reliably identify the request boundary. Current maps show:

- `be-vs-6015`: a quoted Chinese email date comes first; `request, code, role, path, mark, snapshot, commands, explicit, working, directory` take almost all remaining term slots. Pass 2 replaces terms with permission helper names. The user request is identifier-poor, but the pipeline also actively injects wrapper noise.
- `fe-vs-6292`: `request, code, validation, Cycle, fields, value, role, path, mark, snapshot, commands, explicit` become route/query-parameter helpers in pass 2. No historical truth is ranked.
- `be-vs-4835`: generic epic formatting and prose compounds (`ML-generated`, `single-effort`, `_before_`, `_all_`) lead toward HAL/RSI mocks rather than the requested LM-Lower ownership.
- `fe-vs-6086` and `fe-vs-5948`: synthetic requirement IDs such as `FR-MA-ENG-30A` or `FR-NOM-ENG-42A`, and generic hyphenated prose, consume identifier slots despite not naming repository code.
- `fe-vs-6141`: proposed i18n keys and broad ReportService declarations lead to unrelated report/scoring service code, while the actual template/indicator families are missing.

Ownership: [map.ts](../../../src/modules/search/text/map.ts), `cleanRequestText`, `REQUEST_WORDS`, `rankTerms`, and pass-2 term construction; [common.ts](../../../src/skills/common.ts), passing the whole argument source into term ranking. `cleanRequestText` removes markup but not the text outside `<ticket>`. `IDENTIFIER` treats a hyphen/slash as identifier evidence; the second pass inserts up to six harvested names into a 12-term budget.

Use structured requirement/request sources where available, preserving ticket text separately from host/eval instructions. A wrapper boundary should be represented as data, not inferred through an ever-growing list of forbidden English words. Classify exact code identifiers, proposed names, requirement IDs, UI strings, and ordinary prose separately; preserve requested domain/module constraints through expansion. Validate whether harvested names add ownership evidence or only reinforce a wrong neighborhood. Identifier-poor cases should receive a bounded semantic/discovery fallback rather than an authoritative map of generic matches.

### Profiles, file families, and frequency handling remain missing

Every map still reports **profile null, index none**, and the default two-shortlist sequence. Main shortlisting excludes tests/styles/markup/data. That is especially limiting for UI templates, consumers of indicator components, catalogs, locale propagation, schema/type companions, and targeted specs. Generic declaration harvesting cannot substitute for measured companions/catalogs and ownership relationships.

Every case gets a single-commit scaffold. Co-change therefore has no useful historical signal. This is appropriate for withholding future history, but it means current results do not measure the history layer's potential. If history/profile/index are evaluated, supply pinned, pre-base facts; do not expose the implementation merge.

The 200-match content cap still precedes breadth/specificity calculations. Saved maps explicitly report broad `code`, `path`, or generic `dialog` matches being cut to 200. Those are evidence that the old concern remains relevant, not just an abstract source suspicion. Preserve full frequency or a saturation flag before weighting; separately bound scoring/output.

Owners: [locate.ts](../../../src/modules/search/text/locate.ts), `contentMatches`, breadth/specificity, shortlist rules and companions; [profile.ts](../../../src/modules/search/declarations/profile.ts), `buildProfile`; map catalog/key and feature expansion. Prefer data/profile-driven companion discovery and bounded imports/consumers over forcing all candidates into the reader. No measured result here requires LSP as the first fix.

### Latency remains concentrated in shortlist work

Mean map-layer time is **2.508 s in 06 and 2.486 s in 07**, about unchanged. Average route-ready times are **3.132 and 3.161 s**. Fourteen attempts in 06 and twelve in 07 exceed five seconds: only **76.7% and 80.0%** meet the five-second observation threshold, below the training goal of 90%. The maps' p95 layer sums are 5.479 and 5.965 seconds; 07's maximum is 7.138 seconds.

Two shortlists account for virtually all map time; declaration harvest is a few milliseconds. Instrument per-invocation git time/count, reuse a request-local file catalog/grep/history cache between passes, and measure without changing ranking simultaneously. CLI reader process/record overhead is additional, but the nearly unchanged map time cannot explain the 06→07 cost increase.

## Reading behavior: adoption improved, efficiency did not

| Reading measurement | Bare | 06 | 07 |
|---|---:|---:|---:|
| Model requests containing reads | 238 | 228 | **295** |
| Single-path read requests | 87 | 78 | **102** |
| Singleton share | 36.6% | 34.2% | **34.6%** |
| Inferred paths per reading request | 2.15 | 2.23 | 2.41 |
| Helper attempts | 0 | 27 | **104** |
| Helper attempts per run | 0 | 0.45 | **1.73** |
| Attempts trying helper | 0 | 18/60 | **46/60** |
| Attempts receiving a nonempty helper result | 0 | 16/60 | **43/60** |
| Successful helper executions/receipts | 0 | 22 | **96** |
| Helper-first tool calls | 0 | 8 | **34** |
| Helper-first calls returning source | 0 | 7 | **19** |
| Direct Read tools | 65 | 36 | **2** |
| Bash cat-class calls | 41 | 20 | **37** |
| Bash grep-class calls | 321 | 333 | **351** |
| Native Grep tools | 114 | 85 | **58** |

“Read almost disappears” is true for the native tool. “The model now reads in one efficient turn” is not. Combined Bash/native search counts barely change, **418→409**, while helper calls and reading rounds multiply. Native Grep falls, but Bash grep and cat increase. Two native Reads and many cat/sed reads remain despite the new ban.

A helper attempt may be blocked before execution, return only per-file refusals, or combine other operations. Count adoption, successful execution, nonempty evidence, and useful truth/owner evidence separately. A first helper tool is not proof the model consumed it before a parallel search. Nineteen actual source-producing first reads is much less than the apparent 34.

The old 46% singleton figure came from another dataset and operand parser. The appropriate new baseline is **36.6%**, not the old 46%; stronger wording barely changes this share versus 06. Some singleton reads are appropriate when one new dependency is discovered. The goal is fewer avoidable dependency waves and irrelevant bytes, not mechanically eliminating singleton requests.

### Reader repository and task-ledger roots disagree

`07 / be-vs-5071 / e-iGjP0t` starts with a literal helper call naming valid `src/...` paths while the shell is in the eval parent directory. It returns five `not found` headers. After `cd /private/tmp/e-iGjP0t/home/cwd/repo`, related paths are found/read. Similar first-call failures occur in 12 other attempts, producing **41 of the 47 refusals**.

[search.ts](../../../src/cli/commands/search/search.ts), `runRead` around lines 115–129, calls `openRepository(runtime)` with shell cwd. [open.ts](../../../src/platform/git/open.ts) selects the git top level from that cwd. But `record()` uses [task-dir.ts](../../../src/modules/evidence/task/task-dir.ts), `resolveTaskDir`, which uses the session-repository discovery seam and can select the configured child repository. The ledger can thus record the attempt on the correct task while the reading itself searches a different repository.

Fix this through the existing seam: for a task-bound read, resolve the same route/session repository used by the task, verify ownership, and read from that repository root. Keep cwd-relative semantics explicit and boundaries checked. A standalone read can retain an explicit cwd/repository contract. Deliver a command that runs from the resolved root, rather than trusting an unstated `cd` prerequisite. Do not add another independent root-discovery heuristic.

Two first helper attempts instead provide unsupported Bash fields `cwd` or `workdir`, causing input-validation failures. Specify the actual host tool contract in the payload. Remaining refusals include invalid span syntax such as `path:464:500` rather than `path:464-500`, and a genuinely absent target. Those should be typed operand refusals, not mistaken for failed process execution.

### Full-file and tail reads are not bounded evidence selection

The successful captured headers cover the whole requested file in **72/80 cases in 06** and **190/269 in 07**. Some are budget-truncated; this counts requested range coverage, not proof that every line reached the model. `parseReadOperand` at [read-many.ts](../../../src/modules/search/text/read-many.ts), line 29, interprets `path:12` as **line 12 through EOF**, not a small window around an anchor. Bare paths read from line 1.

The map provides lead anchors, but the instruction does not specify bounded windows or how to select competing owners. Equal-share allocation gives several unrelated small files complete coverage while cutting a larger useful file from its beginning. The budget bounds one output; it does not bound cumulative output over multiple waves. Deduplication covers identical operands within a call, not spans previously received across calls.

Only **49 overlapping line occurrences** are observed across successful helper headers in 07. That is not evidence of extensive same-span helper duplication. The report's rise in “reread bytes” from **78,373 to 268,637** counts calls naming paths already seen, and can label a new needed span as a reread. Treat it as a path-revisit proxy. A receipt-aware metric should record actual served spans and overlap across all reading tools.

Use a concise reading contract: select likely owners and companions; request bounded spans around anchors; read independently known spans together; search first when the map's owner evidence is weak; make another wave only for an identified dependency. A per-investigation evidence budget and reuse receipts are more useful than forcing every map lead open or banning native tools regardless of the situation.

### Guard and shell failures remain outside route-gate coverage

Both runs have **eight recorded permission denials**, involving opaque `$R`/`$A` executable variables. The guard correctly refuses a command it cannot interpret. Run 07 also has invalid Bash parameters and command/cwd mistakes. Native AskUser count and route headless-default count are both zero; that does not mean every tool operation was authorized or successful.

Ownership: [guard-core.ts](../../../src/hook/guard/guard-core.ts), around lines 235–239; `eval-answers.mjs` is not responsible for arbitrary tool permission decisions. Preserve the guard. Render/instruct literal supported CLI invocations; avoid executable shell aliases. Record these refusals separately from route human-gate coverage. The wording's longer literal helper command should not encourage the model to invent a denied alias to shorten it.

Matched tool results contain xcrun/Xcode cache/event-stream errors in **62 bare, 41 run-06, and 38 run-07 calls**. Some commands still produce useful stdout. Do not equate these strings with full tool failures, but include their bytes/latency as host-environment noise. Repeated shell cwd assumptions and unquoted zsh glob options also remain observable. Improve the eval's declared shell/git environment and command examples rather than changing recall thresholds to hide them.

## What caused the cost increase, and what remains uncertain

The evidence confirms more context traffic and output; it does not isolate one causal treatment beyond the sequential wording comparison.

| Traffic measurement, per attempt | 06 | 07 | Change |
|---|---:|---:|---:|
| Cache-created input tokens | 32,228 | 37,396 | +16.0% |
| Cache-read input tokens | 198,634 | 249,417 | +25.6% |
| Output tokens | 3,834 | 4,597 | +19.9% |
| Model requests | 7.68 | 8.67 | +12.8% |
| Reading requests | 3.80 | 4.92 | +29.4% |
| Tool-result bytes | 39,886 | 50,170 | +25.8% |

Helper-containing Bash results grow **315,899→1,031,381 bytes** across the suite. All tool output grows **2,393,160→3,010,199**, or **617,039 bytes**. The helper-containing category contributes more than the net increase because other categories partially shrink. Actual recorded reader-module output grows **304,397→1,014,435 bytes**. This is strong evidence of additional source injection, but mixed commands and pipes prevent assigning every Bash byte to the helper alone.

Using the report's saved diagnostic token rates, the additional cache writes account for about **$0.02067/run**, repeated cached reads **$0.01016**, and output **$0.00764**: about **$0.03847**, close to the actual **$0.03868** increase. These are diagnostic allocations, not an authoritative new pricing lookup. Actual eval billing remains the gate value. Cache-read totals sum repeated requests; they are not one 249k-token context window.

The reader's mean Bash result actually decreases, **11,700→9,917 bytes**. The problem is not simply larger individual average batches: many more batches and follow-up requests occur. Likewise, output grows by 764 tokens per attempt; a file-byte cap does not directly control that answer/command output.

### Case evidence against a single “large reader result” explanation

- **FE-6141:** mean cost $0.418→$0.495; model requests 13.33→17.33; helper output only about **3.3 KB/run** in 07. The worst attempt, `e-MRoGwd`, costs **$0.58584**, has 26 host turns/20 model requests and peak context **73,765**, but its sole helper output is **7,086 bytes**. The rest is a long template/indicator/catalog/consumer search chain. The model correctly discovers much that the map misses, but the discovery is expensive.
- **FE-5948:** cost $0.302→$0.398; requests 12.67→14.67; helper output about **2.1 KB/run**. `e-8XuSAf` costs **$0.46276** and never uses the helper. It reads a report-table family through native Read/cat and mixed grep/sed, including a 21,675-byte cat result. Lowering the helper cap does not bound that evidence.
- **BE-4606:** cost $0.267→$0.325 while requests barely move, 8.33→8.67. Helper receipts add roughly **30.2 KB/run**, and peak context rises 44,189→54,030. Here source-volume reduction is a plausible and directly relevant intervention.
- **BE-5973:** cost $0.188→$0.263 with recall **0.869→0.833**. New helper output is roughly **18.3 KB/run** and peak context rises 33,283→46,003. More reading fails to buy better localization on this case.

No single mechanism explains every regression. Address root failures, broad searches, answer expansion, and evidence volume separately. The failed wording makes some behaviors more measurable, but it is not a proven net improvement.

## Free replay: 24 KB versus 16 KB, 12 KB, and 8 KB

The replay uses immutable pre-change git content for the canonical valid spans in the saved helper headers. It covers **21 successful-header calls in 06 and 83 in 07**, reading 163 distinct base/path objects. It excludes 27 attempted helper calls with no valid headers, original path refusals, shell pipes/mixed operations, and future model decisions. No scaffold, app, build, or model ran.

For 07's same 83 successful batches:

| Reader budget | Output bytes | Files truncated | Calls with truncation | Lines served | Lines from historical truth files |
|---|---:|---:|---:|---:|---:|
| 24,000 | 1,007,656 | 28 | 13 | 27,187 | 15,985 |
| 16,000 | 861,900 | 53 | 27 | 23,063 | 13,722 |
| 12,000 | 738,666 | **72** | **35** | 19,650 | **11,511** |
| 8,000 | 566,122 | 111 | 49 | 14,697 | 8,273 |

At 12 KB, deterministic output falls **26.7%** versus the 24 KB replay. All 128 historical-truth file occurrences still receive some lines, but truth-file line coverage falls **28.0%**. Some lines from a correct file are not proof that the relevant function or template was received. Truncation increases by 44 file occurrences and 22 calls. Additional paging or searches could consume the savings; the replay cannot measure that response.

The 24 KB reconstruction differs slightly from recorded receipts because it excludes refusal headers and reconstructs canonical spans before shell piping; it is not a byte-for-byte replay of every original command. The table supports a budget tradeoff, not a guaranteed cost forecast.

Therefore:

1. A smaller budget is a useful free experiment for volume-heavy BE batches.
2. It does not affect the small helper calls in the two worst FE cost cases.
3. A global 12 KB change is not justified as the first complete fix. Start with root correctness, relevance, and explicit windows; test 12/16 KB as alternatives after those constraints.
4. A paid confirmation, if later chosen, should run the plugin arm against the same compatible lock. This report does not require that run.

Static reader edges also need tests when changing the budget: headers/refusal lines always print even when a very low budget leaves no body space; the CLI allows budgets down to one byte, so the parameter is not an absolute cap on arbitrary headers. Unique-suffix fallback should run the same realpath/boundary checks as direct resolution. Those are current-code coverage risks, not demonstrated causes of these paid regressions.

## Per-case results and action priorities

Map hits below are actual delivered historical-truth hits, corrected for the dropped analytics diagnostics. Requests are mean model/API requests in 07. Cost ratio is agent spend to cached bare.

| Case | Truth | Map hits | Bare recall | 06 recall | 07 recall | 07 precision | Cost ratio | Requests |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| be-vs-4606 | 12 | 2 | 0.972 | 0.972 | 0.917 | 0.921 | 1.42× | 8.7 |
| be-vs-4835 | 20 | 0 | 0.633 | 0.600 | 0.600 | 1.000 | 1.20× | 7.7 |
| be-vs-5071 | 4 | 2 | 0.917 | 1.000 | 1.000 | 0.490 | 0.88× | 7.0 |
| be-vs-5075 | 9 | 0 | 0.407 | 0.444 | 0.444 | 0.700 | 1.12× | 9.0 |
| be-vs-5721 | 5 | 3 | 0.600 | 0.600 | 0.600 | 0.917 | 1.00× | 4.3 |
| be-vs-5928 | 6 | 4 | 1.000 | 1.000 | 1.000 | 0.794 | 1.29× | 6.7 |
| be-vs-5941 | 7 | 1 | 0.619 | 0.762 | 0.714 | 0.889 | 1.11× | 5.3 |
| be-vs-5973 | 28 | 5 | 0.690 | 0.869 | 0.833 | 0.888 | 1.16× | 7.3 |
| be-vs-6015 | 4 | 1 | 0.583 | 0.500 | 0.583 | 0.429 | 1.13× | 11.0 |
| be-vs-6140 | 3 | 3 | 1.000 | 1.000 | 1.000 | 0.510 | 0.84× | 5.0 |
| fe-vs-3571 | 69 | 0 | 0.213 | 0.232 | 0.295 | 0.746 | 1.32× | 11.7 |
| fe-vs-438 | 14 | 3 | 0.429 | 0.595 | 0.429 | 0.626 | 1.19× | 6.3 |
| fe-vs-5164 | 4 | 1 | 0.250 | 0.250 | 0.250 | 0.118 | 0.87× | 8.3 |
| fe-vs-5948 | 29 | 0 | 0.207 | 0.310 | 0.276 | 0.468 | 1.34× | 14.7 |
| fe-vs-5967 | 36 | 6 | 0.176 | 0.167 | 0.185 | 0.569 | 0.96× | 10.0 |
| fe-vs-6086 | 34 | 0 | 0.294 | 0.255 | 0.284 | 0.432 | 1.15× | 13.0 |
| fe-vs-6141 | 67 | 0 | 0.413 | 0.383 | 0.398 | 0.796 | 1.47× | 17.3 |
| fe-vs-6292 | 44 | 0 | 0.182 | 0.182 | 0.258 | 0.855 | 1.10× | 9.3 |
| fe-vs-6404 | 26 | 2 | 0.205 | 0.192 | 0.282 | 0.853 | 1.29× | 5.3 |
| fe-vs-6406 | 21 | 1 | 0.095 | 0.095 | 0.238 | 0.944 | 1.16× | 5.3 |

Concrete priorities by family:

- **LM override / BE-4606 and 4835:** preserve domain ownership, model/router/validator companions, and explicit creation obligations. Eliminate generic HAL/RSI drift; test small anchored batches. BE-4835's perfect precision but 0.6 recall suggests missing coverage, not a need for speculative extra files.
- **Analytics / BE-5075:** fix report classification first; deliver analytics API/controller/test ownership instead of GE-ADV input validators. Its recall is stable while the map remains wrong; more initial schema reading is wasted.
- **Org flags / BE-5071:** retain cost/recall gains, fix first-call cwd failures, and distinguish necessary org flag targets from speculative supporting files. Recall 1.0 with precision 0.49 is not perfect localization.
- **Auth and validators / BE-5721, 5928, 5941:** map mostly useful; prioritize missing actual request roles and reduce volume on already-solved cases. BE-5928 stays recall 1.0 while cost rises to 1.29×.
- **BE-5973:** protect the good 06 result; the forced-reader variant regresses recall and cost. Check whether whole-file requests add relevant validators/helpers or merely more context.
- **Identifier-poor BE-6015:** extract the actual business request from wrapper/email noise and allow a bounded targeted discovery wave. Recovering bare recall in 07 does not validate its polluted map or low precision.
- **NIOSH / BE-6140:** preserve cheap execution but add a precision/assumption guard. Its saturated-recall flag conceals substantial extra naming.
- **FE UI/component families / 3571, 5967, 6141:** profile-backed template/catalog/consumer relations and efficient discovery are the levers. Cap changes must apply to relevant evidence across tools, not only helper calls. Audit role obligations and deprecated/deleted template paths.
- **Employee select / FE-438:** run 06 recall ranges 0.5 across attempts; 07 returns to bare mean and costs more. Improve existing UI/template/catalog propagation coverage and examine output assumptions; no stable wording win is established.
- **NOM/report preview / FE-5948:** report-table ownership matters more than NOM score-card leads. The expensive no-helper trace demonstrates that larger instructions can coexist with unbounded native reading/search.
- **Manual assessment / FE-6086:** upload-neighborhood leads miss report-table/solution flow owners deeper in the rank. Preserve request-role constraints when expanding and check actual paired templates/types.
- **FE-6292:** fix prose fallback and generic route-query drift. The new answer gain is model recovery, since ranking has zero truth.
- **Upload/navigation and location behavior / FE-6404, 6406:** answer gains with limited useful map support; keep their high precision while reducing extra reads and capturing requirements per owner. Smaller simple cases remain useful latency/precision regressions, even when large cases dominate cost.
- **FE-5164:** expose existing-versus-creation scores and challenge unnecessary extras. Do not treat a one-of-four result as equivalent to missing three existing files.

These are trace-supported investigation priorities, not proposed product code edits in the benchmark projects.

## Harness, hooks, gates, stability, and artifacts

The successful terminal export is one of the clearest improvements. All **120 plugin attempts** have a trusted hook-launched investigate route, an explicit final exit, an exported note, and a note body whose stored hash matches the ledger. Every export's entry count matches its exported ledger. There are no recorded export failures. This removes the old need to infer closure from a stale copy.

Ownership: [stop.ts](../../../src/harness/engine/stop.ts), `exportForEval` around line 377; [trace-analysis.mjs](../../../evals/scripts/src/analysis/trace-analysis.mjs), `harvestExports` around line 286; [evals-bench.mjs](../../../evals/scripts/src/harness/evals-bench.mjs), export environment and harvesting. SessionEnd can append bookkeeping after a Stop export; distinguish terminal route closure from the very last host event rather than requiring those counts always equal.

The export still silently catches individual note-copy failures before writing `source.json`. A future source list can claim a note whose copy is absent without an export-failed line. Change the export manifest to record each file's presence, size/hash, copy outcome, and finality; ensure it is written atomically after required artifacts. This is a current-code risk; no missing or bad-hash note was found here.

Each run has one observed Stop block and all attempts ultimately close. Keep the bounded correction loop and full-answer replacement. Citation checks are structural and once-only after a block; they do not prove semantic support, and this audit does not claim that every final citation is valid. No crash/resume/compaction/concurrent-owner test follows from these successful terminal paths.

No AskUser calls or route headless defaults occur. Scope is skipped on nonempty maps, including the seven oracle-empty cases. Therefore the claim that eval answers “covered every question” is vacuous for these routes: no route question was reached. It does not test acting preanswers or optional task review, and it does not cover the eight tool permission denials in each run.

[eval-answers.mjs](../../../evals/scripts/src/harness/eval-answers.mjs) correctly implements your semantic policy: Accept/apply/implement for requested workflow gates, and skip optional task review with verification incomplete. Dedicated review still runs. Scope and budget have no preanswer and would produce a declared gap if defaulted. Keep that behavior; a scope gate needs a real selector, and budgets must remain bounded. Do not globally change production defaults or disable the guard.

The gate's `skill fired 0/60` still counts native Skill calls. All typed investigations route without that tool. Replace the phrase with separate typed-hook activation and native Skill-tool counters. It is misleading to present zero as failed activation.

One model-step delivery per investigation continues to work. Host turns and API requests occur inside it; v7's `modelSteps` budget does not promise a tool-loop cap. The stale training `toolTurns` descriptions should be removed. If cumulative read/search cost needs enforcement, define a separate receipt/request budget with an explicit incomplete exit instead of pretending the model-step limit already supplies it.

## Every layer: what is exercised, weak, or unknown

Training layers are tuning surfaces; source dependency layers remain platform → modules → harness → skills → composition → hook → CLI/testing, as enforced by [architecture.test.ts](../../../src/architecture.test.ts). Changes below should use existing downward seams.

| Layer | Evidence and assessment | Responsible next change / coverage limit |
|---|---|---|
| **L0 host/model/tool loop** | Both models pinned; bare traces recovered. API/wall timing varies; unsupported Bash fields and xcrun noise observed. | Persist effort/tool schema/environment; explicit cwd command examples; separate host noise from plugin attribution. |
| **L1a lifecycle hooks** | 120 typed routes start; UserPromptSubmit receipts verifiable; terminal exports exist. | Initial context exceeds observation target; activation label misleading. Compaction/resume and crashes untested. |
| **L1b Stop** | Explicit closure and matching note hashes in all 120; one block per run resolves. | Per-file export errors can be swallowed; structural/once-only citation validation limited. Export manifest must expose unresolved status. |
| **L1c AskUser capture** | Zero unanswered route defaults; semantic eval table exists. | No acting gate actually exercised. Tool permission denials are separate and must not be called covered questions. |
| **L1d MCP capture** | Local ticket prompts avoid external fetch work. | No MCP fetch/capture case here; savings/trust behavior remain unmeasured. |
| **L1e PreToolUse guard** | Eight permission denials each; guard prevents opaque executable-variable commands. | Deliver literal supported CLI examples; report refusals; preserve guard authority. |
| **L2a shared instructions** | Args/AC deduplication retained; explicit route launch works. | +2.8–3.0k first context, above current observation bar. Measure contract/host/payload contributions separately. |
| **L2b reviewer role** | No optional reviewer spend during investigate. | Review quality/cost not measured; do not infer coverage from investigate pass. |
| **L3 harness engine** | One code-grounded model step; trusted route owner and automatic Stop save work. | Reader execution uses a different root seam from task recording. Model-step budgets do not bound within-step loops. |
| **L4a requirements** | Proper pre-change cases; local normalization avoids duplicate prompt injection. | Wrapper/forwarded-email text pollutes search source. Represent actual ticket boundary and role obligations explicitly. |
| **L4b search/profile/map/read** | Projection fixed and stable; reader API/receipts work on valid execution. | Seven bad delivered maps, six bad rankings; absent profile; 47 operand refusals; broad/full-file evidence. Fix intent, root, ownership, spans, and repeated scans. |
| **L4c index/dependents** | Index-free workflow completes. | No index/dependents comparison. Target UI consumers/imports offline before choosing heavier tooling. |
| **L4d policy** | Stages run without unnecessary investigation rules. | Task/check rule applicability and enforcement untested. Zero injected rules is not universal policy success. |
| **L4e checks** | No unsolicited application diagnostic during investigation. | Red/green/test selection, check consent, environment failures not covered by these runs. |
| **L4f review** | Investigate remains cheap relative to always-on review. | Dedicated review and optional-review skip semantics are code-reviewed only, not exercised here. |
| **L4g evidence/workers** | Notes/export bodies match hashes; helper calls recorded. | No worker/plan promotion results; maps and native reads still need distinct navigation/evidence receipts. |
| **L4h config/defaults** | Deterministic defaults and real base manifests available. | Copied config unpinned, measured profile null, standalone read budget defaults not a session evidence limit. |
| **L5 routes** | Investigation sequence stays small; no duplicate preparation ceremony. | Nonempty irrelevant maps bypass scope; no independent loop budget. Do not add steps before fixing evidence. |
| **L6 payloads** | All delivered map hashes verified; projection prioritizes paths. | Wrong leads remain authoritative-looking; command lacks an enforced root and bounded windows. Encode confidence/owner/range, not a bigger dump. |
| **L7a wording** | Tool choice responds: 27→104 helper attempts, 36→2 native Reads. | Reading rounds/cost increase; cat/mixed reads persist; first-call refusals. Replace unconditional order with concise conditional evidence policy. |
| **L7b skill bodies** | Typed investigate activation succeeds without native Skill call. | Five other skills and trigger phrasing not exercised. Remove misleading prepare-era counters from activation reporting. |
| **Eval ruler** | Locked cached sources, preset bases, role scorer, exact gate and final artifacts improve reliability. | Report drops top-level truth, loses baseline traces, mixes previous skill populations, and reports saturated pass without quality guarantees. Fix reporting before another wording claim. |

## Recommended implementation sequence

### 1. Free correctness and diagnostic fixes

- **Unify report truth/extraction with the preset scorer.** Preserve root files and role split; recompute analytics map/read diagnostics. Add the actual `be-vs-5075` metadata as a regression fixture. No paid rerun is needed.
- **Resolve baseline sources as structured paths.** Feed each source's traces to its rows; measure first-context overhead instead of generating a false unmeasured gap. Bind effort, case/scaffold/config/profile, scorer and executed bundle identity in future manifests. Keep the current immutable raw reference; do not discover a new one automatically.
- **Restrict previous-run findings to matched kinds/cases/treatments.** Remove the mixed-walk improvement claim. Report intersections and case weights.
- **Align task-bound reader root with the route's session repository.** Reuse `resolveTaskDir`/session-repository discovery. Reproduce the parent-cwd, valid-child-file failure and supported Bash contract. Retain semantic refusal receipts and boundary checks, including suffix resolution.
- **Make capture status explicit.** Atomic terminal manifest with per-note errors/hash/presence. Rename Skill-fired to actual activation measures.

These are corrections with concrete saved reproductions. Keep the existing numeric cost gate and do not weaken assertions to make 07 green.

### 2. Improve search ownership offline

- Separate request/ticket data from wrapper instructions and email metadata. Test identifier-poor cases, proposed i18n keys, synthetic FR IDs, and hyphenated ordinary prose without overfitting a longer stop-word list.
- Preserve domain and requested role constraints through pass 2; compare current two-pass, first-pass only, and constrained/diverse expansion on the same case bases.
- Measure profiles/companions/catalogs and targeted imports/consumers. Evaluate existing-owner coverage separately from unknowable proposed filenames.
- Repair full-frequency/saturation weighting and measure request-local catalog/grep/history reuse. Keep rank, projection, bytes, confidence, and latency receipts.

An observable target is to reduce the **seven** zero-useful delivered cases and **six** zero-useful ranked cases without adding speculative owners. A runtime policy cannot use truth; its confidence must come from specificity, ownership/role evidence, and disagreement. Preserve the successful auth/validator and high-precision FE gains while fixing analytics/LM/UI families.

### 3. Refine reading policy rather than enforce blind first reading

For a credible map, batch likely owners/companions with explicit bounded windows. For a weak map, allow one targeted discovery wave first. Never treat every lead as a necessary change. Keep actual served ranges and reuse them; distinguish new spans from duplicated evidence. Clarify how creations/deletions appear in the final answer and separate conditional assumptions.

A smaller 12 or 16 KB budget belongs in this experiment as an evidence-volume control, with specific checks for truncation, useful anchor retention, all-file coverage, and follow-up pages. It does not bound grep/cat, and it cannot fix root failures. A total investigation evidence budget should include every reading channel and end visibly incomplete if exhausted.

Treat the earlier 06 wording as the cheaper measured reference when evaluating a candidate. This report does not change the working-tree wording or implement a rollback. Current 07 should not be represented as gate-passing simply because adoption improved.

### 4. Confirm a coherent candidate with plugin-only runs later

Once offline evidence supports a concrete root/ownership/span policy, compare it with 06 and the same compatible bare lock. Do not simultaneously change the host/model, prompt, dataset, scorer, ranker, and wording and call the result a causal read-tool effect. A scorer/report correction can be applied to saved answers, with versioned recalculated metrics; a genuinely changed snapshot or task needs a distinct reference decision.

Measure required/conditional-file precision, existing/proposed/deleted coverage, model requests, evidence waves, relevant spans, semantic/permission failures, bytes, output, cache traffic, p95 latency/context, and terminal artifact integrity. Retain cheap saturated-recall cases when they expose precision/cost problems. Expand independent ticket/language/skill diversity separately from repetition count.

The next paid investigation should not be chosen solely to confirm that 12 KB is cheaper. It should test whether correct-root, relevant, bounded evidence restores the cost gate while preserving precision and coverage. Task, plan, review, gate binding, MCP, compaction/resume, and recovery need their own targeted coverage; this investigate audit supplies no verdict on those layers.

## Evidence that would change this recommendation

A 12 KB cap would become the primary intervention if matched traces showed the failing cost cases dominated by cap-sized helper outputs and offline windows preserved their relevant anchors without new requests. These traces show the opposite for the two worst FE cases.

Unconditional map-first reading would become persuasive if improved maps consistently supplied the actual owners, task-bound calls resolved the right repository, and a matched treatment reduced requests and total context at equal quality. The current maps and first-read failures do not establish that.

The harness direction would need revision if terminal export/save/ownership failed under realistic interruption or repeated steps. Here 120 complete, hash-verified investigation closures support retaining it. The largest demonstrated remaining gaps belong to evidence selection/consumption and evaluation reporting.

## Representative evidence links

The full per-attempt evidence index is [attempts.json](attempts.json). These saved sessions make the main diagnoses directly inspectable:

- [e-iGjP0t](../../../../ambicode-evals-assets/outputs/core/2026-10-08/07_1933_localize-ambicode-with-prompt-sonnet-5-5/traces/sessions/e-iGjP0t/babc1526-e510-4dd9-9e0e-600bff75f545.jsonl): BE-5071: first reader resolves the parent repository; valid child paths are refused before changing directory.
- [e-MRoGwd](../../../../ambicode-evals-assets/outputs/core/2026-10-08/07_1933_localize-ambicode-with-prompt-sonnet-5-5/traces/sessions/e-MRoGwd/5b4b787c-8ba9-4486-a367-1fd0cf47925c.jsonl): FE-6141: worst-cost attempt; one small reader result and an extended discovery chain.
- [e-8XuSAf](../../../../ambicode-evals-assets/outputs/core/2026-10-08/07_1933_localize-ambicode-with-prompt-sonnet-5-5/traces/sessions/e-8XuSAf/b97f2d57-cd2e-40be-a57a-1170651b8443.jsonl): FE-5948: expensive attempt with no reader helper; native and shell reading remain substantial.

Original records: [06 decision](../decide-investigate-06_1853.md), [07 wording evaluation](../wording-investigate-07_1933.md). Calculated findings above supersede their six-case map-zero count and unconfirmed reader-volume attribution.

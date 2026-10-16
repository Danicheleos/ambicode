# Session contract, notation, and route-state experiment

Investigation report, 2026-10-09. Recommendation, not an accepted implementation plan. Saved results were analyzed without running models, buying a baseline, running applications, or changing the staged experiment.

## Decision

**Keep explicit route state and a short shared operating contract. Drop the broad symbolic-language rewrite as the default optimization.** Replace its ambiguous expressions with concise, literal instructions. Retain familiar arrows or compact lists only where they save space without changing meaning.

The experiment works mechanically after a loader fix: the contract arrives, the route prints its state, investigations finish, and exported artifacts validate. It does **not** establish better quality, lower context, or lower cost. On the 19 cases with three recoverable attempts in the latest campaign, recall is **0.5644 versus 0.5746** in the preceding full run, precision **0.7016 versus 0.7046**, and agent cost **$0.25104 versus $0.24325**. The cost ratio to the matched bare lock is **1.1775×**, above 1.1×. This is a descriptive matched comparison, not a synthetic full-run gate pass/fail.

There are three separable ideas:

| Idea | What the evidence establishes | Recommendation |
|---|---|---|
| A shared startup contract | Delivered in every recorded post-change attempt; defines route behavior and evidence boundaries. Its content more than doubles in size. | Keep the mechanism; shorten the content and remove the notation tutorial. |
| Symbolic prose across skills | After correction, Sonnet follows enough to finish investigations. Before correction, one syntax collision prevents all model turns in 60 attempts. No matched cost/quality gain is established. | Drop the blanket rewrite. Use clear action fields and small conventional notation selectively. |
| A route-state line | Delivered consistently, generated from the engine's fold, and readable without reconstructing the ledger. | Keep it. Improve pending-evidence and refusal state instead of making the model infer them. |

The recommendation is about this implementation and these measurements. No result establishes that every model understands a new language without fallbacks or hallucinations. Only Sonnet 5.5 was exercised after this rewrite, and only investigation and two task cases reached model work.

## Which runs actually happened

The last complete **20-case × 3 investigation run is `05_0035`**, before the notation: its saved traces carry the 787-byte old contract and no `Route:` line. The latest attempted full notation campaign is split between `15_1241` and `16_1304`. It is not a completed 60-attempt run.

All October 9 runs below record Claude Code 2.1.292 and Sonnet 5.5. Effort `low` is stated in campaign records; the result and lock do not machine-pin it. Plugin version 0.5.1 is shared across multiple builds and cannot identify their content.

| Run | Scope | Recorded attempts | Actual outcome |
|---|---|---:|---|
| 05_0035 | 20 investigate cases × 3 | 60 | Complete pre-notation reference. Recall 0.5570; cost 1.1408× bare, fails cost. |
| 06_1010 | 10 BE investigate cases × 2 | 20 | Literal-CLI wording experiment. Cost check 1.0927× passes, but repetition minimum fails. |
| 07_1105 | 10 BE investigate cases × 2 | 20 | Zero model turns in all attempts: skill-loader failure. |
| 08_1105 | FE-5164 task × 2 | 2 | One `human/no-red`, one `inconclusive`; no recorded checks. |
| 09_1107 | BE-6140 task × 2 | 2 | Both `human/no-red`; no recorded checks. |
| 10_1109 | 10 BE investigate cases × 2 | 20 | Same loader failure; no model turns. |
| 11_1119 | 10 BE investigate cases × 2 | 20 | Same loader failure; no model turns. |
| 12_1120 | 10 BE investigate cases × 2 | 20 | Corrected notation plus guard rewrite. Cost and turns checks fail, as does repetition minimum. |
| 13_1235 | FE-5164 task × 2 | 2 | Stronger red-step warning; both `human/no-red`. |
| 14_1237 | BE-6140 task × 2 | 2 | Stronger red-step warning; both `human/no-red`. One attempt still edits production while red is unmet. |
| 15_1241 | First 15 investigate cases, targeting × 3 | 43 | Partial, `cost_ceiling`. All 43 routes close; four paid graders skipped. FE-5967 has one attempt instead of three. |
| 16_1304 | Remaining five FE investigate cases × 3 | 15 | Complete subset; recall 0.3413 vs 0.2380 bare, inside its 0.137 noise band; cost 1.2499×, fails. |

The three zero-turn sweeps record $0.244069 combined in their result `costUsd` fields. These are failed plugin deliveries, not cheap successful investigations or evidence of a recall regression by the model. Calling the sweeps “complete” only describes harness termination.

Earlier October 8/9 walkthroughs were also inspected for state/closure comparisons. October 8 `09_2132` uses CC **2.1.295** and is refused against the 2.1.292 lock. This compatibility refusal is correct; it is retained rather than bypassed.

### Recovering results hidden by the grading cap

Run 15's standard report says 43 attempts, four absent. All four have `exit:done`, complete exports, and final assistant responses. The absent paid file grader has no `evidence`, and [bench-score.mjs](../../../../evals/scripts/src/analysis/bench-score.mjs), `scoreWithAnalysis`, uses that evidence as the investigate-answer source. It therefore loses deterministic file scores even though the answer exists.

This audit extracts final assistant text from the matched trace and applies the same preset `namedFiles(..., {bareBullets: true})` and `fileMatch` contract. Scored answers agree with the existing recall calculation. Four missing scores recover for free:

| Case | Attempt | Recovered recall | Precision |
|---|---|---:|---:|
| FE-5948 | e-iq5BqM | 0.4828 | 0.5833 |
| FE-5948 | e-3oNv5m | 0.2069 | 0.4286 |
| FE-5948 | e-7evXFs | 0.2069 | 0.3529 |
| FE-5967 | e-Bj9KZ3 | 0.1667 | 0.4000 |

That yields **58 actual answers**, **19 complete case blocks / 57 attempts**, and one under-repeated case. It does not supply the two missing attempts or the skipped LLM verdicts. Original results and graders remain unchanged.

The standard report's `0.671` for run 15 is mostly the stronger BE portion and excludes expensive low-recall FE answers. Joining only its graded rows with run 16 produces a misleading 18-case view: recall 0.5792 and cost $0.23958. Including recovered FE-5948 changes the properly matched view to **0.5644 and $0.25104**. Do not select the flattering subset or claim the cost gate passed from it. All recorded 15+16 agent spend is **$14.59476**, plus **$0.41189 judging**.

Change: persist the final answer independently of paid graders and let deterministic investigation scoring consume it, with source/finality receipts. Keep “missing answer,” “skipped paid grader,” and “missing repetition” separate. This fixes the ruler without another paid run.

## Matched results

The table uses the same **19 cases × 3 attempts** in every arm. FE-5967 is excluded from every arm in this table. The bare source is reused from the compatible lock, with source hashes validated; naked-plugin/no-plugin equivalence remains an unmeasured assumption.

<!-- MATCHED_TABLE -->

| Metric | Bare lock | Oct 8 run 06 | Oct 8 run 07 | Oct 9 run 05 | Latest notation |
|---|---:|---:|---:|---:|---:|
| Recall | 0.5110 | 0.5391 | 0.5474 | 0.5746 | 0.5644 |
| Precision | 0.7176 | 0.6827 | 0.7040 | 0.7046 | 0.7016 |
| F1 | 0.5435 | 0.5389 | 0.5655 | 0.5806 | 0.5761 |
| Agent cost / attempt | $0.21320 | $0.21302 | $0.24937 | $0.24325 | $0.25104 |
| Harness turns | 9.98 | 9.37 | 10.21 | 10.49 | 10.95 |
| Model requests | 7.70 | 7.60 | 8.60 | 8.56 | 8.54 |
| First context | 16035 | 18878 | 19031 | 18695 | 19206 |
| Peak context | 38163 | 38157 | 42909 | 42514 | 44093 |
| Tool-result bytes / attempt | 45843 | 39535 | 48628 | 49035 | 51247 |
| Reading requests / attempt | 3.84 | 3.77 | 4.88 | 4.40 | 4.28 |
| Helper calls / attempt | 0.00 | 0.47 | 1.68 | 1.28 | 0.61 |
| Failed tool calls / attempt | 0.053 | 0.175 | 0.193 | 0.368 | 0.105 |
| Agent cost ratio to matched bare | 1.0000× | 0.9992× | 1.1697× | 1.1409× | 1.1775× |

<!-- END_MATCHED_TABLE -->

Against run 05, the latest treatment changes recall **−0.01023**, F1 **−0.00455**, cost **+3.20%**, and model requests **−0.0185** per attempt. It does not reduce requests meaningfully. Context and tool output grow despite fewer helper reads.

A deterministic case-mean bootstrap (10,000 samples, seed 9183) gives a conditional interval of **−0.04284 to +0.01640** for recall change and **−$0.00325 to +$0.01889** for cost change. It excludes within-case uncertainty. Thus neither the small quality difference nor the small cost difference is a clean causal effect. The substantial cost failure against bare remains the measured release concern.

The closest earlier BE-only comparison is less favorable:

| Metric | 06_1010 before notation | 12_1120 notation + guard | Change |
|---|---:|---:|---:|
| Recall | 0.7680 | 0.7588 | −0.0092 |
| Precision | 0.718 | 0.732 | +0.014 |
| Agent cost / attempt | $0.21647 | $0.23173 | +7.05% |
| Harness turns | 9.9 | 10.7 | +0.8 |
| Model requests | 7.80 | 7.25 | −0.55 |
| First context | 18,917 | 19,213 | +296 |

Run 12 costs 1.1697× bare and has +2.20 harness turns, above both declared limits. Two repetitions are below the three-run acceptance minimum. This is useful directional evidence, not an accepted experiment.

Guard rewriting, literal-command guidance, terminal wording, route headers, and all skill/step prose changed together. Their contributions cannot be isolated. A reduction in errors is measurable; crediting it exclusively to the notation is not.

## Compression: the active prompt gets larger

The source comparison uses current HEAD `fe61aa5` against the staged working tree. Saved traces independently confirm two delivered contract hashes: old **787 bytes**, new **1,669**, each excluding the final newline. The source files are **788 → 1,670 bytes**.

| Source | Before | After | Change |
|---|---:|---:|---:|
| Session contract | 788 B | 1,670 B | **+882 B / +112%** |
| Changed 15 step texts + six skills | 21,663 B | 20,393 B | −1,270 B / −5.86% |
| Those texts plus contract | 22,451 B | 22,063 B | −388 B / −1.73% |
| Investigate step | 897 B | 840 B | −57 B |
| Investigate skill | 904 B | 900 B | −4 B |
| Contract + investigate step + skill | 2,589 B | 3,410 B | **+821 B / +31.7%** |

The saved implementation note says 20,397 bytes for rewritten bodies; current bytes are four lower. The receipt-based measurement is authoritative for what these sessions received; source totals document the current staged candidate.

An investigation does not load the bodies of all six skills and 15 steps. Whole-repository savings therefore cannot offset a legend delivered to every session. The route-state line adds a little more. Actual first context on matched cases rises **18,695 → 19,206 tokens** against run 05, or about **+511**. The latest initial overhead against matched bare is **+3,171 tokens**, above the 2,500-token observation target.

[run-hook.test.ts](../../../../src/hook/events/run-hook.test.ts) raises the contract cap from 1,024 to **1,700 bytes**. Passing that larger cap is not evidence that compression succeeded. Keep an explicit explanation for the cap change and measure tokenized delivered payloads, not a bytes/4 proxy or counts of punctuation/words.

The earlier [$0 argument/context probe](../context-probe-2026-10-09.md) found real ticket-duplication savings. That fix precedes this notation treatment and should be retained independently. Do not attribute its savings to the new legend.

## What worked and what did not

### Delivery, routes, and evidence

Every one of the **58 latest attempts** receives the new contract and a `Route:` line. Every route closes `done`. Every recorded export is complete, its file hashes agree with copied bytes, and source entry counts match its copied ledger. No latest recorded permission denial or AskUserQuestion appears. These are useful improvements over the earlier audit.

Ownership: [run-hook.ts](../../../../src/hook/events/run-hook.ts), `deliverSharedContract`, injects `additionalContext` through SessionStart/UserPromptSubmit and deduplicates it by epoch, agent, reference and content hash. This is a plugin hook contract, **not replacement of the host's actual system prompt**. It cannot create tool authority or override higher-level host instructions. Keep the existing delivery seam rather than adding a second global prompt injector.

[execute.ts](../../../../src/harness/engine/execute.ts), `routeLine`, renders folded step state; [delivery.ts](../../../../src/harness/engine/delivery.ts), `stepHeader`, appends it at code handoffs, gates and model deliveries. The saved investigate example is:

```text
step read (5/5)
Now: Read the code the question is about -> answer it.
Then: answer the user; your answer is saved as the investigation note when you stop
Route: ground✓ [read]
```

The compact line correctly omits skipped steps. Its `✓` means the step is done in the route fold, not that its underlying evidence establishes success. An unavailable or unverified outcome must remain explicit. State delivery alone is not proof of state comprehension: investigation has one substantive model step and provides little opportunity to test a longer workflow.

The latest 58 attempts have **54/58 route-ready within five seconds**; the matched 57 have 53/57. That clears the 90% readiness observation target. Run 05 was already using the search caching/context fixes. Mean matched readiness worsens 1.746→2.187 seconds, so the notation cannot be credited with this latency improvement over older October 8 runs.

### Notation collided with the host before the model saw it

The old failed skill body contains `!` immediately followed by a backtick and `.ambicode`. Claude Code interprets that pattern as dynamic shell execution when loading the skill. The matched trace [e-Gzthtl](../../../../../ambicode-evals-assets/outputs/core/2026-10-09/07_1105_curated-ambicode-with-prompt-sonnet-5-5/traces/e-Gzthtl.jsonl) explicitly records:

```text
Shell command failed for pattern "!`.ambicode`"
(eval):1: command not found: .ambicode
```

All **60 matched attempts** in 07, 10 and 11 contain that failure and have zero model turns. Unrelated historical `api_error` traces in the same folders had initially led to a wrong rate-limit diagnosis. Match by sandbox/session before interpreting errors.

The staged [skill-content.test.ts](../../../../src/util/skill-content.test.ts) now rejects this substring in all skills; current skill bodies avoid it. That repairs this witness. It does not prove a future custom grammar is safe through every skill preprocessor, substitution, heredoc, shell, compaction, and host. The notation has an additional execution surface before any model interpretation occurs.

[run-validity.mjs](../../../../evals/scripts/src/harness/run-validity.mjs) now classifies a zero-turn/no-error result as invalid, and [evals-bench.mjs](../../../../evals/scripts/src/harness/evals-bench.mjs) warns and returns nonzero. Preserve this correction. Distinguish plugin-induced load failures from genuine external infrastructure failures in analytics: exclude them from model-quality averages but count them in plugin delivery/reliability. Otherwise filtering “outside the arm” can hide a plugin defect.

### Reading and guard behavior

Latest 58 attempts have **35 helper calls**, used in **20 attempts**. Their first tools are 32 Bash searches, eight native Greps, eight cat-class calls, nine helpers, and one listing. The model largely retains its existing search behavior. Native Read has **43 calls**, and native/shell reading remains substantial.

On matched cases, reading requests fall 4.40→4.28, singleton share **34.3% → 28.3%**, and paths per reading request increase **2.52 → 2.66**. This is a modest batching improvement. It does not save model requests or spend: total tool bytes rise **49,035→51,247 per attempt**. Helper calls fall **1.28→0.61**, so the experiment is not evidence that helper adoption is the main efficiency lever.

There are **six reader refusal headers in two latest calls**, all naming `repo/src/...` when task-bound resolution is already rooted at the child repository. Four occur in `e-NtMlxq`, two in `e-zYapeX`. The earlier parent/child root seam was corrected; these failures are redundant-prefix operands, a narrower remaining contract/model issue. Specify that helper operands are relative to the task repository and give an exact example from its map. Do not add another root-discovery algorithm.

Zero latest permission denials and zero executable-variable aliases are positive observations. The [guard rewrite](../../../../src/hook/guard/guard-core.ts), `inlineCliVariable`/`updatedInput`, and literal-command instruction were introduced together. The latest models never invoke the variable shapes, so these runs do **not** exercise the rewrite's model-facing branch. Keep the guard and its independent test coverage; do not assert the new language solved guard compatibility.

### Search is unchanged and still the major source of recovery work

All **58 delivered-map hashes match run 05 for the same case**. All 58 maps use profile null. **21 attempts / seven cases** still receive no historical truth file: BE-4835, BE-5075, FE-3571, FE-5948, FE-6086, FE-6141 and FE-6292. Current report truth classification correctly retains analytics root files; that previous defect is fixed.

Notation does not repair wrapper-word extraction, synthetic identifier ranking, domain drift, missing ownership/consumer/template companions, or proposed filename ambiguity. Those responsibilities remain in [map.ts](../../../../src/modules/search/text/map.ts) and [locate.ts](../../../../src/modules/search/text/locate.ts). The state line supplies control-flow orientation, not better code evidence.

FE-6141 achieves better recall but costs **1.62× bare**, with roughly 70.5k peak context and 18.3 model requests per attempt. FE-5948 costs **1.54× bare**, roughly 71k peak context and 16 requests. **Neither case uses the helper in the latest three attempts.** Lowering the helper's byte cap cannot directly reduce their existing read outputs. Address discovery and evidence volume across channels before another cap-only trial.

### Task state is visible, but the intended transition is not demonstrated

Across all eight notation task attempts, there are **zero recorded checks**, seven `human/no-red` exits and one `inconclusive`. No `Edit`/`Write` tool runs after the printed route-end message. This is a narrow successful terminal behavior observation, not successful task implementation or proof that the breadcrumb caused it. Earlier inspected task traces also include zero such post-end edits.

The benchmark configs have `commands.unit: null`, and the saved traces report missing node_modules. For example, the check says the configured unit check has no command. These are genuine unavailable checks; notation cannot make a configured command executable. The final messages correctly report limitations rather than a green result.

There is also a real sequencing failure: [e-cLRPPf](../../../../../ambicode-evals-assets/outputs/core/2026-10-09/14_1237_curated-ambicode-with-prompt-sonnet-5-5/traces/e-cLRPPf.jsonl) receives the new “next again ends no-red” reprint, then uses Edit on `niosh.service.ts` once and `niosh.controller.ts` twice **before** the route ends, while red remains unmet. It never reaches a recorded green check. Saying “zero edits after end” would hide this more important deviation. This count is from explicit Edit/Write calls; shell mutation would need separate classification.

Ownership: `execute.producerHint` still advises `route next` for a missing `check{red}`; the reprint adds a warning without changing that instruction. The header's Then line also names `route next`, while the body says run a check, and the no-test branch names the same next command. This mixes advance, evidence production and exit. Make unmet prerequisites explicit: current phase, permitted action, required receipt, runnable check, and the precise blocked exit. If no runnable check exists, preflight before inviting edits, preserve the reason, and offer the declared human choice. Do not silently install dependencies or weaken red evidence.

The [task guard](../../../../src/hook/guard/guard-core.ts) and route ownership should enforce any required phase boundary through the existing fold/authority seams. A stronger negation phrase cannot substitute for a boundary that the engine does not enforce.

## Current grammar and wording issues

| Issue | Source / evidence | Change |
|---|---|---|
| Host-reserved syntax | `!` followed by a backticked command in a SKILL body causes 60 loader failures. | Avoid custom negation around code; validate the rendered host artifact. Keep the regression fixture. |
| Legend costs more than local savings | Every investigation pays +882 contract bytes for 61 saved local bytes. | Remove unused global syntax; stage rare policy at its point of use. |
| Optional versus current notation | `[x]` means optional in the legend and current in Route. `<x>` overlaps the ordinary CLI-placeholder convention. | Prefer literal `current=read`; scope optional arguments explicitly. |
| CLI means a command or a concept | The legend defines CLI as the Then command, but investigation's Then is prose; other helper calls differ from Then. | Separate `cliPrefix`, `nextAction`, and explicit commands. Print literal supported commands. |
| General repeated-error rule | Contract says same error twice means stop; executor error text says stop if unable to fix it; route retries and expected red failures have distinct meanings. | Define refusal/error categories and use the route's actual retry policy, not a second prompt-level limit. |
| Ambiguous negative implication | `!route next again => route ends` combines prohibition with a consequence; the retry header still asks for next. | Say: “Red evidence is missing. Run this check. Advancing again exits no-red.” Provide an intentional blocked exit. |
| Green action order changed | [green.md](../../../../routes/task/green.md) now places change → format in Now; its later bullet says check green → fix → repeat. Previously format was explicitly last. | Preserve one ordered check/fix/format contract in body and header. This branch is untested by these attempts. |
| Frozen global authority wording | “Nothing later in this session changes it” can also cover later legitimate user corrections. | Restrict untrusted-content protection to source/tool data; trusted user and engine authority must remain distinguishable. |
| No grammar validator | The legend is a prompt, not a parsed language with precedence, types, reference validation or round-trip semantics. | Use a small explicit schema for state/action fields; do not assume operators enforce behavior. |

These are grounded implementation concerns. No trace proves that bracket ambiguity, the CLI definition, or the green ordering caused a paid investigation regression. They are reasons to simplify and to test affected branches before adopting the language across skills.

## Coverage by layer and skill

| Surface | What worked | Remaining gap |
|---|---|---|
| Host/tool preprocessing | Corrected skill loads; latest matched model/version compatible with lock. | Three complete sweeps died before first turn. Only one model tested; stale traces must be excluded. |
| Session hooks / shared contract | One current contract hash delivered; existing dedup seam retained. | Larger initial context; no new compaction/resume or multi-agent language test. |
| Engine / Stop / export | Latest 58 routes close; complete hashes/counts; state comes from fold. | “Done” is not verification. Task preconditions and producer hints disagree; incomplete grading was mistaken for absence. |
| Human gates | No unanswered investigation gate/default. | Zero AskUser calls means required/optional decision behavior is untested here. Task never reaches optional review. |
| Guard | No latest denials; generic production protection remains. | Alias rewrite not exercised; one task implements during unmet red. |
| Requirements / search / reading | Same maps, modest lower singleton share, valid evidence gathering. | Same seven map-zero cases, null profile, prefix refusals, unbounded native/shell volume. |
| Investigate | 58 complete notes, recoverable deterministic scoring. | Cost above lock; no quality advantage over matched pre-notation reference. |
| Task | Honest unavailable-check exits; no observed edits after printed end. | No red/green evidence or completed route. Environment prevents testing the main workflow. |
| Plan / review | Source bodies rewritten. | No post-notation model eval. Older walks use old contract, so cannot validate acceptance/omission/reviewer semantics. |
| Init / rules | Source bodies rewritten. | No new model evidence for config application, source quotes, gates or publishing boundaries. |
| Eval ruler | Locked sources reused; earlier root-truth/baseline-trace corrections retained; zero-turn detection added. | Grader-dependent answer capture, partial-case weighting, campaign manifests and build provenance need correction. |

## What to do next

1. **Keep the Route line and explicit terminal status.** Extend the existing header with pending evidence and an unambiguous current/action/next contract. Preserve ledger-derived state and guard authority.
2. **Replace the blanket notation with short literal prose.** Keep evidence, trust, route ownership, gate handling and honest exits in a small shared contract. Deliver workflow-specific command/cwd/range/check guidance only at that workflow step. Remove the full legend and avoid changing behavior while shortening text.
3. **Fix the concrete state contradiction.** An unmet red check must print the actual check command or a structured unavailable-check exit, not an advance command labeled as its evidence producer. Preflight configured checks before editing. Test the witnessed BE-6140 sequencing failure against the existing guard/fold seams.
4. **Correct saved-data scoring first.** Use final-answer artifacts for deterministic localization, retain skipped grader status, rescore cached bare and plugin answers consistently, and explicitly count missing repetitions. Do not rerun bare just to recover four stored answers.
5. **Prioritize code ownership and total evidence traffic.** Preserve S5 argument dedup and search caching; fix request extraction and UI/template/consumer evidence. Measure every reading channel, model requests, output, relevant spans and peak/cache context. Smaller helper caps alone miss the two largest cost cases.
6. **Use a separated experiment if later confirming prompt changes.** Same case bases, host/model/effort, search and guard build; compare short prose with short contract/state against the symbolic variant. Store executed plugin/prompt hashes. For tasks, supply a declared runnable check in an appropriate fixture first; tests with null commands cannot establish red/green adherence. Keep the compatible bare lock, and compare with run 05 as the preceding prompt reference. No paid run was initiated for this analysis.

A production release should satisfy the existing quality/cost gate and delivery success criteria, not only show fewer native Reads or a smaller sum of repository prose. The evidence supports a small explicit protocol for state and actions; it does not support inventing a universal instruction language.

## Per-case evidence

The table uses final answers, including the four recovered deterministic scores. Ratios are to each case's cached bare agent cost. FE-5967 is explicitly under-repeated and is excluded from the matched table above.

<!-- CASE_TABLE -->

| Case | Latest attempts | Bare recall | Run 05 recall | Latest recall | Latest precision | Cost ratio |
|---|---:|---:|---:|---:|---:|---:|
| be-vs-4606 | 3 | 0.972 | 0.944 | 0.972 | 0.921 | 1.16× |
| be-vs-4835 | 3 | 0.633 | 0.617 | 0.600 | 1.000 | 1.21× |
| be-vs-5071 | 3 | 0.917 | 1.000 | 1.000 | 0.500 | 1.00× |
| be-vs-5075 | 3 | 0.407 | 0.444 | 0.444 | 0.679 | 1.08× |
| be-vs-5721 | 3 | 0.600 | 0.600 | 0.600 | 0.783 | 1.17× |
| be-vs-5928 | 3 | 1.000 | 1.000 | 1.000 | 0.821 | 1.22× |
| be-vs-5941 | 3 | 0.619 | 0.714 | 0.714 | 0.944 | 1.14× |
| be-vs-5973 | 3 | 0.690 | 0.821 | 0.786 | 0.918 | 1.14× |
| be-vs-6015 | 3 | 0.583 | 0.500 | 0.500 | 0.317 | 1.12× |
| be-vs-6140 | 3 | 1.000 | 1.000 | 1.000 | 0.643 | 1.00× |
| fe-vs-3571 | 3 | 0.213 | 0.271 | 0.280 | 0.865 | 1.26× |
| fe-vs-438 | 3 | 0.429 | 0.810 | 0.571 | 0.630 | 1.21× |
| fe-vs-5164 | 3 | 0.250 | 0.250 | 0.250 | 0.098 | 0.84× |
| fe-vs-5948 | 3 | 0.207 | 0.402 | 0.299 | 0.455 | 1.54× |
| fe-vs-5967 | 1 | 0.176 | 0.222 | 0.167 | 0.400 | 0.84× |
| fe-vs-6086 | 3 | 0.294 | 0.275 | 0.294 | 0.450 | 0.91× |
| fe-vs-6141 | 3 | 0.413 | 0.483 | 0.607 | 0.791 | 1.62× |
| fe-vs-6292 | 3 | 0.182 | 0.273 | 0.265 | 0.764 | 1.23× |
| fe-vs-6404 | 3 | 0.205 | 0.372 | 0.397 | 0.860 | 1.25× |
| fe-vs-6406 | 3 | 0.095 | 0.143 | 0.143 | 0.889 | 1.12× |

<!-- END_CASE_TABLE -->

The important tradeoffs are visible by case: FE-6141 improves coverage at high cost; FE-438 falls 0.810→0.571 against run 05; FE-5948 falls 0.402→0.299 and becomes more expensive. BE-6015 remains at 0.500, with precision 0.317. Those are evidence-selection/coverage issues that shortening punctuation does not resolve. Case-level causal conclusions need more independent evidence than three sequential attempts.

## Reproducibility and limits

[analyze.mjs](analyze.mjs) reads matched result/trace IDs, validates locked source hashes, replays gates without bypassing incompatibilities, validates terminal exports, measures shipped hook text, compares current prose with HEAD, and rescoring recovers completed final answers. [audit.json](audit.json) contains summaries, matched and recovered comparisons, all case means, sizes, contract hashes/text, bootstrap and task/refusal evidence. [attempts.json](attempts.json) and [tools.json](tools.json) carry raw evidence locators and commands/results.

Reproduce with `node eval-replay/evals/analysis/notation-2026-10-09/analyze.mjs`. This makes no model calls. It uses current scorer source and current case metadata; their use is explicit, and original outputs are unchanged. Effort, immutable executed-bundle hash and fully pinned scaffold/config provenance are not present in historical results. There was no product build, application check, verification suite, or external reviewer during this audit.

This report records the latest available directories through `16_1304`. It does not reverse staged changes. The user can retain the small contract/state mechanism while deciding whether to retire the symbolic rewrite; those are independent decisions supported by different evidence.

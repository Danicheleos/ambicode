# Review of `new-architecture/v2` (2026-10-03)

Second round. I read CLAUDE.md, my review-v1.md, all 24 v2 files, the v1 files where a diff
helped, the measurement directory (README, `results.log`, `queries.log`, `compare.mjs`, `run.sh`,
`queries.sh`), and re-checked every code and background-document citation v2 makes against the
files at HEAD (`src/`, `hooks/hooks.json`, `skills/`, `docs/compatibility.md`, `evals/`,
`gym/planing/investigation/`). Tools: `sed`, `grep`, `wc`, `ls`, `git stash list/show`. I ran no
eval, no node script and spent nothing. Numbering continues from review-v1 (last item 41).

## 1. Verdict

**Rework, narrower than v1.** The v1 corrections landed in the text almost everywhere (37 of 41
fully, 4 partially; details in §4), the measurement plan is now honest about costs and tiers, and
the acting-default and Stop-hook problems are gone. What remains is one structural gap and its
consequences: **the route engine as specified cannot run the routes the skill files describe.** The
fold is monotonic (12 §4) and the DSL has no re-entry, yet the plan route says "Revise → 4", `plan
check` runs "≤ 2 rounds", `rules` runs "≤ 3 rounds", `map` has `repeat: 2`, and task re-runs
check/review after findings (#42). Gates are declared only on `human` steps (12 §1) while the skill
tables raise a dozen gates from code and model steps that no route file names, so the "table test
enumerates every gate" claim (15 §4, 33 §8) covers a minority of them and the `AskUserQuestion`
hook has no gate id to bind an answer to (#43). The ceremony budgets that gate the point of no
return are counted under semantics the engine does not have: every code step after a model step
costs a `route next`, so task is ≥ 10 turns, not 5–8, and 33 §1's kill fires on the happy path
(#45). And the eval that decides the engine's fate cannot run as written: one `prompt.md` serves
both arms (`evals-bench.mjs:169` `arm: both`), so a typed `/ambicode:` prompt reaches the naked arm
too (#46).

Three things to change before building: (1) give the fold re-entry (an `invalidates`/`revise`
rule) and a second gate class for error-raised gates with a registry the table test reads; (2)
recount ceremony per route from the engine's own rules and gate the point of no return on cost
ratio only; (3) give the harness per-arm prompts and treat the second baseline as mandatory.

## 2. Corrections

`must` = wrong, unsafe, or blocks a measurement; `should` = materially better; `could` = taste.

| # | Sev | File §section | What is wrong | Evidence | Fix |
|---|---|---|---|---|---|
| 42 | must | 12 §4 (fold), 23 steps 8–9, 21 step 5, 17 §2, 32 §3, 24 steps 9–10, 25 step 6 | **The fold cannot go backwards, and six places need it.** `position()` returns the first step whose evidence is missing; a step with evidence is done forever. 23 step 9 "↩ *Revise* → 4": after `declined {gate: plan-accept}` the human step is done, steps 4–8 still have their evidence, so the fold lands on step 10 (save) — the model saves a draft; nothing re-opens design. 23 step 8 / 17 §2 "≤ 2 rounds" of `plan check`: step 8 is done after its first `worker` entry. 21 step 5 "≤ 3 rounds" of `policy check --drafts`: same. 32 §3 `ground` `repeat: 2`: nothing can trigger a second run once `envelope, map, policy` exist. 32 §3 `scope` gate: after the human names a directory, no step consumes it (`ground` is already done). 24 step 10 "`check --only` again; `review` again" and 25 step 6 "one re-run": the re-run is by the model outside the route, so 24 step 9's `review` step never sees the answers. | `modules/12-route.md:93-103` (fold); `:44-45` "Branching is expressed with two steps and complementary `when`s" (no loop construct); `skills/23-plan.md:32-33`; `skills/21-rules.md:26`; `32-artifacts.md:51-63` | Add a re-entry rule to the fold: a `revise {from: <stepId>}` entry (written by the engine on `declined` of a gate that declares `onDecline: revise <stepId>`, or by a code step's `onFail: revise <stepId>`) moves the slice start so later steps are "not done" again; `repeat` becomes "max revises that re-run this step". Define `scope`'s release as `revise ground` with the answer as a `--term`/path. Make the task/review re-run a route step (`review` with `needs: [acceptance|declined per waiting key]`). Add the loop fixtures to 33 §8. |
| 43 | must | 12 §1 (`gate` only on `human` steps), 15 §4, 33 §8 vs 20 step 1, 22 steps 1–3 and "Diagnostics", 23 step 5, 24 steps 5, 9, 10, 25 step 6, 14 §1, §2, §5, 12 §5 (`budget.modelSteps` gate), 10 Failure modes (two projects) | **Most gates in the design are not declarable in the DSL.** 12 §1: "`gate` — only on `human` steps". Then: 20 step 1 `config-unparsable` → ⏸ on a code step; 22 step 1 two-projects ⏸ at `route start`; 22 step 2 `requirements-server-disconnected` ⏸ on a model step; 22 step 3 `map.empty` is the one declared `human` step; 22 "Diagnostics … after a human *Run it* ⏸"; 23 step 5 "one question per material decision" (N gates, N unknown at build); 24 step 5 `propose` ⏸ from `check`; 24 step 9 "waiting checks → ⏸ each"; 24 step 10 "scope-expanding finding → ⏸"; 14 §1 several-servers ⏸; 14 §2 > 10 children ⏸; 14 §5 conflict ⏸; 12 §5 budget ⏸. None has an id in a route file, so (a) 15 §4 / 33 §8 "a table test enumerates every gate in every route file and drives accept, release, `--default`, headless, three-unanswered" covers one of the fourteen; (b) the `PostToolUse(AskUserQuestion)` hook "records the open gate's answer" (30 §1) but has no gate id to attach it to; (c) "every default is non-acting" is validated at build only for declared gates. | `modules/12-route.md:40`; `modules/15-guard.md:76-78`; `33-measurement.md:95-97`; the step tables cited | Define two gate classes with one ledger semantics: **declared** (route file, `human` step) and **raised** (by an error code or a command; a registry `gates.yaml` maps code → `{question, options, default, release}`; the engine appends `gate {id, raisedBy}` when it prints one). The table test iterates the registry too. For 23 step 5 (N decisions) let the model open a raised gate by name (`route next --ask decision:<slug> --options …`) so the hook can bind the answer. Until then, 15 §4 and 33 §8 must say "declared gates only". |
| 44 | must | 12 §3 (`--default <gate>`), 31 (`route next` flags), 30 §6, 24 step 8, 25 step 4, 33 §0.2, CHANGELOG #3 | **`--default` means two incompatible things, and headless evals cannot act either way.** 12 §3 and 31 define `--default <gate>` as "take the gate's non-acting default on record". CHANGELOG #3, 30 §6, 24 step 8 ("evals pass `--default review-offer=run`") and 25 step 4 ("`--default estimate=run`") use `--default <gate>=<option>` to select an *acting* option — which is `--answer`'s job (12 §3.4 "`--answer` → `{via: flag}`"). Under 12 §3's definition `--default review-offer=run` either errors or records *skip*, so the task and review evals never run the reviewer. Separately, `--answer`/`--default` are `route next` flags, but in the sandbox the only text the harness controls is the prompt, which reaches `route start` (31: flags `--task`, `--headless`, `--project`). There is no pre-answer mechanism; `workers.approved` (17 §1) is the only precedent. | `modules/12-route.md:70, 81-82`; `31-cli.md:10`; `30-harness.md:66-67`; `skills/24-task.md:32`; `skills/25-review.md:33`; `CHANGELOG.md:11` | One vocabulary: `--answer <gate>=<option>` selects (`via: flag`); `--default <gate>` takes the non-acting default (`via: flag`). Add `route start … --answer <gate>=<option>` (repeatable) that pre-records `acceptance {via: prompt}` for named gates, printed in the report; evals pass `--headless --answer review-offer=run`. Fix 24, 25, 30 §6, 33 §0.2 and CHANGELOG #3 to match. |
| 45 | must | 02 §5, 22 §Ceremony, 23 §Ceremony, 24 §Ceremony, 25 §Ceremony, 33 §1, 12 §3.3 | **Ceremony budgets contradict the engine's own rules.** 12 §3.3: code steps run "on `route next`". So every code step that follows a model step costs a `route next`. Task (24): after step 3 (→ code 4), after step 6 (→ code 7, gate 8), after the gate answer (→ code 9), after step 10 (→ 11): ≥ 4 `route next` + 3 `check` + 1 `note save` + ≥ 2 `AskUserQuestion` ≈ **10–12**, against "5–8". Plan (23): `route next` after steps 2, 4 (→ 5/6), 7 (→ code 8), after `plan check` feedback, after acceptance (→ 10): ≥ 5 + `note save` + N decisions + acceptance, against "3 + decisions + 1". Review (25) counts a code-run `review` as a turn while task counts code-run `format` as "(code, no turn)". Investigate's 3 holds. 33 §1 kills at "turns above budget + 2", so task and plan would fail the point of no return on a clean run — the v1 P35 finding moved one level up. | `modules/12-route.md:76` ("Run reachable `code` steps" inside `route next`); `skills/24-task.md:49-50`; `skills/23-plan.md:41-42`; `skills/25-review.md:43`; `33-measurement.md:34-39` | Define a ceremony turn once (a model tool call whose only purpose is the route: `route next`, `note save`, `check`, `format` if model-run, `AskUserQuestion` for a gate) and derive each budget mechanically from the route file with the rule "code step after model step = +1 `route next`". Or remove the rule: every evidence-writing command (`check`, `note save`, `format`, `review`) ends by printing the next step (implicit `route next`), which halves the count; then say so in 12 §3 and 31. Gate 33 §1 on cost ratio only (as its own sentence already says) and report turns. |
| 46 | must | 33 §0.2, §2, §0.7; 41 step 0 | **The harness cannot give the two arms different prompts.** Case plans are `arm: both` with one `prompt.md`; the runner's only arm switch is `--plugin <dir>`. A prompt rewritten to `/ambicode:investigate <question> --headless` reaches the naked arm as an unknown command. The cached baseline's naked arm cannot substitute: `evals:gate` refuses a baseline whose prompt differs (README), and 33 §0.2 changes the prompt. §2's "10 cases × 3 runs × 2 arms ≈ $14" is not the `evals:decide` tier (26 cases, plugin arm only, against the cached baseline). | `evals/scripts/src/evals-bench.mjs:169, 189, 201` (`arm: both`), `:971` (`--plugin`); `evals/evals-core/README.md:198-204` ("depends on … the prompt … refused"); `evals/evals-core/cases/be-vs-5546/prompt.md` (one prompt, `allowed_tools: [Read, Glob, Grep, Bash, Skill]`) | Add to §0: per-arm prompt in the case (`prompt.md` for naked, `prompt.with.md` for plugin, or a runner rule that prefixes the plugin arm with `/ambicode:investigate ` and appends `--headless`), and state that the cached baseline is invalid after the rewrite, so §0.7's second baseline (≈ $28) is required before §1–2, not optional. Re-cost §2 as a two-arm run. |
| 47 | must | 30 §3 (last paragraph), 14 §3 step 1 | **"Captures reduce `search*` payloads (they do, 14 §3)" is false for context.** The `PostToolUse` hook runs after the tool result is already in the model's context; capture reduces what is written to `requirements/<key>.json` (53 KB → ~2 KB on disk), not what the model holds. The real run's 53 KB JQL result entered the naked arm's context whole. 30 §3's conclusion that a 10-child epic stays under the 214k peak rests on this. v2 removed the only mechanism that would keep JQL payloads out (the `collector`, now appendix). | `30-harness.md:47-49`; `modules/14-requirements.md:56-58`; `gym/planing/investigation/archive/real-run-VS-6735-2026-10-02.md:105` (JQL → 53 KB in context) | Say it plainly: capture reduces disk, not context. The in-context lever is the template telling the model to request `fields=key,summary` on JQL and `fields=summary,description,…` on children (14 §2 currently says `fields=*all`), which is a model-obeyed instruction (M2 applies). Keep P32's peak measurement as the arbiter and drop the "will exceed it unless" sentence. |
| 48 | must | 30 §9 vs 24 step 7, 16 §3, 10 §4, 20 step 1 | **"The harness never … writes outside `.ambicode/`" is violated twice by design.** 24 step 7 runs `format` as a *code* step: the engine rewrites source files between two model steps (and the model's next `Edit` may miss its `old_string`). 10 §4 / 20 step 1: `init` writes the ignore line into `.gitignore`. | `30-harness.md:98-99`; `skills/24-task.md:31`; `modules/16-checks-review.md:42-43`; `modules/10-search.md:101-102` | Either amend 30 §9 ("writes source only through `format`, on record, after green; writes `.gitignore` only through `init --apply` on acceptance") or make `format` a model-run command in step 6's text. Say which. |
| 49 | must | 14 §3 (fallback), 22 steps 1–3, 32 §3 (`ground` `produces: [envelope…]`), 30 §6, 12 §1 (`args.hasRequirement`) | **The no-URL path, which is the whole sandbox eval, is unspecified.** Localize prompts carry the ticket inline (`<ticket>…</ticket>`) and no URL. Then `args.hasRequirement` is false (or true by accident — see below), `requirements normalize` has no captures and no `--evidence -`, and `ground` must still produce `envelope`. Nothing says what it produces; 14 §3 says the *model* pipes an envelope on `--evidence -`, but no step in 22 asks for it (that would be +1 turn, outside the budget of 3). `args.hasRequirement` has no definition; today's detector (`/https?:\/\/\S+|\b[A-Z][A-Z0-9]+-\d+\b/`) fires on a key-shaped word in prose, a known false positive, which would send a sandbox run into the fetch step with no MCP. | `evals/evals-core/cases/be-vs-5546/prompt.md:13-27`; `modules/14-requirements.md:69-72`; `32-artifacts.md:52-54`; `src/hook/prepare-on-skill.ts:61-62` (the regex and its own comment "A key-shaped word in prose (`NOM-36`) defers too") | Define: `args.hasRequirement` = a URL or `--requirement`; a bare key only when `requirements.mcpServer` is set. No URL and no capture → `normalize` builds the envelope from the args text itself, `builtFrom: args`, `acs` splits it; the model pipes nothing. Label `builtFrom: args` in `score` beside `captures`/`model` (P39). |
| 50 | should | 10 §3, 01 M21, measurements README | **The P/R table and the language-service numbers are not in any log.** `results.log`'s language-service block died on the `reuse-score.mjs` import; `queries.log`'s codeindex calls all `exit=2`; the README says `compare.mjs` "repeats it" but its output was never written down. So `refs 236/483 ms`, `relates 93/163 ms`, LS `706/2,434 ms`, `RSS 368/777 MB`, and all four P/R rows exist only in the README. Where the logs do have a number it differs: `git grep -w -l` is **70 ms BE / 151 ms FE** (with process spawn) against the design's 17/41; `agentmap --relates` is **115 / 199 ms** against 93/163. | `measurements-2026-10-03/results.log` (last block: `ERR_MODULE_NOT_FOUND … reuse-score.mjs`); `queries.log` (`[codeindex-refs-BE] 811 ms exit=2`, `[git-grep-w-BE] 70 ms`, `[git-grep-w-FE] 151 ms`, `[agentmap-relates-BE] 115 ms`, `[agentmap-relates-FE] 199 ms`); README "Results quoted in v1/modules/10-search.md §3" | Re-run `compare.mjs` once and commit its stdout as `compare.log`, or label every number that came from it "unlogged run, 2026-10-03" in 10 §3 and M21. Quote the logged grep timings or say 17/41 is in-process. Nothing here changes a decision (grep tied either way), which is why it is `should`. |
| 51 | should | 10 §1 L2′, CHANGELOG #1 | **The regex harvest is misdescribed.** `DECLARATIONS` matches declared names of any visibility (pattern 1 has no `export`; pattern 3 matches class members; patterns 4–7 are Python/Rust/Go/C#), and `declaredNames` returns the **first** match per pattern (`pattern.exec(text)?.[1]`), at most 7 names per file. "Exported identifiers … the pattern already exists" oversells; pass 2 needs a global-flag variant over the top-8 files and an `export` filter if that is the intent. | `src/code-intelligence/dependents.ts:25-33` (patterns), `:35-40` (`exec` once per pattern) | Say "declared names (first per pattern today; pass 2 adds a global scan and an export filter)"; keep the ~50 ms as "I'd guess". |
| 52 | should | 30 §1 (MCP matcher) vs 14 §1 (binding) | The hook matcher is fixed to `atlassian\|jira\|confluence\|rovo`; 14 §1 binds by the configured server name. A server named otherwise never fires the capture hook, so every `route next` reports `requirements-not-captured` and the second time degrades to "continue without". Today's code has the same gap (the matcher runs before the binding check). | `hooks/hooks.json:9`; `30-harness.md:14`; `modules/14-requirements.md:32-35`; `src/hook/prepare-on-skill.ts:97-108` (matcher at 97, binding at 104–108) | Match `mcp__.*` and apply the binding rule inside the hook (cost: one 89 ms spawn per MCP call of any server), or state the four-token limit in 14 §1 and `init`'s binding step. |
| 53 | should | 13 Failure modes, 32 §2 | "Duplicate ids tolerated (first wins)" with ids "monotonic per file" and two sessions: B's `L9` duplicates A's `L9`; readers keep A's, so B's fold misses its own entry, re-prints, and after three identical calls advances with `limit`. Not wedged, but wrong and silent. | `modules/13-evidence.md:122`; `32-artifacts.md:32` | Ids carry the session (`L9@<sess8>`) or are ULIDs; readers dedupe on the full id. |
| 54 | should | 12 §3.4, P3, 13 §1 (`gate.asked`) | The "unanswered" counter counts `route next` calls, not asks. `AskUserQuestion` blocks the turn until the human answers, so in practice "three unanswered calls" happens only when the model never asked (M2). The ledger would say `default-taken {via: unanswered}` when the truth is "never asked". | `modules/12-route.md:83-85`; `modules/13-evidence.md:32` | `gate.asked` is incremented by the `PostToolUse(AskUserQuestion)` hook (the question text carries the gate id), not by `route next`. Three `route next` with `asked = 0` → `default-taken {via: never-asked}`; the report prints it in those words. |
| 55 | should | 20 step 4, 21 step 8, 24 step 8, 25 step 4 vs 12 §3.4 | 12 §3.4 says claims (plan acceptance) treat `via: flag` as not accepted outside headless. Init's config write, rules' `apply`, task's reviewer spend and review's run are consequences at least as acting as a plan label, yet a model-typed `--answer apply=yes` would act interactively. 20 step 4's "only with an `acceptance` or `--default` on record" is also wrong: `--default` records the non-acting default (write nothing). | `modules/12-route.md:86-87`; `skills/20-init.md:24`; `skills/21-rules.md:29`; `skills/24-task.md:32`; `skills/25-review.md:33` | One rule in 12 §3.4: acting options (write a file outside the ledger, spend money) are honoured from `via: hook`, from `via: prompt` (#44) and from `via: flag` only in headless. Fix 20 step 4's parenthesis. |
| 56 | should | 23 step 9, 13 §3, 30 §1 | Plan acceptance "via `ExitPlanMode` in plan mode" needs a hook that records it; the matrix has `PostToolUse(AskUserQuestion)` only. Also unverified: whether a `Write` to `steps/plan-body.md` (step 7) is permitted while plan mode is on. | `30-harness.md:15`; `skills/23-plan.md:31, 33` | Add `PostToolUse(ExitPlanMode)` to the matrix with P2, or drop the plan-mode path and use `AskUserQuestion` only. Add the plan-mode write question to P2. |
| 57 | should | 23 step 7, 02 §6 | The plan route has the model `Write` `steps/plan-body.md`, but the plan skill's `allowed-tools` today has no `Write` (removed on purpose, review-v1 §2.1). Without `Write(.ambicode/task/*/steps/plan-body.md)` the write prompts for permission; in `-p` (33 §4's runner) that is a refusal (G20) → `stop:blocked`. 20 says init *loses* grants; 23 says nothing about gaining one. | `skills/plan/SKILL.md:5` (`allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)`); `skills/23-plan.md:31` | State the grant in 23 "What the model loads" and in 41 step 6; the guard row (15 §1) stays the real boundary. |
| 58 | should | 33 §1 | Self-contradiction in one paragraph: "Turns are **reported** against the budget; the **gate is the cost ratio**" then "**Kill**: cost ratio > 1.15x **or turns above budget + 2**". CHANGELOG #21 says "cost ratio gated". | `33-measurement.md:36-39`; `CHANGELOG.md:29` | Pick one. Given #45, cost ratio only. |
| 59 | should | 33 §4, 23 §Measured acceptance, P43 | Arithmetic: 3 epics × 3 runs × **2** arms × $1.8–2.5 = **$32–45**, not $50–70 (the v1 figure was for 3 arms). | `33-measurement.md:60`; `skills/23-plan.md:54`; `40-open-problems.md:50` | $32–45; keep the scout arm's extra $16–23 as "if added". |
| 60 | should | 33 §0.6 | "24 cases × 3 runs at $0.33–0.67 ≈ $25–50": there are 8 review cases (plus 8 forced twins, deleted by §0.2); 24 is runs (8 × 3), the number the baseline's "10/24, 15/24" counts. 24 reviews × $0.33–0.67 = **$8–16**, plugin arm only. | `evals/evals-core/cases/` (8 `*-review-*` + 8 `*-forced`); `gym/planing/investigation/archive/baseline-2026-10-02.md:28-30` | Correct the figure; it makes the live tier the obvious choice over re-keying. |
| 61 | should | 01 §1 (task), 33 §5 | "pass(with) > pass(without) beyond the spread" at 10 cases × 3 runs: a pass rate over 30 binary runs has SD ≈ 9 pp near 0.5, so the detectable gain is roughly ≥ 20 pp. The kill ("inside the spread → cut task") will fire on any real but modest gain. Nothing states this. | `01-goals-and-constraints.md:14`; `33-measurement.md:69-78` | State the minimum detectable effect for the suite size, or size the suite from the effect the design expects (and what that costs). |
| 62 | should | 01 §1 (plan), 33 §4 | "Composite … above the naked arm" with three metrics on different scales and one expected tie: no weights, no normalisation, no tie rule. Two different composites can give opposite verdicts on the same runs. | `01-goals-and-constraints.md:12-13`; `33-measurement.md:65-66` | Define it (e.g., win on ≥ 2 of 3 with no loss beyond noise on the third; or z-scored mean) before the first run. |
| 63 | should | 10 §1 L4, 16 §6, 25 step 5 vs 01 D1 | `refs --exact` is the TypeScript language service in a child process. 16 §6 and 25 step 5 run it in **review** when an index is present. The user's constraint says LSP at most in `task`, never in review. The design's own words: "L4 is not an index". Whether a language-service child falls under "LSP" is the user's call, and the design does not raise it. | `modules/10-search.md:38, 91`; `modules/16-checks-review.md:60-62`; `skills/25-review.md:34`; `01-goals-and-constraints.md:61` | State it in 01 D1 and 25, and put it in §5 open questions. If the answer is "no", review dependents are `relates` + `-w` grep only. |
| 64 | should | 15 Outputs, 15 §1, 31 Conventions | `updatedInput` (a `PreToolUse` hook rewriting the command to add `--task`) is a platform behaviour the repo has never probed: no mention in `docs/compatibility.md` or `src/contracts/hook.ts`. The design relies on it for every `ambicode` call during a route. | `grep -rn updatedInput docs src hooks` → nothing; `modules/15-guard.md:17-18, 35` | Mark **unverified**, add it to 33 §0.4 before 41 step 1; the fallback is the step text carrying `--task <slug>` (it already names the slug). |
| 65 | should | 14 Failure modes vs 25 step 2 | 14 says `requirements-server-disconnected` → "gate: continue without" for everyone; 25 step 2 says retrieval failure **stops** the review. The per-route override is not expressible (gates are route-file data; this one is raised, #43). | `modules/14-requirements.md:102`; `skills/25-review.md:31` | In the gate registry (#43) allow a per-route `policy: stop` for `review`; say so in 14. |
| 66 | should | 32 §3 (`scope`), 12 §1 (`when`) | The example route's `scope` gate asks for a directory and nothing uses the answer (root cause #42). `when` has no "gate answered" predicate. | `32-artifacts.md:56-63` | Covered by #42's `revise ground`; add `gate.<id>.answered` to the `when` vocabulary. |
| 67 | should | 33 §0.1, CHANGELOG #10 | The stash holds **four** files (`reuse-cases.mjs`, `reuse-score.mjs`, both tests); "drop the import" is not a fix: `scoreReuse` is called at `:704`, and 33 §3's reuse cases need the generator. | `git stash show --name-only 'stash@{0}'`; `evals/scripts/src/evals-bench.mjs:9, 704` | "Restore the four files from `stash@{0}`." |
| 68 | could | 13 §1, 13 "What changes" | "Ledger 2 → 15 kinds": the table has 15 rows and **19** kinds (`acceptance`/`declined`/`default-taken` and `limit`/`exit` share rows). Today's two are `note` and `prompt`. | `modules/13-evidence.md:28-46`; `src/cli/commands/note.ts:78`; `src/cli/commands/prepare.ts:138` | "19 kinds". |
| 69 | could | 31 vs 14 §3 | `route next` lacks `--resolution` (14 §3 "after the conflict gate, `--resolution`"). | `31-cli.md:10`; `modules/14-requirements.md:67` | Add it or route the resolution through `--answer conflict=<source>`. |
| 70 | could | 41 Kept table | Row 1 lists `templates/*.eta` byte-for-byte; row 6 lists `templates/review.eta` as touched by the metrics hook. | `41-migration.md:36, 41` | Remove `review.eta` from row 1. |
| 71 | could | CHANGELOG "Not changed"; P44; 16 §4 | "Not changed" lists `budget.codeCalls` and then says "Dropped" (it is changed). P44 quotes "first 5,000 tokens each per the docs" with no doc cited (not in the repo's docs). 16 §4 cites "F5"; the best-practices file's F-5 is "Cost is not in the verdict", not task scoping. | `CHANGELOG.md:64-65`; `40-open-problems.md:51`; `gym/planing/investigation/archive/skill-best-practices.md:157` | Move `codeCalls` to the table; cite or drop the 5,000-token claim; fix or drop "F5". |
| 72 | could | 10 §1 L2′, P12 | "~50 ms" for the harvest is a guess without the label; "17 MiB wasm" and "15+6 languages incl. Python" appear in no log (help text in `results.log` lists neither). | `measurements-2026-10-03/results.log` (codeindex help block) | "I'd guess ~50 ms"; "per the package README, not checked". |
| 73 | could | 41 step 3 (kill column) | The fallback names "the `Skill`/slash/MCP prepare hooks"; the `Skill` hook is dead under D2 and deleted in the same table. | `41-migration.md:11, 29` | "the slash and MCP hooks". |
| 74 | could | 33 §7, review-v1 §7 | The `ask`-on-git refusal rate in headless (G20) is still unscheduled although routes make the model run more CLI commands; 15 Failure modes handles the single case. | `33-measurement.md:88-91` | One line in §7: count `permission-denied` exits per headless run. |

## 3. Three scenarios walked through the texts

**A. Interactive `/ambicode:task "iteration 2 of ORD-17"`, Sonnet, plan accepted earlier.** Start
runs code step 2 and prints step 3 (one line). Step 4 is code → the model must `route next` (#1);
step 5 red `check`; step 6's text arrives only if `check` prints it (31 says commands print their
ledger id, nothing more) → `route next` (#2); green `check`; step 7 `format` is code → `route next`
(#3) rewrites source files (#48) and prints gate 8; the model asks (or not, #54); the answer lands
via hook; `route next` (#4) runs review; waiting checks raise gates no route file names (#43);
`route next --answer …` (#5); step 10 the model re-runs `check` and `review` by hand (outside the
route, #42); `route next` (#6) → report; `note save`. Ceremony ≈ 6 + 3 + 1 + 2 asks = 12 against a
budget of 5–8 and a kill at 10 (#45). Nothing illegal for the model at any point; the engine's
accounting is what fails.

**B. Sandbox `/ambicode:investigate <question + inline ticket> --headless` (33 §2).** If P37 passes,
`route start investigate "<1.5 KB args>" --headless`. If the ticket text contains a key-shaped word,
`args.hasRequirement` may be true → template → fetch step with no MCP → `requirements-not-captured`
twice → "continue without" (+2 `route next`, budget blown). If false → `ground` must produce
`envelope` from nothing (#49). Assuming an args-built envelope, the rest holds: read, `route next`,
note, Stop (c) on the note file. Meanwhile the naked arm receives the same `prompt.md` (#46). The
measurement that decides the engine cannot run until #46 and #49 are settled.

**C. Interactive `/ambicode:plan ORD-17`, two material decisions, human steps away after the
first.** Decision gates are model-raised with no id (#43): the hook "records the open gate's
answer" with nothing to attach it to. The human leaves; the model's `AskUserQuestion` for decision 2
blocks the turn — nothing counts as "unanswered" (#54); on return the route continues. Step 7
`Write steps/plan-body.md` needs a grant 23 does not give (#57). `plan check` reports two bad
anchors → "feeds failures back ≤ 2 rounds": step 8 is done after its first `worker` entry, so the
second round has no step to run in (#42). Human picks *Revise* at step 9 → `declined` → the fold
goes to step 10 → the model is told to save a draft, not to revise (#42). The route is coherent only
for the straight-through path.

## 4. Verification of the v1 corrections against the v2 text

Status: **fixed** = the text says it; **partial** = some of it; **new problem** = fixed and the fix
created an item above. CHANGELOG mismatches are called out in the last column.

| # | v1 item | Status | v2 location | Note / CHANGELOG mismatch |
|---|---|---|---|---|
| 1 | Pass 2 index-independent | fixed, new problem | 10 §1 L2′, §1 order, 33 §3 | #51: CHANGELOG says "exported identifiers … verified"; the patterns harvest declared names, first match per pattern |
| 2 | `grepWords` with `-w` | fixed | 10 §1 L1 (quotes `git.ts:217-229` correctly) | — |
| 3 | No fall-through defaults | partial, new problem | 12 §3.4, §5, R12 | Record required ✓; `--default` semantics split (#44, CHANGELOG #3 says `=<option>`, text says `<gate>`); counter counts calls not asks (#54) |
| 4 | Non-acting defaults in init/task/review | fixed | 20 step 3, 24 step 8, 25 step 4 | 20 step 4 wording (#55) |
| 5 | Stop hook report-shaped only | fixed | 15 §3 (a)(b)(c), 30 §1 | — |
| 6 | Last model step done on `produces` | fixed, adjacent problem | 12 §4, 32 §3 | The fold still cannot re-enter (#42) |
| 7 | Acceptance `via` | fixed | 12 §3.4, 13 §3 | `ExitPlanMode` has no hook row (#56) |
| 8 | Ground once | fixed | 14 §3 step 3, 12 §3, 02 §5 step 3, 30 §1 | — |
| 9 | Code builds the envelope | partial | 14 §3, 32 §5 | MCP path ✓; the no-URL/sandbox path is unspecified (#49) |
| 10 | 33 §0 completeness | partial | 33 §0.1–0.7 | Typed prompts ✓, probes ✓, stash ✓ (4 files, #67); per-arm prompt missing (#46) |
| 11 | One investigate bar | fixed | 01 §1, 22 Purpose, 33 §2 | Identical wording in all three ✓ |
| 12 | "Kept byte-for-byte" | fixed | 41 Kept table | `templates/review.eta` in both rows (#70) |
| 13 | plan-body allow row | fixed | 15 §1 row 4 | — |
| 14 | `check` repeat 5 | fixed | 12 §1, §5 | — |
| 15 | Dedup with args hash | fixed | 12 §2.3 | — |
| 16 | Session-filtered fold | fixed, new problem | 12 §4 | Duplicate ids across sessions (#53) |
| 17 | No route → hook does nothing | fixed | 14 Inputs, 14 §3, 30 §1, 00 | — |
| 18 | Recorder "complete" | fixed (changed, as CHANGELOG says) | 13 §5, 13 §4 example, 30 §1 | Honest label ✓ |
| 19 | `refs --exact` process model | fixed | 10 §3, Failure modes, P11 | One child per call, 3,000 `.ts/.tsx` ✓ |
| 20 | DSL `when` / gate on code step | fixed, new problem | 12 §1, 32 §3 | Declared gates fine; raised gates undeclarable (#43); `scope` answer unused (#66) |
| 21 | +2 kill at the floor | partial, new problem | 33 §1, 02 §5, 22–25 §Ceremony | Budgets exist; miscounted (#45); turns still kill (#58) |
| 22 | Plan kill direction/cost/ACs | fixed | 33 §4, 23 | Cost not recomputed for 2 arms (#59); composite undefined (#62) |
| 23 | Review kill | fixed | 01 §1, 25 Purpose, 33 §6 | — |
| 24 | Slim-body misquote | fixed | 22 Purpose, M23 | Numbers match `skill-gap-plan.md:280-282` ✓ |
| 25 | Anchor counts | fixed | 23 P26 | Matches `real-run…md:60-61, 67` ✓ |
| 26 | LSP passive only | fixed | 24 §LSP, 10 §1 L6, 33 §0.4 (P36) | — |
| 27 | D2 trade on review | fixed | 25 Trigger | — |
| 28 | Index build detached / ignored | fixed | 10 §4 | — |
| 29 | Red/green summaries | fixed | 16 §2, 13 §1 `check` | — |
| 30 | Context variable columns + peak | fixed, new problem | 30 §3, 33 §7 | The capture-reduces-context claim (#47) |
| 31 | Dead hook rows | fixed | 30 §1 | — |
| 32 | Workers: runner + `plan check` | fixed | 17 | — |
| 33 | `wallMinutes`/`codeCalls` | fixed | 12 §5 | CHANGELOG lists it under "Not changed" (#71) |
| 34 | Effort total, point of no return | fixed | 41 | — |
| 35 | Task suite construction | fixed | 33 §5 | Detectable effect unstated (#61) |
| 36 | `--from-draft` | fixed | 24 Trigger, 13 §3, P42 | — |
| 37 | "$0.21 (n=5)" | fixed | 17 §3 | — |
| 38 | expected vs cap | fixed | 02 §5, 30 §3 | — |
| 39 | Stop probe citation | fixed | P17, 15 Open problems | — |
| 40 | Spawn formula | fixed | 30 §1 (1.6 s) | — |
| 41 | Body range | fixed | 02 §6 | — |
| §6 | Abandonment; several plans; iteration N; Windows; monorepo; ticket read outside a route; expansion-cap headless default | fixed | 12 §7, 13 §3, 30 §8, 15 §2, 10 Failure modes, 14 §2 | Monorepo gate is a raised gate (#43) |
| §3 | M8 "0 of 12" → 0 of 8 | fixed | 01 M8 | Matches `direction…md` tables ✓ |
| §7 | `ask`-on-git refusal rate | not fixed | — | #74 (could) |

Everything in CHANGELOG marked "Accepted" is in the text except the three mismatches noted
(#3's flag form, #1's "exported", "Not changed" listing a change). CHANGELOG #10's "lists it and
its test" undercounts the stash by two files.

## 5. Goals and constraints, briefly

- **Constraint 1 (LSP only in task):** met for the LSP tool. The language-service child in review
  (#63) needs the user's ruling.
- **Constraint 2 (SCIP/LSIF/repo map, off-the-shelf):** met; one adapter, off by default, measured
  against the regex harvest (10 §3, 33 §3). The P/R evidence behind it is unlogged (#50).
- **Constraint 3 (no automatic selection):** met in the text; P34 still awaits the user.
- **Constraint 4 (six skills; helpers by approval):** met; one code-only worker, the rest appendix.
- **Own harness / modules / routes:** met in form. The engine's spec has the gaps in #42–#45; the
  evidence for it is still P1.
- **Bars:** investigate is openly a tie at lower cost; plan and task have bars that need a
  composite (#62) and a detectable effect (#61); review's claim is restated honestly.
- **Numbers:** derived where a source exists; guesses are labelled except #72. The three
  arithmetic slips (#59, #60, 33 §2's tier) all overstate cost, so none hides a decision.

## 6. Open questions for the user

1. Investigate's bar is "within the band of the naked model at ≤ 1.15x". That is not "beat the
   naked model" on recall. Accept that investigate's win is cost and the note that feeds plan?
2. Does "LSP never in review" cover a TypeScript language-service child started by the CLI
   (`refs --exact`), or only the Claude Code `LSP` tool? (#63)
3. Is code choosing search layers deterministically compatible with "no automatic tool
   selection"? (P34, unchanged since v1.)
4. Point of no return: gate on cost ratio and recall only, with turns reported? (#45, #58)
5. Plan acceptance: keep the `ExitPlanMode` path (needs a hook row and a plan-mode write probe) or
   `AskUserQuestion` only? (#56)
6. The harness change for per-arm prompts (#46) and a mandatory second baseline (≈ $28) are the
   first spend. Approve before 41 step 0?

## 7. What I did not check

- I ran no eval, no `node` script and did not re-run `compare.mjs`; #50 reports what the logs
  contain, not what the tools do.
- I did not probe any Claude Code behaviour: `UserPromptSubmit` for typed commands (P37),
  `updatedInput` (#64), `AskUserQuestion`/`ExitPlanMode` hook payloads (P2), `Stop` output fields
  (P17), writes in plan mode (#56), diagnostics push (P36), `agent_id` on `Stop`.
- I did not open the eval result JSON or traces; background-document numbers were checked against
  the documents, not against the raw data.
- I did not read `src/review/*`, `src/checks/*`, `src/page/*` beyond the lines quoted; the
  "touched seams" in 41 are taken from the design's own text.
- I did not count tokens; all context figures are bytes, as in the design.
- Windows: nothing checked.

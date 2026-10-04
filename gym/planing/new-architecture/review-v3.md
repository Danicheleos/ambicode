# Review of `new-architecture/v3` (2026-10-04)

Third round. I read CLAUDE.md, review-v1.md, review-v2.md, all 25 v3 files, the measurement
directory (README with its provenance note, `results.log`, `queries.log`, `compare.mjs`, `run.sh`,
`queries.sh`), and re-checked every code, log and background-document citation v3 makes against the
files at HEAD. Tools: `sed`, `grep`, `wc`, `ls`, `git stash list/show`, `git diff`, and one
read-only unit-test run (`node --test evals/scripts/src/evals-bench.test.mjs`). No eval, no probe,
nothing spent. Numbering continues from review-v2 (last item 74).

## 1. Verdict

**Rework, narrower than v2.** Every structural v2 finding landed in the text, not only in the
CHANGELOG: the fold re-enters (`revise`/`repeat`), gates come in two classes with a registry, the
flag vocabulary is one, the harness gets per-arm prompts, the args envelope is defined, capture is
said to reduce disk and not context, `format` is model-run, costs are recomputed, and every
measurement number says whether it was logged (I checked each against the logs: they match). The
six user decisions are applied; two are mildly extended (§5). What remains is three holes in the
new re-entry semantics and one hole in the sandbox predicate, all local:

1. **A human's *Revise* can be refused by `repeat`** (#75). `revise design` covers `plan-write`;
   when `plan check` has already used `plan-write`'s three executions, the human's answer is
   converted to "continue forward" and the route completes with an unpromoted draft. The human has
   no legal move except a new route.
2. **The sandbox fetch detour is still open** (#76). The FE benchmark config binds
   `mcpServer: claude_ai_Atlassian`, so a key-shaped word in the inline ticket makes
   `args.hasRequirement` true; with the one prompt that carries a URL, **3 of 10 localize cases**
   take fetch → `route next` → `requirements-not-captured` → `route next` → gate → ground. The
   measurement that decides the engine (33 §1–2) compares a distorted arm.
3. **Task's fix round and review's re-run still have no step to run in** (#77): `repeat: 2` bounds
   revises, and no `onFail`/`onAnswer` revise targets `fix` or `review`. Same pattern as v2 #42.

These are local to 12 §4–5, 14 §"hasRequirement", 24 step 7 and 25 step 5. Nothing else blocks
building step 0–3.

## 2. Corrections

`must` = wrong, unsafe, or blocks a measurement; `should` = materially better; `could` = taste.
Counts: 3 must, 12 should, 11 could.

| # | Sev | File §section | What is wrong | Evidence | Fix |
|---|---|---|---|---|---|
| 75 | must | 12 §4–5, 32 §3, 23 step 8, 17 §2 | **The human's *Revise* is refused when a covered step is at its `repeat`.** 12 §4: "a revise that would exceed a covered step's `repeat` is refused with `limit` and the route continues forward". `revise design` covers `design` (repeat 2), `plan-step`, `plan-write` (repeat 3), `plan-check`, `plan-accept`. If `plan check` failed twice, `plan-write` has run 3 times; the human picks *Revise*; the hook appends `acceptance {Revise}` then tries `revise design` → refused → the acceptance stands, `plan-accept` is done, `promote` is skipped (`when gate.plan-accept.is(Accept)` false) → **route complete, draft unpromoted, nothing re-opened**. Even without a check failure, `design: repeat: 2` means a second *Revise* is always refused, and `revisable: [design]` lets the model's own `--revise design` consume the one allowed re-entry before the human sees the plan. 12 §1's default table ("others 1") would refuse even the first *Revise* if a route file forgot `repeat: 2`. 23 step 8 and the gate text say nothing about a bound. | `modules/12-route.md:46, 45, 164-166, 181`; `32-artifacts.md:47, 65, 73, 86`; `skills/23-plan.md:35`; `modules/17-workers.md:43-45` | Either (a) a gate-driven revise resets the `repeat` counters of the steps it covers (the bound then applies per *Revise* cycle, and a separate `maxRevises` on the gate bounds the human), or (b) `repeat` counts only revises whose `from` is that step. Print the remaining count in the gate text ("Revise (1 left)"). Add the fixture: two check failures, then *Revise*, must re-open design. |
| 76 | must | 14 §"hasRequirement", 30 §6, 22 step 1, 33 §0–2 | **`args.hasRequirement` is true for 3 of 10 sandbox localize cases.** The definition counts "a bare key only when `requirements.mcpServer` is set". The FE scaffold copies `benchmarks/FE/.ambicode/config.yaml`, which sets `mcpServer: claude_ai_Atlassian` (BE: `null`). Two FE localize prompts carry key-shaped words and one carries an `http` URL → template → fetch step with no MCP tool → `route next` (`requirements-not-captured`) → `route next` (raised gate) → headless default → ground. Ceremony 2 → 4, one wasted model step, and the arm 33 §1 gates the engine on is distorted on 30% of its cases. v2 #49 is fixed for BE only. | `modules/14-requirements.md:19-24`; `benchmarks/FE/.ambicode/config.yaml` (`mcpServer: claude_ai_Atlassian`), `benchmarks/BE/.ambicode/config.yaml` (`null`); `evals/evals-core/cases/be-vs-5546/scaffold.sh:14` (copies config.yaml); grep counts below | In `--headless`, only `--requirement <url>` makes `hasRequirement` true (the CLI cannot see whether an `mcp__*` tool exists); or 33 §0.2 nulls `mcpServer` in the sandbox scaffold and says so (that changes the scaffold the step-0 baseline uses too). State the chosen rule in 14 and 30 §6. |
| 77 | must | 24 step 7, 25 step 5, 12 §4 | **The fix round and the review re-run still cannot run a second time.** `repeat` is "max executions … 1 + revises that cover it" (12 §1); nothing appends a revise to `fix` or `review`: no `onFail` on a review with findings, no `onAnswer: revise` on `check-only-unauthorized=approve`. 12 §4 says the fix "is a route step (`fix`) followed by `recheck` with `repeat: 2`"; 24 has no `recheck` step and puts `check`+`review` inside `fix`. After the second `review` returns new in-scope findings, the route has no step for a second fix: the model fixes outside the route (v2 #42) or reports Remaining. 25 step 5 "one re-run (`repeat: 2`)" has the same gap: approving a waiting key records an acceptance; nothing re-enters the review step. | `skills/24-task.md:31`; `skills/25-review.md:34`; `modules/12-route.md:46, 171-172` | Declare the loops: `check-only-unauthorized` registry entry gets `onAnswer: {approve: revise <step that ran the check or review>}`; task's `review` code step gets `onFail: revise fix` when findings are in scope and `fix` has `repeat: 2`. Or drop `repeat: 2` and say "one fix round; the rest is Remaining". Reconcile 12 §4's `recheck` with 24. |
| 78 | should | 12 §2.4, §4; 33 §8; P42 | **Pre-answers are invalidated by any `revise` before their gate, and they break 33 §8's own fixture.** `route start --answer plan-accept=Accept` appends `acceptance {via: prompt}` right after `route`. The fold's window for `plan-accept` starts at the last `revise` whose `from` ≤ its index; one `plan check` failure (`revise plan-write`) moves the window past the pre-answer → headless `default-taken Reject` → the plan P42 says is promoted stays a draft. Separately, 33 §8 asserts "a `plan-draft` exists before any `plan-accept` entry (D11)": a pre-answered headless run has the `plan-accept` entry first. | `modules/12-route.md:66-68, 148-153`; `33-measurement.md:131`; `40-open-problems.md:50` | Pre-answers are a kind the fold consults outside the evidence window (`preanswer {gate, option}`), consumed when the gate is reached and recorded as `acceptance {via: prompt}` at that moment; the fixture then holds. Say that a pre-answer accepts an artifact nobody has seen (it is already labelled "answered in the prompt" — keep that). |
| 79 | should | 30 §8 vs 12 §2.3, §4 | **"Resumes from the fold" after a session death contradicts the session-filtered fold.** 12 §4: the slice is "entries after the last `route` of this skill whose session == session"; "a second session on the same ticket gets its own slice". A new `claude` session has a new session id → empty slice → `/ambicode:plan` again **restarts** at step 1 (re-fetch, re-ground, re-design). 12 §2.3's dedup is keyed on `epoch`, which also changes. D11 still holds (the body and the draft are on disk), but nothing resumes, and 30 §8 says it does. | `30-harness.md:97`; `modules/12-route.md:61-65, 149, 174-175` | Define resume: `route start` finding an open route for the slug from another session either adopts it (`route {resumes: <routeId>}`, fold over both) or says "restart; `note list` shows the draft". Pick one and put it in 12 §2 and 30 §8. |
| 80 | should | 32 §4, 12 §3.5, 15 §4, 33 §8, R4 | **The gate registry is incomplete and one entry breaks R4.** Raised gates named in the design but absent from `routes/gates.yaml` as shown: `requirements-expansion-capped` (14 §2), `requirements-conflicting` (14 §5), `requirements-server-ambiguous` (14 §1), `config-unparsable` (20 step 1), and the unnamed "second time → gate: continue without" of `requirements-not-captured` (14 §3). The table test "iterates both the route files and the registry" covers only what the registry lists. `project-ambiguous` has `default: null`, against 01 §1 "every gate … has a tested release and a non-acting default", R4, and 15 §4's build rule (a null default passes the "acting default fails" check by accident). | `32-artifacts.md:102-132` (122: `default: null`); `modules/14-requirements.md:46-47, 62-64, 87-89, 104-105`; `skills/20-init.md:21`; `01-goals-and-constraints.md:20-21, 92`; `modules/15-guard.md:83-84` | List every raised gate in 32 §4 (a one-line form is fine), give the not-captured gate an id (`requirements-not-captured-twice`), and give `project-ambiguous` a non-acting default (`stop`, release `--project`) or an explicit "no-default" class that the schema names and the table test drives. |
| 81 | should | 14 §2–3 | **`requirements-expansion-capped` fires after the choice is moot.** The CLI learns the child count only at `route next` (ground) from the captures; the hook "does nothing else: no map, no step message". By then the model has followed the template's "`getJiraIssue` per child with the same field list" for every child, or not. The gate's options *read all / read these / none* have nothing left to decide. | `modules/14-requirements.md:58-64, 76-77` | The template says: "after the JQL, if it returns more than 10 hits, stop and run `route next`"; ground then raises the gate before the per-child reads and prints the chosen keys as the next fetch step. Count the detour in 22's ceremony table (+1). |
| 82 | should | 12 §3.1, CHANGELOG #45, 00, 02 §5, 22–25 §Ceremony | **"Ceremony turn" is claimed defined and is not; the counts apply it inconsistently.** CHANGELOG #45: "Ceremony turn defined (route-only calls); work commands listed separately." No sentence in 12 §3.1 or elsewhere defines it. 23 counts `plan check` as ceremony; 24 counts `check`/`format`/`review` as work; 22 counts `note save` as ceremony, 24 as "0–1". 00 says "1–4 per route" while plan is 4 + N. 22/24 omit the `check-only-unauthorized` gate that a `propose`-policy red `check` raises (+1 ask). The counts are honest once the convention is fixed, which is why this is `should`. | `CHANGELOG.md:26`; `00-README.md:33-34`; `modules/12-route.md:78-82`; `skills/22-investigate.md:46-50`; `skills/23-plan.md:43-47`; `skills/24-task.md:44-48`; `skills/25-review.md:42-43` | One definition in 12 §3.1: ceremony = `route next`, `note save`/`promote`, and gate asks; work = `check`, `format`, `review`, `plan check`, `policy check`. Re-label 23's `plan check` column as work (plan → 3 + N) or 24's `check` as ceremony; 00 says "1–4 + gates". |
| 83 | should | 31 (`map --layers`), 10 §1 Purpose, D9 | **The model can choose search layers.** 31 gives `map` a `--layers a,b,c (override, recorded)` flag, and `$A map …` is a model-facing command (10 Interfaces). 10 §1: "code chooses deterministically, the model never does". D9 allows code's deterministic choice declared in config; a model-typed override is the automatic selection D2 forbids, recorded or not. | `31-cli.md:15`; `modules/10-search.md:9-10, 148` | `--layers` accepted only when the caller is a route step (`cause ≠ model`), or dropped; a model wanting other layers edits config (the D9 path). |
| 84 | should | 16 Inputs, §2, Failure modes; 31 `check`; 12 §3.4 | **`check --approve <key>` acts on a model-typed flag interactively.** `propose` means a human must approve the run; 16's release is "`--approve` or report as a gap", and the flag is on `check` itself (as `review --approve` is today, `src/cli/main.ts:120`). 12 §3.4's rule — acting options honoured from `hook`, `prompt`, or `flag` only headless — is not applied to it. Running a project command under `propose` is the act the policy exists to gate. | `modules/16-checks-review.md:11-12, 33-35, 89`; `31-cli.md:28`; `modules/12-route.md:122-125`; `src/cli/main.ts:120` | `--approve <key>` is honoured only with an `acceptance {gate: check-only-unauthorized, key}` on record under 12 §3.4's rule; otherwise `declined {via: flag, reason: acting-needs-human}` and the gate re-prints — same as `review-offer`. Say so in 16 and 31. |
| 85 | should | 17 §1, §3 vs 23 step 7, 32 §3, 12 §3.5 | **The worker proposal gate belongs to no class and never appears.** 17 §1: "The `worker` route step prints a proposal; options *run* / *inline* / *skip*; default and release inline"; 17 §3 shows the text for `plan-check`. The plan route runs `workers.planCheck` inside a `code` step at the tail of the model-run `plan check` (23 step 7, 32 §3 `plan-check`), so no proposal is printed, and the proposal gate is neither a declared `human` step nor in `gates.yaml`, so 15 §4's table test misses it. | `modules/17-workers.md:27-29, 50-55`; `skills/23-plan.md:34`; `32-artifacts.md:74-78`; `modules/12-route.md:96, 131-135` | Say `plan check` is code with no gate (it spends nothing); move the proposal text to the appendix and give the `worker` step's gate a class (declared, `gate` allowed on `worker` steps) when a model worker ships. |
| 86 | should | 12 §1 (`onAnswer`, `repeat` defaults), 22 step 3a, 21 step 4 | **The DSL cannot express two things the routes use.** (a) `onAnswer` is `{<option>: revise <stepId>}` (option keys, no arguments); 22 step 3a needs `{<free text>: revise ground --term <answer>}` — a free-text key and an answer binding. (b) `repeat` defaults name `map 2` and `drafts 3`; `map` is a module call inside the `ground` step, not a step, and the rules step is `draft`. Under "others 1", `revise ground` is refused on its first use unless the route file sets `repeat: 2` on `ground`; nothing in 22 or 32 does. | `modules/12-route.md:43, 46, 170-171`; `skills/22-investigate.md:35-36`; `skills/21-rules.md:25` | `onAnswer` gains a `"*"` key and `$answer` substitution (`"*": revise ground --term $answer`); defaults name step ids (`ground 2`, `draft 3`); the investigate route in 32 or 22 shows `ground: repeat: 2`. |
| 87 | should | 33 §0.2, §2; 41 step 0 | **Step 0's baseline and §2's "60 runs ≈ $11" are two different runs, and the second does not exist in the harness.** The second baseline (26 cases, both arms, ≈ $28) runs at step 0, before the route engine (step 3), so its plugin arm measures v0.4.0 with a typed prompt; its value is the naked reference. §2 then costs "10 localize cases × 3 runs × 2 arms = 60 runs ≈ $11", but `evals:decide` is 26 cases, plugin arm only, gated against the baseline's naked arm (README:198-204); no 10-case two-arm tier exists, and §0's harness list does not add one. | `33-measurement.md:17-24, 55-57`; `evals/evals-core/README.md:198-209`; `41-migration.md:8` | State the sequence: step 0 baseline = naked reference (its `prompt.md` is unchanged, so the gate accepts it); after step 3 run `evals:decide` (plugin arm, 26 cases, ≈ $14 projected) gated against it, or add "a `--cases localize` two-arm tier" to §0's harness list and cost it. |
| 88 | should | 30 §1, P33 | **Hook time is understated and the start work is unquantified.** "Worst case per investigate run: 14 × 89 ms" — the matrix's own maxima sum to 21 `$A hook` spawns for investigate (1 + 3 + 11 + 1 + 3 + 1 + 1), 24 with four gates: ≈ 1.9–2.1 s + 340 ms. `UserPromptSubmit` is "89 ms (+ start work)": in the no-requirement path `route start` runs ground synchronously inside the hook — shortlist ×2 at 0.3–1 s each (10 §1), harvest, policy — 1–3 s on the user's prompt, not stated anywhere. Also `docs/compatibility.md:395` measured the `UserPromptSubmit` hook at ~190 ms on the reference machine against M15's 89 ms; v3 quotes one without naming the other. | `30-harness.md:12-20, 26-27`; `modules/10-search.md:41`; `docs/compatibility.md:393-396`; `01-goals-and-constraints.md:51` | Recompute from the matrix (or say "typical" and give the maximum too); add "start work ≈ shortlist + harvest + policy, I'd guess 1–3 s, measured in 33 §7"; cite both hook timings or explain the gap. |
| 89 | should | 33 "What this cannot show", 01 §4, 10 §1 | **Python is absent from the measurement plan.** The project targets TypeScript/Python repositories; the harvest patterns and `refs` cover Python; 33 says "anything about Python" cannot be shown and no walk case, probe or decision point touches it. Either it is a v3 non-goal (then 01 §4 says so) or one Python walk exists. | `33-measurement.md:139-142`; `01-goals-and-constraints.md:81-83`; `modules/10-search.md:42` | One line in 01 §4 or one Python walk case in 33 §1 (walk tier, ≈ $0.2). |
| 90 | could | P53, 14 §1, 30 §1, §8 | The MCP hook spawns on **every** `mcp__*` call in every session (89 ms); only the work is route-gated. P53 and 14 §1 say "while a route is active"; 30 §1's "Fires per run" and 30 §8 ("exits in < 90 ms") have it right. | `40-open-problems.md:61`; `modules/14-requirements.md:15-16, 44`; `30-harness.md:14, 101` | "spawns on every `mcp__*` call; exits early when no route is active"; count the no-route spawns in 33 §7. |
| 91 | could | 13 §1, 41 Compatibility | "Today's two kinds are `note` and `prompt` (`note.ts:78`, `prepare.ts:138`)": `prepare.ts:138` is a `policyProvenance` entry `{kind: 'prompt', reference, contentHash}`, not a ledger line; the only `appendLedger` writer at HEAD is `note`. **This corrects review-v2 #68, which asserted the same two kinds — my error.** 41's "2 ledger kinds" inherits it. | `src/cli/commands/prepare.ts:131-139`; `grep -rn "appendLedger(" src` → `kind: 'note'` only; `modules/13-evidence.md:50-51`; `41-migration.md:49-50` | "Today's one kind is `note`." |
| 92 | could | 01 §1 | "replay-miss in 10/24 and 16/24 runs": the baseline counts 10 and **15** per `review` call ("1 below the text count of 16"); its cost rows say 11 and 19 replayed. Say which count. | `gym/planing/investigation/archive/baseline-2026-10-02.md:28-31, 44, 48` | "10/24 and 15/24 (16 by text)". |
| 93 | could | 10 §3 | In the agentmap row, "`--relates` returned 65 of 179 importers" sits beside "(logged)" but derives from the unlogged P/R run (0.36 × 179); `queries.log` holds the FE `relates` output only to 900 bytes. "`--callers` found 0" is logged (`total: 0`, exit 1). | `modules/10-search.md:90-91, 103`; `queries.log:87-91` | Label 65/179 "unlogged re-run" like its neighbours. |
| 94 | could | 12 §3.3, 14 §3, §5 | The conflict gate is `requirements-conflicting` (14 §5) and its answer is `--answer conflict=<source>` (12 §3.3, 14 §3): two ids for one gate. | `modules/12-route.md:106`; `modules/14-requirements.md:92, 104-105` | One id. |
| 95 | could | 12 §3.1 vs 11, 20, 21, 31 | The evidence-writing list (12 §3.1) omits `policy check --drafts`, `note promote`, `rules apply`, `init --apply`, which 11 Outputs, 21, 20 step 5 and 31 (⤵) say advance at their tail. | `modules/12-route.md:78-79`; `modules/11-policy.md:19-20`; `31-cli.md:25, 34, 39` | One list, in 12 §3.1, that 31's ⤵ marks mirror. |
| 96 | could | 20 step 3–4 | *Adjust* at `init-apply`: the adjusted values come from the model's `--set k=v` with only `acceptance {answer: Adjust}` on record; the human's values are on record only if the free text carries them. | `skills/20-init.md:23-24` | *Adjust* re-prints the proposal with the human's free text quoted and asks again (*Apply as adjusted*), so the written values have an `acceptance` whose `answer` names them. |
| 97 | could | 12 §3.3 (`--default`), P3, R12 | A model-typed `--default <gate>` interactively records `default-taken {via: flag}` without the human being asked — on record and non-acting, but it is the "present human not asked" P3 guards against, and it bypasses R12's three re-prints. | `modules/12-route.md:104`; `40-open-problems.md:11` | `--default` only in headless or with `gate.asked ≥ 1`. |
| 98 | could | 32 §3, 12 §1 | `when: gate.plan-accept.is(Accept)` — over which window? After *Reject* then a late *Accept* (P3), or after a revise, the predicate's slice is undefined. | `32-artifacts.md:89`; `modules/12-route.md:42` | "the latest answer in the step's current evidence window". |
| 99 | could | 33 §5 | The detectable effect treats 30 runs as independent; 3 runs per case are correlated, so the effective n is between 10 and 30 and the detectable gain is above 20 pp. The arithmetic (SD ≈ 9 pp) is right for independent trials. | `33-measurement.md:99-100` | "≥ 20 pp, more if runs within a case agree". |
| 100 | could | 50, 20 Open problems, 40 | 50's last row (`budget.codeCalls`, interactive `wallMinutes`) has entry condition "—", against the file's own rule. 20 lists P24 under Open problems; 40 marks it closed. | `50-backlog.md:16, 3-4`; `skills/20-init.md:64`; `40-open-problems.md:32` | "no entry condition: dropped" or a condition; drop P24 from 20. |

Grep counts behind #76 (prompt text not copied; counts only):

```
$ grep -h mcpServer benchmarks/{BE,FE}/.ambicode/config.yaml
BE:   mcpServer: null
FE:   mcpServer: claude_ai_Atlassian
$ for d in evals/evals-core/cases/fe-vs-*/ (localize only): lines matching \b[A-Z][A-Z0-9]+-[0-9]+\b
fe-vs-5164 0   fe-vs-6181 0   fe-vs-6253 1   fe-vs-6269 1   fe-vs-6334 0
$ prompts containing "http": 25 of 26 → 0; fe-vs-6334 → 1
```

Measurement numbers checked against the logs (all match where logged): codeindex cold 875/914/5668 ms
→ 0.9/0.9/5.7 s, warm 148/151/534 ms; agentmap cold 1218/1270/6145 ms, warm 98/112/223 ms; scip
4037/4404/11595 ms; `git grep -w -l` 70/151 ms; agentmap `relates` 115/199 ms; codeindex index
6.4M/33M, scip 13.0/36.3 MB. Labelled "unlogged re-run" in v3 and indeed absent from the logs:
codeindex `refs` 236/483 ms, the language-service line, the four P/R rows, grep 17/41 in-process.
M22 reproduced: `node --test evals/scripts/src/evals-bench.test.mjs` fails at HEAD (`'test failed'`,
the import of the stashed `reuse-score.mjs`); `stash@{0}` holds the four files.

Code citations verified correct: `git.ts:217-229`, `dependents.ts:25-33, 35-40`,
`prepare-on-skill.ts:20, 61-62`, `hook.ts:33`, `hooks.json:9`, `guard-core.ts:31, 33`,
`note.ts:78`, `evals-bench.mjs:9, 169, 189, 201, 704, 971`, `evals-core/README.md:198-204`,
`compatibility.md:383-387`, `skills/plan/SKILL.md:5`, skill sizes 4.2–10.6 KB (four model-facing
5.9–10.6), 12 packs / 823 lines, 8 review cases + 8 forced twins, `MAX_DEPENDENTS = 8`, 13
`requirements-*` codes, 262,144-byte limits. Wrong: `prepare.ts:138` (#91). Unverified platform
claims are labelled as such in v3 (P2, P17, P37, P47, P48, Git Bash on Windows); I did not probe
them.

## 3. Three scenarios walked through the texts

**A. Interactive `/ambicode:plan ORD-17`, *Revise* after a failing `plan check`.** Start runs
`template`, prints `fetch`; the model fetches; `route next` (#1) → `ground` → `design`. Two decision
gates by marker, answers bound by the hook, which re-prints `design` as `additionalContext` (P48).
`route next` (#2) → `plan-step` → `plan-write`. The model writes `steps/plan-body.md`, runs `plan
check` → tail: `plan-draft` saved (D11 holds from here), 2 bad anchors → `onFail: revise plan-write`
(`revise L9`), the write step re-printed with the list. Second write, `plan check` → 1 bad anchor →
`revise plan-write` (`revise L13`; `plan-write` now at 3 of 3). Third write, `plan check` → 1 bad
anchor → revise refused, `limit {repeat, plan-write}`, "forward with the last evidence": draft saved,
`plan-accept` printed with Known limitations. The human picks **Revise**. The hook appends
`acceptance {plan-accept, Revise, via: hook}`, then `onAnswer: revise design` → `design` is at 1 of
2 but `plan-write` is at 3 of 3 → **refused** (12 §4) → no `revise` entry → `plan-accept` is done →
`promote` skipped → **route complete**. The hook's `additionalContext` can only say "complete"; the
draft is unpromoted; the human asked for a revision and there is no step to run it in (#75). The
model's only legal moves: `route stop` or a new `/ambicode:plan` (supersede, fresh slice, re-fetch).
Had `plan check` failed once instead of twice, *Revise* succeeds: `design` (2/2) → `route next` (#3)
→ `plan-write` (3/3) → `plan check`; any failure now is `limit`; a second *Revise* is refused the
same way. Ceremony on the long path: `route next` ×3, `plan check` ×4, gates N + 2 — 23's table says
"+3" for one *Revise*, which holds only when the first pass had no check revision.

**B. Sandbox `/ambicode:investigate <question + inline FE ticket> --headless` (33 §2), case with a
key-shaped word.** If P37 holds, the `UserPromptSubmit` hook runs `route start investigate "<args>"
--headless`. The scaffold's config binds `claude_ai_Atlassian`, the ticket text has a `VS-nnnn`
word → `args.hasRequirement` true → `template` prints the fetch calls → the model has no MCP tool;
it runs `route next` (#1) → `requirements-not-captured` names the call → `route next` (#2) → raised
gate "continue without" → headless default → `ground` with `builtFrom: args` → `read` step. The
model reads, `route next` (#3) → report step → `note save` (#4) → Stop (c) checks the note's
citations (needs `transcript_path` in the sandbox — P9 fails open). **Ceremony 4 against the table's
2**, one model step spent on a fetch that cannot happen, and the arm compared in 33 §1 carries it
on 3 of 10 cases (#76). On BE cases and FE cases without a key the walk is as 22 says: start →
ground → read → `route next` → report → `note save` → Stop: 2. The naked arm gets `prompt.md`
(#46 fixed). Nothing is illegal for the model; the measurement is what suffers.

**C. Interactive `/ambicode:task "iteration 2 of ORD-17"`, `web/unit` under `propose`, review with
findings and one waiting key.** Start tail runs step 2, prints `red`. The model runs `check … --only
spec --phase red` → `propose` → tail raises `check-only-unauthorized` (gate 1); the model asks; the
human approves via hook; the hook's `additionalContext` is the `red` step again (the check did not
run). The model re-runs `check --approve web/unit` — 16 says this is the release; whether the
acceptance on record is required or the flag alone acts is unspecified (#84). Red proven (`failed ≥
1`) → `green` printed. Edits; `check --phase green` → tail: `produces` missing (`format`) → "run
`format`"; `format` → tail prints `review-offer` (gate 2) with the estimate; human *run*; hook tail
prints step 6's command; `review --task` → a waiting key → raised gate per key (gate 3); approve;
the model re-runs `review` (no revise exists for it, but the model-run command is legal) → 2
findings → `fix`: edits, `check --phase green`, `review` → 1 new in-scope finding → **no second
`fix`** (#77): the model fixes outside the route or writes it under Remaining; the report step prints
at the tail of the last `review`; the model pastes Evidence / Not verified; `note save --iteration
2`; Stop (b) checks the sections and `check {green, ran ≥ 1}`. Ceremony: 3 gates (+ scope if any) +
`note save` = 4 against the table's "1–3" (#82: the red `propose` gate is uncounted); work: `check`
×4, `format` ×1, `review` ×3. The route is coherent; the second fix round and the approve flag are
the two places where the text leaves the model to improvise.

## 4. Verification of the v2 corrections against the v3 text

Status: **fixed** = the text says it; **partial** = some of it; **new problem** = fixed and the fix
created an item above. CHANGELOG-vs-text mismatches are in the last column.

| # | v2 item | Status | v3 location | Note / CHANGELOG mismatch |
|---|---|---|---|---|
| 42 | Fold cannot go backwards | fixed, new problems | 12 §1 (`onAnswer`, `onFail`, `revisable`, `repeat`), §4, §5; 32 §3; 17 §2; 11 §4; 21 step 5; 22 step 3a; 23 steps 7–8 | Human *Revise* refusable (#75); fix/re-run rounds unreachable (#77); pre-answers invalidated (#78). CHANGELOG: "task's fix round is a `fix` step with `repeat: 2`" — present but nothing re-enters it |
| 43 | Most gates not declarable | fixed, new problems | 12 §3.5, 15 §4, 32 §4, 33 §8 | Registry incomplete, `project-ambiguous` null default (#80); worker proposal gate classless (#85). CHANGELOG: "The table test iterates both" — only the listed gates |
| 44 | `--default` two meanings; headless cannot act | fixed | 12 §3.3, §2.4; 31; 30 §6; 24 step 5; 25 step 4 | — |
| 45 | Ceremony vs engine | partial | 12 §3.1; 02 §5; 22–25 §Ceremony; 33 §1 | Rule changed and counts recomputed ✓; "ceremony turn defined" is not in the text; `plan check` vs `check` inconsistent; 00 "1–4" (#82) |
| 46 | One prompt for both arms | fixed, new problem | 33 §0.2, §2; 41 step 0; M22 | Step-0 baseline vs §2's non-existent two-arm tier (#87) |
| 47 | Capture reduces context | fixed | 30 §3; 14 §2–3; R8; 17 appendix | — |
| 48 | Harness writes outside `.ambicode/` | fixed | 16 §3; 24 step 4; 30 §9; 20 step 4 | — |
| 49 | No-URL path unspecified | fixed, new problem | 14 "hasRequirement", §3; 32 §6; 22 step 1; 30 §6 | Defined ✓; the FE scaffold's bound server and one URL-bearing prompt re-open the detour (#76) |
| 50 | Numbers not in any log | fixed | 10 §1, §3; M21; measurements README provenance note; 33 §0.5 | 65/179 unlabelled (#93) |
| 51 | Harvest misdescribed | fixed | 10 §1 (`harvest` row) | — |
| 52 | MCP matcher vs binding | fixed, new problem | 30 §1; 14 §1; P53 | P53 wording (#90) |
| 53 | Duplicate ids | fixed | 13 §1; 32 §2 | — |
| 54 | Unanswered counts calls | fixed | 12 §3.4; 13 §1 | — |
| 55 | Acting options from `via: flag` | fixed, adjacent gap | 12 §3.4; 20 step 4; 21 step 8; 24 step 5; 25 step 4 | `check --approve` not under the rule (#84) |
| 56 | `ExitPlanMode` hook row | fixed (changed: dropped) | 23 step 8; 50 | — |
| 57 | Plan `Write` grant | fixed | 23 "What the model loads"; 15 §1; 41 Kept | — |
| 58 | 33 §1 self-contradiction | fixed | 33 §1 | — |
| 59 | Plan eval arithmetic | fixed | 33 §4; 23; P43 | — |
| 60 | Review tier arithmetic | fixed | 33 §0.7, §6; 25 | — |
| 61 | Task detectable effect | fixed | 33 §5; 01 §1; P49 | Independence assumption (#99, could) |
| 62 | Plan composite | fixed | 33 §4; 01 §1; P50 | — |
| 63 | Language service in review | fixed (via D8) | 10; 16 §6; 25; 50 | — |
| 64 | `updatedInput` unverified | fixed | 15 Outputs, §1; 31; 33 §0.4; P47 | — |
| 65 | Review stop on missing requirement | fixed | 12 §3.5; 32 §4; 14 Failure modes; 25 step 2 | — |
| 66 | `scope` answer unused | fixed, new problem | 12 §1 (`when`), §4; 22 step 3a | The DSL cannot express the free-text/`--term` form (#86) |
| 67 | Stash holds four files | fixed | 33 §0.1; 41 step 0; M22 | — |
| 68 | "15 kinds" → 19 | partial | 13 §1 ("20") | Count fixed; "today's two" still wrong, and so was #68 (#91) |
| 69 | `--resolution` | fixed (changed) | 12 §3.3; 14 §3; 31 | Gate id vs answer id (#94) |
| 70 | `review.eta` in two rows | fixed | 41 Kept row 1 | — |
| 71 | CHANGELOG/P44/F5 | fixed | CHANGELOG §C; 40 P44; 16 §4 | — |
| 72 | Unlabelled guesses | fixed | 10 §1, §3; P12 | — |
| 73 | Dead `Skill` hook as fallback | fixed | 41 step 3 | — |
| 74 | `ask`-on-git refusal rate | fixed | 33 §0.6, §7; 15 Failure modes | — |

CHANGELOG mismatches, summarised: #45 ("ceremony turn defined"), #43 ("iterates both" — partial),
#42 (fix round "is a step" but unreachable), #68 ("today's two named" — one kind), #66 (the DSL
form is not defined). §C and §D of the CHANGELOG are accurate.

## 5. Were the user's six decisions applied faithfully?

1. **Investigate's bar (D7).** Faithful. 01 §1, 22 Purpose and 33 §2 carry the same wording; the
   win is stated as cost and the note; the module seams for tuning it alone are real (10 Interfaces).
2. **LSP to the backlog (D8).** Faithful, read broadly on purpose: the user's answer was to review-v2
   Q2, which asked specifically about the language-service child (`refs --exact`), so treating it as
   "LSP" follows the question. Removed beyond the LSP tool: `refs --exact`, `requirements.lsp`,
   `task.lspPlugins`, the diagnostics probe, `claude plugin list` in init, and
   `skills/review/references/impact.md` as a file (its `Grep -w` fallback survives as `refs`; review
   dependents are "unchanged in the default configuration", 16 §6). Nothing the user protected was
   removed; each item has an entry condition (50). One consequence the text names honestly:
   colliding names have no exact answer in v3 (P51) and the "verify imports" substitute is a
   model-obeyed instruction (M2).
3. **Code may choose layers if declared, analysable, editable (D9).** Faithful in config, ledger,
   `route status` and the report. Violated in one place: `map --layers` is a model-typable override
   (#83). Either drop it or restrict it to route callers.
4. **Point of no return on cost and recall; turns reported; the user decides (D10).** Faithful at
   41 step 3 and 33 §1; measurement rigor kept — turns are still measured and reported, `eval-gate`
   still fails CI on a fired criterion (P52), the loser's numbers are committed (33 §9). **Extended**:
   R13 generalises "the user decides" to every decision point (plan, task, review, index), and 33 §9
   says "no script deletes or disables a component". The user ruled on the rollback at the point of
   no return; the generalisation is in the spirit but was not asked for — open question 3.
5. **Draft first; `ExitPlanMode` deferred (D11, D12).** Faithful. The draft is saved at the tail of
   `plan check`, before the gate (23 step 7, 32 §3), and `note save --kind plan` no longer exists.
   One honest edge is stated (30 §8): between `Write plan-body.md` and `plan check` the body is on
   disk but no `plan-draft` note exists. The user's requirement (nothing lost) holds; the resume
   claim beside it does not (#79).
6. **Harness change and second baseline ≈ $28 approved as step 0 (D13).** Faithful, mildly
   **weakened**: the user approved the spend; D13 and 41 step 0 add "the run itself on an explicit
   go", a second approval for the same $28. Harmless, but it is a wait state the user did not ask
   for — open question 6. Also the step-0 baseline's role should be stated (#87).

Constraints 2 and 4: met (one adapter off by default; one code-only worker, the rest appendix).
Goals: modular/layered ✓, framework form answered ✓ (02 §3), own harness ✓, global modules ✓,
routes that manage loops ✓ with the holes in #75/#77, artifacts shared between skills ✓, every
claim has a measurement and a decision point ✓ (with #87's sequencing gap). Missing entirely:
Python (#89). Made cleaner than reality: the ceremony tables (#82, scenario C), 30 §1's hook total
(#88), 30 §8's "resumes" (#79), 17's worker proposal that never prints (#85).

## 6. Open questions for the user

1. Should a human gate answer (*Revise*) override `repeat` on the steps it covers, or is "Revise
   refused after the bound, shown in the gate text" acceptable? (#75)
2. May the model override search layers with `map --layers` (recorded `via: model`), or is the
   override route/config-only under D9? (#83)
3. R13 generalises "the user decides" from the point of no return to every decision point (plan,
   task, review, index). Intended? (§5.4)
4. Sandbox: null `mcpServer` in the FE scaffold config (this also changes what the step-0 baseline
   runs on), or make `--headless` require `--requirement` for a fetch step? (#76)
5. Python: a stated v3 non-goal, or one walk case? (#89)
6. D13: is the ≈ $28 baseline to run now, or does the author wait for another go as 41 step 0 says?

## 7. What I did not check

- I ran no eval and no probe; P2, P17, P37, P47, P48 and the Windows assumption remain unverified
  platform facts, labelled as such in v3.
- I ran one read-only unit test (`node --test evals/scripts/src/evals-bench.test.mjs`) to confirm
  M22; I did not run `npm run verify` or `compare.mjs`.
- I counted key-shaped words and `http` in the eval prompts with `grep -c`; I did not read or copy
  the prompts (NDA).
- I did not read `src/review/*`, `src/checks/*`, `src/page/*` beyond the lines quoted; 41's "touched
  seams" are taken from the design.
- I did not count tokens; all context figures are bytes, as in the design.
- I did not diff v2 → v3 file by file; the v2-items table is checked against the v3 text, not
  against a diff.

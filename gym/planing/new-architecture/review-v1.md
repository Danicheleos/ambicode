# Review of `new-architecture/v1` (2026-10-03)

Independent review. I read CLAUDE.md, the nine background documents, all 20 design files, the
measurement notes and `results.log`, and checked the design's statements about v0.4.0 against
`src/`, `skills/`, `hooks/hooks.json`, `docs/compatibility.md`, `package.json` and the eval cases.
I ran one read-only test (`node --test evals/scripts/src/evals-bench.test.mjs`) and shell
measurements (`wc`, `grep`, `git stash list`). I ran no evals and changed nothing.

## 1. Verdict in five lines

**Rework.** The direction is right and well-sourced (hook-run steps, record-derived evidence, epic
expansion, code-shaped two-pass terms, `plan check`, headless releases), but the route engine's
interactive-session semantics are inconsistent in ways that would misfire in the first week, the
main search gain (pass 2) is unavailable in the configuration the design measures, and the
measurement plan does not account for what decision D2 does to the eval harness. The three things
that most need to change:

1. **Make `map` pass 2 index-independent** (harvest exported identifiers from the top-N files by
   regex). Today pass 2 needs L3, L3 defaults to `none`, and 33 §1–2 measure with `none`: the B2
   fix (1 → 15/15) is not in the measured configuration (§4 C10).
2. **Fix the route engine for interactive sessions**: gate defaults only on an explicit, recorded
   `--headless`/`--default`; the Stop hook checks report-shaped stops only; the ground step runs
   once after fetch, not once per MCP read; the fold completes on `produces`; `check` repeat ≥ 4;
   acting defaults (init apply, task/review "run") become non-acting (§4 C1–C7).
3. **Fix the measurement plan**: convert eval prompts to typed `/ambicode:` commands and probe
   `UserPromptSubmit` in the sandbox before building anything; pick one investigate bar (01 says
   win by a band, 22 accepts a loss within a band); cost the plan and task suites in dollars and
   state that review has no kill criterion (§7).

## 2. Claims checked against sources

### 2.1 Verified (source agrees)

| Design claim | Where | Source checked | Result |
|---|---|---|---|
| localize recall 0.720 vs 0.697, band 0.101, 1.42x cost, +4.7 turns | 00, 01 §1, M1 | baseline §Localize, gate output | ✓ |
| review invalid: replay-miss 10/24 neutral, 16/24 forced | 01 §1 | baseline §Correction | ✓ (gate counted 15 per `review` call; text count 16) |
| 1 Edit/Write in 7,709 tool calls across 712 traces | 01 §1, P18 | known-gaps G17 | ✓ |
| M1: 3 of 4 extra calls are ceremony in be-vs-5546 | 01 | baseline Example 1 | ✓ |
| M2: `prepare` ran 26/29 Opus, 3/50 Sonnet | 01 | gap-plan §2 (1/30 + 1/10 + 1/10) | ✓ |
| M3: hook `prepare` present in 7/7 note-saving runs | 01 | baseline §Localize correction | ✓ |
| M4: "never truncate" violated 28/31; B2 wording 0 cuts in 4 | 01 | gap-plan §1, iteration 2 | ✓ |
| M5: 1 irrelevant candidate vs 15/15 | 01 | real-run B2 | ✓ |
| M6: recall@15 BE 0.499 / FE 0.123; non-source 38% of slots | 01 | known-gaps G10 | ✓ |
| M7: Bash reads 164 vs Read 85 (Opus), 177 vs 24 (Sonnet) | 01 | gap-plan §1 | ✓ |
| M8: L arm 0/4 LSP calls; A arm 1,0,1,0 | 01 | direction §Step 2 walk | ✓ ("findReferences 0 of 12" counts 4 naked runs that have no LSP; 0 of 8 is the honest figure) |
| M9: 2/11 refs at once, 11 after 5 s; 1/22, 22 after 11 s | 01 | known-gaps G25 | ✓ |
| M10: N and L 1.00/1.00 in 4/4; A 0.75 | 01 | known-gaps G27 | ✓ |
| M12: `cd X && node … note save <<EOF` denied; +20k output tokens | 01 | real-run B3; `src/hook/guard-core.ts:31` `NOTE_SAVE`, `:33` `WRITES` (`=>` matches as a redirect) | ✓ |
| M13: 95 KB plan left as draft | 01 | real-run B4 | ✓ |
| M14: inline ≤ 9,800 / ≥ 10,400 to a file | 01 | `src/hook/prepare-on-skill.ts:20` `INLINE_LIMIT = 9_800`; gap-plan iteration 4 | ✓ (30,000-char Bash window not re-verified by me) |
| M15: guard 34 ms, `$A hook` 89 ms, `node -e 0` 29 ms | 01 | gap-plan slice 1 | ✓ |
| M16: investigate 4.1 KB, plan 13.3–14.0, task 16.2–16.5, rules 5.8 | 01, 11 §2 | gap-plan G6 | ✓ |
| M17: task loads 5 modules; SkillsBench +19 vs +10 pp | 01 | best-practices B1 | ✓ |
| M18: `--safe-mode --restricted --tools Read,Grep,Glob` | 01 | `src/review/claude-reviewer.ts:35-45` `REQUIRED_FLAGS` | ✓ |
| M19: $0.36, 1.0 min, 9 LSP calls | 01 | real-run §5 session A | ✓ ("every anchor in range" is the plan scorer's result, not the note's) |
| M20: 214k of 500k, plan written twice | 01 | real-run §5 session B | ✓ |
| M21 / 10 §3: index timings and P/R table | 01, 10 | `measurements-2026-10-03/README.md`, `results.log` | ✓ matches the logs (not re-run) |
| today's body 6.5 KB, `requirements-mcp.md` 5.4 KB, `prepare-output.md` 4.7 KB | 02 §5, 30 §3 | `wc -c`: 6,503 / 5,438 / 4,738 | ✓ |
| `requirements-mcp.md` 818 words | 14 | `wc -w`: 818 | ✓ |
| `allowed-tools: Write(**)` already gone from plan/investigate | 02 §6 | `skills/{plan,investigate}/SKILL.md` frontmatter: `Read, Grep, Glob, Bash(node *ambicode.mjs*)` | ✓ |
| init and rules are `disable-model-invocation: true` | 20, 21 | frontmatter | ✓ |
| task keeps `Edit(**)`, `Write(**)` | 02 §6, 24 | `skills/task/SKILL.md` frontmatter | ✓ |
| 823 lines of built-in packs | 11 | `wc -l policies/*.yaml` = 823 | ✓ (directory has 13 entries; I did not check which is not a pack) |
| `MAX_SNAPSHOT_FILE_BYTES` 262,144 | 16 | `src/config/defaults.ts:62` | ✓ |
| `AskUserQuestion` result carries `answers: {question: choice}` | 12 Inputs | known-gaps G13 | ✓ (seen in a transcript; the hook payload shape is still P2) |
| `PostCompact` cannot carry context; 2.1.278 | 30 §1 | `src/contracts/hook.ts:31-33`; `docs/compatibility.md:383-391` | ✓ |
| contract is 370 words | 30 §1 | `prompts/shared-operating-contract.md`: 370 words, 2,275 bytes | ✓ |
| language-service code exists in `impact-cases.mjs` | 10 §1 L4 | `evals/scripts/src/impact-cases.mjs:62-77` (`createLanguageService`, `getReferencesAtPosition`) | ✓ (about 20 lines, not "60") |
| `evals-bench.mjs` imports a missing `reuse-score.mjs`; the test fails; `verify` cannot be green | 33 §0 | `evals-bench.mjs:9`; `node --test evals-bench.test.mjs` → 1 fail; `test:unit` glob includes `evals/scripts/src/*.test.mjs` | ✓ **Addendum:** the file is in `stash@{0}` ("WIP on training_v2: 6d5077c 369"); `git checkout stash@{0} -- evals/scripts/src/reuse-score.mjs` restores it |
| the ticket hook hard-codes `--activity investigate` (B5) | 01 D-list, 12 | `src/hook/prepare-on-skill.ts:116` | ✓ |
| the `--task-open` suggestion is the whole arg string (B6) | real-run | `prepare-on-skill.ts:68` | ✓ |
| `prepare` has `--task-open` but no `--task` | 13 §2, 12 | `src/cli/commands/prepare.ts:45` | ✓ |
| hooks today: PostToolUse(Edit\|Write, mcp, Skill), PreToolUse(Bash with 3 `if:`, Write\|Edit\|MultiEdit\|NotebookEdit), SessionStart, UserPromptSubmit, PostCompact, SessionEnd; no Stop | 30 §1 | `hooks/hooks.json` | ✓ |
| `code-review` built-in collides on "review my change" | 25 | baseline Example 3 (`e-ExZhbm`) | ✓ |

### 2.2 Wrong, misread, or unsourced

| # | Design claim | Where | What the source or code says | Severity |
|---|---|---|---|---|
| W1 | "L1 Text: `git grep -w` (exists in `locate`)" | 10 §1 | `locate` calls `git grep --untracked -I -l -z -i -F -e <term>` (`src/git/git.ts:217-229`): case-insensitive, fixed-string, **no `-w`**. The `-w` numbers (17/41 ms, 1.00/1.00) came from a separate shell call in `compare.mjs`. The word-boundary layer the design relies on for M10 does not exist in `locate` and must be added. | must fix text; small code |
| W2 | "The 2026-09-30 walk showed the slim body with a stated reason beat the long body on every mechanic" | 22 Purpose | gap-plan iteration 2: B2 turns **20.3 vs A 18.0** (worse), cost 1.18 vs 1.26, P/R better; n = 4; the source says "a mechanics read, not a decision". | misquote |
| W3 | "The measured plans had 6 of 26 anchors in that [prose-range] form" | 23 P26 | real-run §2: 26 is the full arm's identifier-quoting anchors (23/26 correct); the 6 misses are 3 (neutral, of 17) + 3 (full, of 26) and were "whole-file replacements or quote the new code, not wrong anchors". Prose-range anchors were the naked arm's style (18 anchors / 8 files), which was not counted that way. | misread |
| W4 | "both plugin arms read only the epic (5 fields)" | 01 M11 | real-run §4: the neutral arm fetched `fields=*all,comment`; only session A used 5 fields. Both read only the epic: true. | minor |
| W5 | Recorder option A: "Evidence quality: complete" | 13 §5 | The matcher is `Read\|Grep\|Glob\|LSP`. M7 in the same design says Sonnet reads through Bash 177 times against 24 `Read`s, and 10 §5 tells the model "`cat` several files in one call is fine". The recorder records a minority of reads; the generated navigation line would be systematically incomplete while labelled complete. | wrong |
| W6 | "That cost [language service] is paid once per task run, not per query" vs "`refs --exact` runs in a child process that exits" | 10 §3 vs P11 | Mutually exclusive. Per-query child: 0.7–2.4 s cold and 368–777 MB each time; once per run needs a resident process the design never defines. | contradiction |
| W7 | "Median cost here: $0.21, 48 s (n=5)" | 17 §3 | Example text with no source; reads as a measurement. | unsourced |
| W8 | "Skill bodies 6.5–10.6 KB" | 02 §6 | `wc -c`: init 4,199, review 5,896, investigate 6,503, plan 9,853, rules 9,994, task 10,649. The range covers four of six. | minor |
| W9 | "24 CLI spawns (~2.1 s)" with the formula `30·0.034/0.089` | 30 §1 | 14 × 89 ms + 10 × 34 ms ≈ 1.6 s; the formula line is garbled. Conservative, harmless. | minor |
| W10 | "Fixed cost in the model's context … about 6–7 KB" | 02 §5 | 22 and 30 §3 say ≈ 16 KB for the same route. One is the expected size, the other the cap; the design never labels which. | inconsistency |
| W11 | "`Stop` may not carry `additionalContext` (the guide says yes; not probed here)" | P17 | `docs/compatibility.md:383-387` already lists `Stop` among the events whose `hookSpecificOutput` the 2.1.278 schema accepts. Whether that variant has an `additionalContext` field is still open; the design should cite the repo's own probe. | minor |
| W12 | "hooks did not fire for a typed command in one probe (G1)" | 12 §2 | G1: the `PostToolUse(Skill)` hook does not fire for a typed command; `UserPromptSubmit` now handles it, "interactive prompt shape unverified"; the one interactive transcript "holds no `UserPromptSubmit` hook record". The design's **only** reachable entry under D2 is `UserPromptSubmit`; whether it fires interactively for a typed slash command is unverified and is not in 40. | missing unknown |
| W13 | "The built-in `code-review` skill no longer competes: this skill is not model-invocable" | 25 Trigger | True for typed commands. The consequence is the opposite of a fix: every natural-language "review my change" now goes to the built-in, with no AMBICODE pipeline. D2 is the owner's call; the design should state the trade. | framing |
| W14 | `plan`'s kill "the route without the scout does not beat naked on AC coverage → expansion is not working" | 33 §4 | The naked model expanded the epic unprompted (M11). Expansion working means a **tie** on AC coverage, not a win. The kill tests the wrong direction. | wrong criterion |

I found no quoted number that was invented. The misreads are W2 and W3; the structural error is W1
and W5.

## 3. Goal coverage

| Decision / goal | Verdict | Evidence and the gap |
|---|---|---|
| (a) LSP only in `task`, after base context; never in investigate or review | **meets, with a quiet downgrade** | D1 is applied everywhere (10 §5, 22, 25). But 24 §LSP says "No `ToolSearch select:LSP` step" and routes references to `refs --exact`. The LSP tool is deferred; without `ToolSearch` the model cannot call it. So "LSP in task" reduces to *passive diagnostics pushed after an edit*, which is an unprobed platform behaviour (not in 40). Say so plainly: v2 uses LSP for nothing active. |
| (b) User launches everything; no automatic skill or tool selection | **partial** | `disable-model-invocation: true` on all six (01 D2) ✓. P34 reads "tool selection" as code picking search layers and asks the owner to confirm ✓. Not addressed: the MCP `PostToolUse` hook runs `map` + policy on every Atlassian read; today's code (`prepare-on-skill.ts:91-117`) does so with **no active skill at all**. The design does not say "no route → hash only". Under (b) it must. |
| (c) SCIP/LSIF/repo-map considered, off-the-shelf preferred | **meets** | 10 §3: three tools installed and timed, one chosen behind `IndexAdapter`, default `none` until 33 §3. Caveat: the P/R comparison is n = 1 symbol per repo, both unique names, so it decides nothing about the case the index is for (collisions). |
| (d) Modular, layered; framework considered; own harness | **meets in form** | 02 §2–3. The harness (route engine) is the component with the least evidence (P1, P35) and everything in 41 after step 3 is built on it. That is the right order (measure the engine first) only if step 3's gate is honest; see §7. |
| (e) Global modules: search (bare prompt / prepared data), policy, routes with loop control | **meets** | 10 (two modes), 11, 12 (repeat, same-error, budgets). Counters conflict with the routes' own happy path (§4 C7). |
| (f) Skills independent, share artifacts, helpers only with approval | **meets, one inconsistency** | Routes per skill; `note list` shares notes; workers gated (D3). But `task` step 8 and `review` step 4 default to **run** the reviewer headless (a `claude -p` process, $0.33–0.67), while 17 says workers never spend without a human. |
| (g) Problems visible from the design | **partial** | 40 lists 35. §4 below adds 22 that are not there, 7 of them structural. |
| Six activities covered | meets | 20–25. |
| Success bar: beat the naked model at bounded cost | **not met for investigate; unmeasurable for review** | 22: "the naked model's recall at no more than 1.15x its cost" is a tie at higher cost. 01 §1 says `recall(with) >= recall(without) + band`; 22 says `≥ without − band`; 33 §2 says "tie or better". The design must say what investigate wins on (it does not), or justify it only through plan quality (23/33 §4). Review has no kill (33 §6) and its pipeline is kept on a safety property (M18), not on a quality number; thread recall was 0.08–0.15 ≈ naked. |
| Ship nothing unmeasured | partial | Every module has an eval named. Three flags ship for unmeasured behaviour (`guard.askOutsideMap`, `review.onInvalid`, `evidence.recordTools`), the `agentmap` adapter measured worse and still ships, and 41 step 9 (init/rules) and step 10 have no Δ gate. |

## 4. Behavioural conflicts the design does not list

Each row: what pulls apart, where, and what happens to a user.

| # | Conflict | Files | Consequence |
|---|---|---|---|
| C1 | **Ground step fires once per MCP read.** 14 §3: "the same hook still triggers the search pass of the route". 14 §2: an epic reads itself plus up to 10 children (each a `getJiraIssue`). 12 §5: `map` repeat 2. 30 §1 budgets 1–4 MCP fires with "map (0.3–1 s)" each. | 14 §2–3, 12 §5, 30 §1, 30 §3 | On any epic with ≥ 2 children the third read hits the `map` repeat limit, a `limit` entry lands in every report's Not verified, and 2–4 step messages of up to 8 KB each (or file previews) enter the context, far over the 16 KB budget in 30 §3. The ground step must run once, after the model signals the fetch is complete (`route next`), with the hook only recording `rawHash` per read. |
| C2 | **Gate defaults are taken on any `route next` without an answer** (12 §3.4). M2 says Sonnet skips prose steps; "ask the human" is a prose step. | 12 §3.4, P3, 30 §6, 20 step 3, 24 step 8, 25 step 4 | In an interactive session a model that calls `route next` without asking takes the default silently. P3 and 30 §6 claim defaults are "always the conservative option"; three routes contradict that: init **applies the config**, task **runs the review**, review **runs**. A human present but not asked gets money spent and files written. Defaults must require an explicit, recorded flag (`--headless` on `route start`, or `--default <gate>` on `route next`), never fall-through. |
| C3 | **The Stop hook blocks the first conversational stop.** 15 §3 rule (e): block unless `exit` exists or every step is done. Interactive routes stop many times (a text question, "reading the ticket now…"). The hook exempts only stops whose last tool was `AskUserQuestion`. | 15 §3, 12 §7, 30 §1 ("fires 1–2 per run") | The one allowed block is spent on a non-report stop; every later stop, including the real report, is allowed unchecked. Also for `investigate` the artifact is the **note** (file), while the last assistant message is a one-liner (walkthrough 5.9); the hook checks citations in the wrong text. Check only report-shaped stops (header present) or after `route stop`; check the note body when the route's artifact is a note. |
| C4 | **The last model step is never "done" by the fold rule.** 12 §4: a model step is done when a `step {id: next}` exists; the last step has no next. 12 §7 and 22 say the route completes when "every step is done" with no `route stop`. | 12 §4, 12 §7, 22 step 7, 02 §5 | Either `route stop` is a mandatory extra ceremony turn on every run (not in 02 §5's count that the +2 budget rests on) or the Stop hook blocks once on every normal completion. Make the fold honour `produces` for model steps. |
| C5 | **Acceptance is forgeable.** `route next --accept <gate>` (12 §3) records an `acceptance` without any human. 23 Purpose: "a save that cannot claim acceptance it did not get". 13 §3 relies on that entry. The `ExitPlanMode` path (P2) is unprobed, which is exactly why the G13 hook was reverted ("would have labelled plans saved after ExitPlanMode as unconfirmed"). | 12 §3, 13 §3, 23 step 10–11, known-gaps G13 | Under R3 ("evidence from the record") the `acceptance` entry is only as strong as the model's honesty when it comes through `--accept`. Record `via: flag` and have `plan` refuse `acceptance {via: flag}` unless `--headless`; otherwise the plan-vs-draft distinction is text-only again. |
| C6 | **Dedup swallows a second question.** 12 §2.2: a second `route start` for the same slug and skill in the epoch is a no-op that re-prints the current step. The slug is the ticket key. | 12 §2 | `/ambicode:investigate ORD-17 why does X happen` followed by `/ambicode:investigate ORD-17 which files touch Y` returns the first route's step. Key dedup on an args hash too, or on "the last `route` entry has no `exit` and identical args". |
| C7 | **`check` repeat 3 is below the task route's own happy path.** 24 steps 5, 6, 10: red (1), green (2), fix after review (3), `check --only` again before the second review round (4). | 12 §5, 24 step 10 | The fourth check is refused with a `limit` entry on a normal run. |
| C8 | **Deny-all vs the one writable file.** 15 §1: deny Write/Edit under `.ambicode/task/**`. 23 §Context budget and 32 §1: `steps/plan-body.md` is model-writable for `note save --from`. | 15 §1, 23, 32 §1 | The guard table has no exception row; built as written, the plan route's save path is denied (M12 again, by design this time). |
| C9 | **"Kept byte-for-byte" is not.** 41: `src/review/{bundle,prompt,claude-reviewer,validate,report}.ts`, `src/page/*` unchanged. 16 §4 `--task` scoping (bundle), §5 `--estimate` (bundle), §7 `onInvalid` (validate); 17 §1 "the reviewer runner becomes the process runner" (claude-reviewer); 25 step 10 and 32 §7 `metrics.jsonl` written by the view page (page). | 41 vs 16, 17, 25, 32 | The migration promise is false on five files. State which seams are touched. |
| C10 | **Pass 2 needs an index that is off.** 10 §1: "pass 2: identifiers harvested from the top candidates' exports (from L3, not from the model)". 10 §3 and 20: `search.index: none` by default. 10 Failure modes: with no index, `map` runs L1+L2+L5 (one pass). 33 §1–2 run "with `search.index: none`". | 10 §1, 10 §3, 33 §1–2 | The one search change with a measured effect (M5, 1 → 15/15) is absent from the default configuration and from the eval that decides whether the route survives. The recall eval would judge a single-pass map and could kill the route for the wrong reason. Harvest exports by regex (`export (class\|function\|const\|interface\|type\|enum) Name`) over the top-N files; L3 becomes an optional improvement, measured in 33 §3 against the regex harvest, not against nothing. |
| C11 | **D2 vs the eval harness.** Every localize case's `prompt.md` is a plain question with `allowed_tools: [Read, Glob, Grep, Bash, Skill]`; the plugin fires by model choice. With `disable-model-invocation: true` on all skills the plugin arm **is** the naked arm. 33 §0 lists harness fixes and omits this. Whether `claude plugin eval` delivers a `/ambicode:investigate …` prompt such that `UserPromptSubmit` expands it in the sandbox is unprobed. | 01 D2, 33 §0–2, `evals/evals-core/cases/*/prompt.md` | Nothing in 33 §1–2 can run until the cases are rewritten and the probe passes. Also, the forced review prompt ("Use the ambicode review skill") can no longer force anything. |
| C12 | **Two sessions, one ledger.** 13 Failure modes handles id collisions; the fold (12 §4) takes "entries after the last `route` entry for this skill" with no session filter, while `route` records `session`. | 12 §4, 13 | Two terminals on the same ticket interleave routes; each session's fold reads the other's steps as its own position. Filter the fold by `session`. |
| C13 | **`exactMaxFiles: 3000` counts what?** FE is 2,338 `.ts` files and 4,262 files; the language service was measured on it at 777 MB. | 10 §3, P11, 32 §4 | If the cap counts all files, `refs --exact` is disabled on the very repository it was measured on. |
| C14 | **Normalization before the envelope exists.** 02 §5 step 3: the MCP hook "normalizes requirements". 14 Inputs: normalization consumes the envelope the model builds on `--evidence -`, which at step 3 does not exist. | 02 §5, 14 | Either code builds the envelope from the hook-captured raw payloads (then the model only adds `conflicts`, and the `requirements-paraphrased` check and its normalizer, P7, are unnecessary), or normalization waits for a model step the worked example does not show. The design must pick; the first is R1 applied. |
| C15 | **Ticket hook with no route.** Today `prepareForTicket` runs on any Atlassian read in a configured repo (`prepare-on-skill.ts:91-117`), skill or no skill; the design keeps the hook and says nothing about the no-route case. | 14 §3, 30 §1, 01 D2 | A user reading a ticket for any other reason gets a `map` run and a step message. Violates (b). |
| C16 | **Wall-clock budget in interactive sessions.** 12 §5: `budget.wallMinutes` 45 from the `route` entry; hitting it is a gate with default *stop*; C2 applies. | 12 §5 | A human who steps away during a plan returns to a route that stopped itself on the next `route next`. Drop wall-clock for interactive routes or make it advisory. |
| C17 | **Three bars for one metric.** `recall(with) >= recall(without) + band` (01 §1) vs `≥ without − band` (22) vs "tie or better" (33 §2). | 01, 22, 33 | The design can pass its acceptance (22) while failing its goal (01) and the owner's bar. Pick one and say what investigate wins on. |
| C18 | **Recorder vs reading guidance.** 10 §5 line 2 tells the model to `cat` several files; 13 §5 records `Read\|Grep\|Glob\|LSP` only (W5). | 10 §5, 13 §5 | The generated navigation line is honest only if it says "Bash reads not recorded"; option A as written is less honest than option B. Either match `Bash` and parse `cat/sed/head/grep` targets with the guard's structural parser, or ship B. |
| C19 | **Index build from inside a hook, into an un-ignored directory.** 10 §4: built at `route start` (a `UserPromptSubmit` hook) in the background; `.ambicode/index/` gitignored "by `init`". `schemaVersion: 1` configs load without migration (32 §4). | 10 §4, 32 §1, 32 §4 | Unless the child is detached the hook blocks for 0.9–5.7 s. On a v1 config the 33 MB index is untracked in the tree; `review`'s default target is "all uncommitted work" → `snapshot-too-large`. Refuse to build unless `index/` is ignored; detach the process. |
| C20 | **Red/green proves less than claimed.** 16 §2: red = exit ≠ 0, green = exit 0 on `--only <spec>`. | 16 §2, 24 step 5–6, 33 §5 | A syntax error in the new spec is "red"; a wrong `--only` path with a runner that passes on zero tests is "green". The ledger entry should carry the runner's summary line (tests run / failed) and the route should require ≥ 1 test ran. |
| C21 | **The route DSL cannot express its own example.** 32 §3 uses `when: hasRequirementUrls`, a `gate` on a `code` step, and branching in a YAML comment (`run: requirements.template # when args hold a URL/key; else search.map(prompt)`). 12 §1's field table has none of these; 12 §4's fold has no rule for a gate on a code step. | 12 §1, 12 §4, 32 §3 | The engine as specified cannot run the investigate route as specified. |
| C22 | **No headless end-to-end chain.** 23 step 10: headless default **draft**. 24 step 1: plan says draft → default **stop**. | 23, 24 | investigate → plan → task cannot run headless by default. Fine for the task suite (no plans) but it should be stated, and `task --from-draft` named as the release. |

Entries in 40 whose "current answer" is inadequate:

- **P1** (engine is a workflow engine): the defence is "the fold and tested exits"; C2–C4 show the fold and the exits are where the engine misbehaves. The answer should be the interactive semantics above, not the fold's purity.
- **P3** (late human answer): "defaults are always conservative" is false for init, task and review (C2).
- **P4** (three entry hooks): under D2 the `PostToolUse(Skill)` entry is dead (no model invocation → no Skill tool call). Delete it; the remaining unknown is W12.
- **P6** (model pastes the hash comment): the fallback "normalized diff" is fine, but the bigger problem is C3: the hook may never look at the report.
- **P25** (batched reads vs confirmation): accepted; fine. But combined with W5/C18 the design should stop claiming a complete navigation line.
- **P30** (no LSP in review): the answer is `relates` + `refs --exact`, both behind an index that defaults to `none`; with `none` review dependents are today's name search (≤ 8 files). State that review's dependents are unchanged in the default configuration.
- **P35** (the central claim: +2 turns): the floor is already +2 (`route next`, `note save`) before any gate, any file-delivered step (+1 Read, measured G6), any `refs` call, or `route stop` (C4). 33 §1's kill at +2 would fire on the floor. Give the predicted ceremony count per route (investigate 2–3, plan 4+N decisions, task 5–8) and budget per route.

## 5. Bottlenecks and costs

**Context.** 30 §3 counts fixed text only (16–18.5 KB caps ≈ 4–5k tokens). It omits: requirement text (real run: epic 28 KB + children 16 KB; with the cap of 10 children, up to ~200 KB), file-delivered steps read back whole (G6: 14.5–17.6 KB each), per-MCP-read step messages (C1), and the plan body itself (79 KB emitted once even after `--from`). The 214k peak in the real run is cut by the double emission fix (~80k) and nothing else in the design; a 10-child epic will peak higher than 214k. P8 names the JQL payload only. Measure peak context per route in 33 (P32 says it is unmeasured; 33 does not schedule it).

**Turns.** See P35 above. Add: each `AskUserQuestion` is a turn; plan has one per material decision plus acceptance; task has review offer, possibly N check approvals, scope questions. The +2 budget is realistic for investigate only when step 3 fits inline (≤ 9,800 chars with instruction + map + ACs + before-work rules; today's investigate payload is 4.1 KB without ACs or instruction, so plausible but untested).

**Spawns and latency.** 24 CLI spawns ≈ 1.6 s + recorder ≈ 1 s per run; negligible against model latency. The inert `PostToolUse(Edit|Write)` hook (89–143 ms, G18) is still in the matrix (30 §1 row 7); delete it until a pack opts in. `refs --exact` 0.7–2.4 s cold per child (W6). Index cold 5.7 s hidden behind the first turn only if detached (C19).

**Memory.** 777 MB RSS per language-service process on FE (10 §3); five changed symbols in a brief = five such processes sequentially, or one resident one the design never defines (W6). codeindex index 33 MB on disk for FE.

**Dollars.** The design gives tiers for 33 §1–3 ($1.2 / $14 / $14) and none for §4–6:
- §4 plan eval: 3 epics × 3 runs × 3 arms = 27 runs × $1.8–2.5 (real-run arm costs) ≈ **$50–70 per decision**, needs live MCP (cannot run in the sandbox), and the AC-coverage scorer needs a validated AC list (P23: unmeasured splitter) or hand-labelled ACs.
- §5 task suite: building it needs scaffolds with dependencies and runnable tests (G22: none exist) and base-commit checkouts (the G28 fix); 60 runs of edit-test-review on Sonnet are plausibly $0.5–1.5 each → **$30–90 per decision** plus the suite's construction, the largest single effort in the plan and listed only as "M–L".
- §6 review live tier: reviewer $0.33–0.67 × 24 cases × 3 runs ≈ $25–50 on top of agent cost.

**Developer effort.** 31-cli lists about 24 new or changed commands, a route engine, a YAML DSL with build-time validation, 14 new ledger kinds, a structural shell parser, a Stop hook, a transcript reader, an index adapter, a language-service child, three workers, config v2 with migration, and a rewrite of six skill bodies. 41 gives letters S–L per step and no total. This is a rewrite of the entire model-facing surface. The owner needs a point of no return: after 41 step 3 (engine + investigate route) either 33 §1 passes or the engine is abandoned and steps 4–5 (requirements v2, search v2) ship on the v0.4.0 hook plumbing, which they can.

## 6. Over-engineering and under-engineering

**Delete or defer with no measurable loss:**
- The `PostToolUse(Skill)` entry hook (dead under D2) and P4 with it.
- Three workers. Only `plan check` (code) has a measured scorer behind it; `scout`, `collector` and the judge half of `plan-checker` rest on P21/P22 and an uncalibrated judge. Keep the process-runner generalization (it is the reviewer anyway) and one worker definition; add the others when 33 §4 shows the main session's context is the bottleneck.
- The `agentmap` adapter (measured 0.36 recall on `relates`, no truncation flag, TS-only). Keep the interface, ship one adapter.
- `budget.wallMinutes` and `budget.codeCalls` (proxies that measure neither turns nor dollars). `repeat`, same-error and identical-`route next` limits suffice.
- The `requirements-paraphrased` hash check and its cross-server normalizer (P7), **if** C14 is resolved by having code build the envelope from captured payloads. Then there is nothing to paraphrase.
- Config flags for unshipped behaviour: `guard.askOutsideMap`, `review.onInvalid`, `evidence.recordTools` (and the recorder itself, per W5). Add each with the measurement that turns it on.
- The inert `PostToolUse(Edit|Write)` hook.
- `review --estimate`'s 5-review cost history (P20); the estimate's value is the size check, which needs no history.
- `tool` ledger kind until it records Bash reads too.

**Missing; a real user hits it in week one:**
- Interactive gate semantics (C2), Stop-hook behaviour on conversational stops (C3), route completion (C4), a second question on the same ticket (C6), abandoning a route (start another `/ambicode:` command or an unrelated prompt: the `active-route` pointer and the Stop hook keep pointing at the old route; nothing records `exit human`).
- Which plan `task` opens when a task directory holds several (`note list` returns all; 24 step 1 says "accepted plan" singular).
- Resuming iteration N: how the route knows N−1 is done (notes.md is prose).
- Windows: the structural parser (15 §2) says nothing about `cmd`/PowerShell quoting; v0.4.0 has a Windows shim test, so the product claims Windows.
- A monorepo with two projects: `map` needs `--project`; the hook-run `route start` has no way to ask (12 §2 lists `ambiguous-project` unchanged, which today is a hard exit in a hook message).
- A ticket read for a reason other than a route (C15).
- The MCP binding rule (14 §1) is fine; the `requirements-expansion-capped` gate lacks a headless default.

## 7. Measurement plan critique (33)

What decides fate honestly: §3's offline recall@15 on 116 tickets (free, real bar at +0.05), §7–8 (unit-level ceilings, gate matrix, guard fixtures, Stop fixtures), §9's run policy.

What does not:
- **§0 is incomplete.** Missing: rewrite the case prompts as typed commands and probe `UserPromptSubmit` in the plugin-eval sandbox (C11); probes P2 (`ExitPlanMode` payload), P17 (`Stop` output fields), P21 (subagent MCP), P24 (`claude plugin list` in the sandbox), and the LSP-diagnostics-after-edit behaviour (goal (a)). 40 names "one probe" for each; 33 schedules none. Also note `reuse-score.mjs` is in `stash@{0}`.
- **§1's kill is at the floor** (P35 above). It would kill the engine on plan and task by construction (file-delivered steps) and on investigate on any gate. Set per-route budgets from the route's own ceremony count, or gate on cost ratio only.
- **§2 measures a crippled map** (C10). With `index: none` there is no pass 2; the kill "the map anchors the model" would be reached by a map the design does not intend to ship.
- **§3's second and third bullets are real work** (base-commit scaffolds, collision-only impact cases) and uncosted; the first bullet alone can decide the adapter.
- **§4** depends on an unvalidated AC splitter (P23) as the grader; the kill tests the wrong direction (W14); cost ≈ $50–70 per decision, unstated; needs live MCP, so it runs outside the sandbox with the real-run runner, whose `--resume` design dropped MCP servers (real-run §5B) and must be rebuilt as one process.
- **§5** is the decisive suite for the skill the design centres on and is the least specified: no case list, no scaffold with dependencies (G22), no cost, no statement of how "hidden test" is withheld from a snapshot that already contains the merged fix (the G28 problem).
- **§6 has no kill "for the pipeline"** — unfalsifiable by construction. The pipeline is kept for M18 (isolation and validation), which is a safety property. Against the owner's bar the review skill has never shown a quality gain (0.08–0.15 vs 0.08–0.17 thread recall, both runs confounded). Either state that review's product claim is *safe publication with checked coverage*, measured by `complete` share and accepted rate, or give it a kill (e.g., live-reviewer thread recall ≤ naked at > 1.5x cost over 3 runs → review is a publication tool, not a finder).
- **Unfalsifiable statements** elsewhere: "the model can always stop the route" (no metric, and C3 shows the Stop hook can fight it); "defaults are always conservative" (C2); "evidence quality: complete" (W5); "the engine never decides what the model should conclude" (true of the engine, but the step texts do, and that is what P1 fears; the only test is §2's recall, which C10 compromises).
- **Missing measurements**: peak context per run both arms (P32); a second baseline for the noise band (baseline §What this does not settle); the `ask`-on-git refusal rate in headless (G20) once routes make the model run more CLI commands.

## 8. Specific, actionable corrections

Numbered; `must` = wrong or unsafe without it, `should` = materially better, `could` = taste.

1. **must** — 10 §1 and 10 §Workflow: make pass 2 index-independent. Harvest `export`ed identifiers from the top-N pass-1 files by regex (the pattern already exists in `dependents.ts:27`), run L2 again with them. L3 becomes "pass 2 with declarations by name", measured in 33 §3 against the regex harvest. (C10)
2. **must** — 10 §1 L1: add `-w` to a new `grepWords` beside `grepFiles` in `src/git/git.ts`; say `locate` is `-i -F` today. (W1)
3. **must** — 12 §3.4: no fall-through defaults. A default is taken only when `route start --headless` was recorded or `route next --default <gate>` is passed; both are ledger entries with `via`. Interactive with no answer → re-print the gate, no advance. (C2)
4. **must** — 20 step 3, 24 step 8, 25 step 4: change the headless defaults to non-acting (init: write nothing, print the proposal; task/review: skip with "verification incomplete"), or declare these three as explicit exceptions to P3 and 17 with the reason. For the eval, pass `--default run` explicitly in the case prompt. (C2)
5. **must** — 15 §3: the Stop hook checks only (a) a stop after `route stop`, or (b) a last message whose first lines carry the report header, or (c) for note-producing routes, the note file named by the latest `note` entry. All other stops allow. Remove rule (e) for mid-route stops. (C3)
6. **must** — 12 §4: a model step with `produces` is done when those kinds exist; otherwise when the next `step` exists. Then 22 step 7 and 02 §5 hold without `route stop`. (C4)
7. **must** — 12 §3, 13 §3: record `acceptance {via: hook|flag|headless}`; `note save --kind plan` accepts `via: hook` always, `via: flag` only with `--headless` in the route, otherwise refuses with `plan-not-accepted` and names `plan-draft`. Probe P2 before 41 step 6. (C5)
8. **must** — 14 §3 and 12: the MCP hook appends `requirement {rawHash}` per read and nothing else; the ground step (`normalize, acs, map, policy`) runs once on the model's `route next` after fetching. Update 02 §5 and 30 §1 accordingly. (C1)
9. **must** — 14 and 02 §5: decide who builds the envelope. Recommended: the hook captures each raw payload to `.ambicode/task/<slug>/requirements/<key>.json`; `requirements normalize` builds the envelope from those files; the model supplies only `conflicts` and `resolution` via `route next --conflict …`. Drop `requirements-paraphrased` and P7. (C14)
10. **must** — 33 §0: add "rewrite `evals/evals-core/cases/*/prompt.md` to typed `/ambicode:<skill>` prompts and probe that `UserPromptSubmit` fires and expands in the plugin-eval sandbox"; add the five probes (P2, P17, P21, P24, LSP diagnostics push) as §0 items with owners; note `reuse-score.mjs` is in `stash@{0}`. (C11, W12)
11. **must** — 01 §1, 22, 33 §2: one investigate bar. If the honest expectation is a tie, write "tie within the band at ≤ 1.15x" in all three places and state in 01 §1 that investigate's measured win is expected in plan quality (33 §4), not in localize recall. (C17)
12. **must** — 41 "Kept byte-for-byte": remove `bundle.ts`, `validate.ts`, `claude-reviewer.ts` and `src/page/*` from the list, or remove `--task` scoping, `--estimate`, `onInvalid`, the process-runner generalization and `metrics.jsonl` from 16/17/25. (C9)
13. **must** — 15 §1: add the row "Write `.ambicode/task/<slug>/steps/plan-body.md` while the plan route is active → allow". (C8)
14. **must** — 12 §5: `check` repeat default 5 (red, green, two fix rounds, one spare) or make the limit per phase. (C7)
15. **must** — 12 §2.2: dedup key = (slug, skill, epoch, hash(args)); identical args re-print, different args append a new `route`. (C6)
16. **must** — 12 §4: filter the fold by the `route` entry's `session`; two sessions get two positions. (C12)
17. **must** — 14 §3 / 30 §1: "no active route → the MCP hook records `rawHash` only; no `map`, no step message". (C15, goal (b))
18. **must** — 13 §5: either match `Bash` in the recorder and parse `cat/sed/head/grep/less` targets with the structural parser, or ship option B and label the navigation line "CLI calls; model reads not recorded". Change "complete" to what it is. (W5, C18)
19. **must** — 10 §3 / P11: define the `refs --exact` process model. Recommended: one child per `task` route, started at step 4, kept alive until the route exits, queried over stdin; `exactMaxFiles` counts `.ts/.tsx` files and is 3,000 (FE at 2,338 passes). (W6, C13)
20. **must** — 32 §3 and 12 §1: add `when:` and conditional `run` to the step schema, or rewrite the example route without them; define the fold for a `gate` attached to a `code` step, or move that gate to its own `human` step. (C21)
21. **must** — 33 §1: replace "within +2 turns" with a per-route ceremony budget computed from the route file (count of `model` steps + file-delivered steps + gates) or gate on cost ratio only; keep turns as a reported, not gated, number. (P35)
22. **must** — 33 §4: the kill is "route (no scout) does not beat naked on the composite of existing-file recall, anchor validity and AC coverage" and a tie on AC coverage is the expected outcome of expansion. Hand-label ACs for the 3 epics before using `acs` as a grader. State the ≈ $50–70 cost and that the runner must be one process (MCP drop on `--resume`). (W14)
23. **must** — 33 §6: give review a kill, or state in 01 §1 that review's claim is publication safety and coverage honesty, measured by `complete` share and accepted rate, not by finding more.
24. **should** — 22 Purpose: replace "beat the long body on every mechanic" with the walk's numbers (prepare ran 4/4, cut 0/4, P/R up, turns 20.3 vs 18.0, n = 4, cost 1.18 vs 1.26). (W2)
25. **should** — 23 P26: correct the anchor count (23/26 full, 14/17 neutral, 12/12 naked; the 6 misses were whole-file replacements or new-code quotes) and count prose-range anchors separately. (W3)
26. **should** — 24 §LSP: say plainly that v2 uses LSP for passive diagnostics only, that `findReferences` is replaced by `refs --exact`, and that whether the LSP plugin pushes diagnostics after `Edit` is a probe (add to 33 §0). (goal (a))
27. **should** — 25 Trigger: state the D2 consequence: natural-language review requests go to the built-in `code-review`; AMBICODE review runs only when typed. (W13)
28. **should** — 10 §4 and 32: `index build` refuses unless `.ambicode/index/` is gitignored; the build is a detached child; `route start` never waits on it. (C19)
29. **should** — 16 §2: `check` entries carry the runner's summary (tests run/failed, parsed per configured runner, `null` when unparseable); the red rule requires ≥ 1 failing test, the green rule ≥ 1 test run, else `limit {red-unproven}` visible in the report. (C20)
30. **should** — 30 §3: add columns for requirement text, file-delivered step read-back and plan body; schedule peak-context measurement in 33 (P32). (§5)
31. **should** — 30 §1: delete the `PostToolUse(Skill)` row (dead under D2) and the `PostToolUse(Edit|Write)` row until a pack sets `remindOnEdit`. (P4, G18)
32. **should** — 17: ship the process runner and `plan check` (code) only; move `scout`, `collector` and the judge to a "proposed after 33 §4" appendix. (§6)
33. **should** — 12 §5: drop `wallMinutes` for interactive routes (keep for `--headless`), drop `codeCalls`. (C16)
34. **should** — 41: add a total effort estimate and the point of no return after step 3; state that steps 4–5 can ship on v0.4.0 plumbing if the engine fails 33 §1.
35. **should** — 33 §5: specify the suite's construction: base-commit scaffold per ticket (shared with G28's fix), dependencies installed, the withheld test identified by name, cost per run from one walk, and the sandbox's ability to run the project's test runner.
36. **should** — 20 and 24: name the release for a draft plan in `task` (`--from-draft`, recorded) so a headless chain is possible by choice. (C22)
37. **could** — 17 §3: mark the proposal text as an example or remove "(n=5)". (W7)
38. **could** — 02 §5 vs 22/30: label 6–7 KB "expected" and 16 KB "cap". (W10)
39. **could** — P17: cite `docs/compatibility.md:383-387` (schema accepts `Stop` in `hookSpecificOutput` on 2.1.278); the open question is the `additionalContext` field only. (W11)
40. **could** — 30 §1: fix the spawn formula; 1.6 s is the number. (W9)
41. **could** — 02 §6: "Skill bodies 4.2–10.6 KB; the four model-facing ones 5.9–10.6". (W8)

## 9. What I did not check

- I ran no eval and spent no money. Every eval number above is read from the result files the
  sources cite; I did not open the result JSON or traces myself.
- I did not install `codeindex`, `agentmap` or `scip-typescript` and did not re-run `compare.mjs`;
  the measurement README's figures (including "15+6 languages incl. Python", "vendorable single
  file", "17 MiB grammars") are taken on trust from `results.log` and the README. `results.log`
  shows the first language-service block failed on the `reuse-score.mjs` import; the README says
  `compare.mjs` repeated it; I did not verify that output.
- I did not probe any Claude Code behaviour: whether `UserPromptSubmit` fires interactively or in
  the plugin-eval sandbox for a typed slash command; whether `Stop`'s output accepts
  `additionalContext`; whether plugin subagents inherit MCP servers; whether the LSP plugin pushes
  diagnostics after `Edit`; whether skill bodies expanded from a slash command are re-attached after
  compaction; the 30,000-character Bash window; the exact semantics of the `if: Bash(*ambicode.mjs*)`
  matcher.
- I did not verify the external numbers (SkillsBench, Vercel, Spence, the course thresholds); I
  checked only that the design quotes `skill-best-practices.md` correctly.
- I did not read `src/review/*`, `src/checks/*`, `src/snapshot/*` beyond the lines quoted; the
  "kept byte-for-byte" finding (C9) rests on the design's own text, not on a diff.
- I did not count tokens; all context figures are bytes, as in the design.
- I counted 720 `it(`/`test(` sites in `src/**/*.test.ts`; CLAUDE.md says 915 tests. I did not
  reconcile the two (parameterized tests and the evals tests account for some of the gap) and did
  not run `npm run verify`.
- I did not check Windows behaviour of anything.
- I did not read `evals/scripts/src/evals-bench.mjs` to see how a case prompt reaches the sandbox
  session, so C11's "probe needed" is a gap I am naming, not a failure I reproduced.

# Review of `new-architecture/migration-plan_v6/` (2026-10-04)

Independent review of the replacement hand-off (16 Markdown files, 174,626 bytes, plus
`validate-plan.mjs` and `input-sha256.txt`) against the frozen design `v6/` (with its three in-place
post-review rounds, CHANGELOG top section), the previous plan review `review-migration-plan.md`
(#116–#131), `review-v6.md` (#132–#148), and the code at HEAD `ae45901` (branch `replan`; the plan is
staged, not committed). Numbering continues from review-v6 (last item 148) at **149**.

Read in full: CLAUDE.md, all 16 plan files and the validator, v6 `12-route`, `13-evidence`, `32`,
`33`, `41`, `50`, CHANGELOG top section, `22-investigate` (route table), `25-review` (route table),
`30` §1–§6, `31`, the third external review's summary (CHANGELOG round 3). Code read: `eval-gate.mjs`,
`withBaseline`/`score`/`runArgs`/`writeCase`/`reviewScaffoldFile` in `evals-bench.mjs`,
`naked-arm.mjs`, `note.ts` (ledger write), `ledger.ts`, `markers.ts`, `src/cli/main.ts` review help,
`package-candidate.mjs` allowlist, `.gitignore`, the ae45901 diff of the evals README/gate/package.json.

Commands run (no model call, nothing spent):

```
node gym/planing/new-architecture/migration-plan_v6/validate-plan.mjs
  markdown_files=16; bytes=174626; local_links=51
  scenarios=14; historical_findings=16; source_digests_verified=50          exit 0
node --test evals/scripts/src/*.test.mjs          tests 125, pass 125, fail 0
npm run verify                                    tests 921, pass 920, fail 0, skipped 1; exit 0; 33.9 s wall
claude --version                                  2.1.289 (Claude Code)
node -e (baseline metadata only)                  claudeVersion 2.1.289, modelOverride claude-sonnet-5-5,
                                                  plugin "naked", ablation none, 18 cases, 54 runs,
                                                  0 run errors, partial false, costUsd 10.16
git check-ignore -v                               benchmarks, archive, /evals/**/results/ are ignored
```

`npm run verify` is **green** at `ae45901` (the "red at HEAD" fact from the v5 era is no longer true;
CLAUDE.md's "915 tests" is stale at 921). No case, prompt, ticket or trace content was opened.

## 1. Verdict

**APPROVE WITH EDITS. (Approved by user)** Deciding criterion: 0 critical, **3 high** (≤ 3, each with exact replacement
text below), 10 medium. All sixteen prior findings #116–#131 are closed in the text (§3), with one
regression: #117's own replacement line (`--branch`) is wrong against the code and is #151.

The plan is a substantially better hand-off than v1: the shared-contracts file makes v6's implicit
readings explicit (persisted `gate` vs ledger `id`, the `note` subtype field, `workerId`, producer
vs consent windows, consumer-side consent, fail-closed session identity), the scenario matrix maps
S1–S14 to owners exactly as v6/41 does, every paid item is behind a named dispatch line, and the
"starting state" facts are true at `ae45901` (§4). The three highs are all places where the plan
names a dependency but leaves the agent without a way through it: how a model-run CLI call learns its
session (#149), how an isolated worktree reaches gitignored inputs and uncommitted prerequisites
(#150), and the review with-prompt's target flag (#151).

One item needs the user, not an edit: the plan supersedes D19 and CHANGELOG round 3's "no new
baseline" with "the user's later authorization of the 2026-10-04 baseline" and "the user declined the
paid equivalence test". I found no record of either outside the plan itself (`grep -rIl
19-44-56-791Z` hits only `migration-plan_v6/`), and the operational README still tells the reader
to run that test before trusting the baseline (#152). If both decisions are yours, #152 is
bookkeeping; if not, every measurement section of the plan rests on them.

**Resolved by the user (2026-10-04, after this review):** both decisions are the user's, given in
the conversation that produced the baseline: «archived оставь там же обнови baseline» (the archived
eval stays where it is; the baseline is regenerated) and «нет» to running the naked-vs-without
equivalence check. #152 is therefore bookkeeping: record that source in the plan and make the README
agree. The user also confirmed #154: the gate already reports per kind, and `--tag localize` is
enough to narrow the run.

## 2. Findings

| # | Cat | File §section | What is wrong | Evidence | Why new | Exact fix |
|---|---|---|---|---|---|---|
| 149 | **high** | 01-contracts §1 (session); step-03 §4; 00-README decisions table; step-00 §6 | Every routed CLI call needs its session: the fold starts from "the last `route` of this skill **for this session**" (v6 12 §4), ids are `<session8>-<n>` (13 §1), ownership and `route-taken-over` compare sessions (12 §2.3). Today only hook input carries `session_id`; nothing records a transport to the model's Bash children. The plan correctly forbids the "latest route on the slug" fallback, then leaves the transport to "a step-03 platform adapter … probe if needed": no probe id, no ceiling, no decision row, no consequence if none exists. The stated release for an owned write without a binding ("a release naming a trusted route start") loops: the hook start succeeds, the next CLI write still has no session (CLAUDE.md: a gate needs an exit). P47 (`updatedInput`, one candidate transport) is declared "optional; no dependency". Without a transport, `route next` cannot fold in the sandbox, so decision A cannot be measured, and the plan route can never write. | `migration-plan_v6/01-contracts.md:40-45`; `step-03-route-engine-investigate.md:75-77`; `00-README.md:183` (P47 row); `v6/modules/12-route.md:272`; `v6/modules/13-evidence.md:49`; `src/contracts/hook.ts:9`; `docs/compatibility.md:369-372` (session_id only in hook input) | the no-fallback rule is new in this plan (contracts §1); newly verifiable | **00-README** decisions table, after the P47 row, add: "\| P-S, 0-S \| 00 (probe), 03 (adapter) \| How a model-run CLI call learns its session: (a) a variable visible to Bash children, (b) `PreToolUse` `updatedInput` appending `--session <id>` (then P47 is a hard prerequisite of step 03), (c) a hook-written association the CLI can find without knowing the session. The user picks one (0-S); for skills owning no file the fallback is the slug's **single** open route of that skill (refused when there are several); owned writes always need the binding \|". **step-00 §6** table, add row: "\| P-S \| in one interactive session and in the P37 sandbox case: which of (a)/(b)/(c) delivers the hook's `session_id` to a Bash child of the model; record the mechanism, never the value \| 0-S; none proven → plan route blocked, investigate uses the single-open-route fallback \|" and after the table: "P-S shares the P37 case and its ≤ $1 ceiling." **01-contracts §1**: replace "an owned-plan write with no reliable session association fails closed with a release naming a trusted route start." with "an owned-plan write with no reliable session association fails closed with ⛔ `session-unbound`, whose release names decision 0-S (another route start would be refused the same way)." and append to "Session transport is a step-03 platform-adapter responsibility; tests inject explicit sessions." the sentence "The transport is the one 0-S chose from probe P-S (step 00 §6)." **step-03 §4**: replace "Session identity adapter binds hook session to subsequent CLI calls; probe actual platform transport if needed under an authorized probe budget." with "The session adapter implements the transport 0-S chose (P-S, step 00 §6). With 0-S pending, build and test against injected sessions; the paid walk/decide waits for 0-S." |
| 150 | **high** | 00-README "Dispatch defaults" and template; step-03 gate command; steps 00/01/04/05/06/07 inputs | The default workspace is "an isolated local branch/worktree" with changes "uncommitted". A worktree contains neither the gitignored inputs nor uncommitted work: `benchmarks/`, `evals/evals-core/cases/` and `results/` (the working baseline), `gym/planing/investigation/archive/` (the real-run report steps 01, 04, 06 read), `.tmp/naked`, and **this plan itself** (staged, not committed). The harness resolves `BENCHMARKS` from the script's own location, so in a worktree every select/run/score, the offline recall (step 05), the gate command's relative baseline path, the plan eval and the task suite find nothing. Likewise "Base revision: <commit with prerequisites>" cannot exist when every prior step was left uncommitted. An agent will report everything as "measurement pending", or copy NDA data into the worktree to proceed. | `00-README.md:48-55, 83-84`; `.gitignore:21` (`/evals/**/results/`), `:20` (`/evals/evals-core/*/*`), `:36` (`archive`), `:39` (`benchmarks`); `evals/scripts/src/evals-bench.mjs:11-12` (ROOT-relative); `naked-arm.mjs:9, 19` (no benchmarks flag); `step-03…md:187` (relative baseline path); `git status` (plan staged) | introduced by this plan's dispatch defaults (the v1 plan had no worktree default) | **00-README** "Dispatch defaults", append a paragraph: "**Ignored inputs stay in the primary checkout.** A worktree has no `benchmarks/`, `evals/evals-core/cases/`, `evals/evals-core/results/`, `gym/planing/investigation/archive/`, `.tmp/naked`, and no uncommitted file (this plan included). The dispatcher names `PRIMARY=<absolute path of the primary checkout>`. Agents read ignored inputs only as `$PRIMARY/…`; harness commands take `--benchmarks $PRIMARY/benchmarks` (`naked-arm.mjs` gains the same flag in step 00) and the baseline as `$PRIMARY/evals/evals-core/results/eval-2026-10-04T19-44-56-791Z.json`; results are written only under the primary's ignored `results/`; ignored inputs are never copied or linked into a worktree. Paid runs execute from the primary checkout after the step's code is integrated there. A prerequisite step reaches a later worktree only as a commit the dispatcher authorized or as a patch file named in the dispatch; 'leave uncommitted' applies to the step's own output." Dispatcher template, after "Workspace:", add: "Primary checkout (ignored inputs): <path>. Prerequisites delivered as: <commit \| patch paths>. Plan revision: <commit containing migration-plan_v6>." **step-03** gate command: replace `--baseline evals/evals-core/results/…` with `--baseline "$PRIMARY/evals/evals-core/results/eval-2026-10-04T19-44-56-791Z.json"`. |
| 151 | **high** | step-08 "Review per-arm prompts" | The fixed first body line `/ambicode:review --headless --answer estimate=run --branch` reviews the wrong target. The review scaffold commits the base and leaves the change **uncommitted** (`git apply` after the only commit); `review`'s default target is "your uncommitted work", and `--branch` means "Review the branch, **not the working tree**". With one commit and no base, `--branch` gives an empty diff or `baseline-not-applicable`; all 8 plugin-arm cases of the paid live tier would measure nothing. The plan half-sees it ("do not accidentally review an empty committed branch diff") but its remedy, "a configured base or explicit `--base`", cannot include uncommitted changes either. | `step-08-review.md:149-153`; `src/cli/main.ts:106-109`; `evals/scripts/src/evals-bench.mjs:293-316` (`reviewScaffoldFile`: commit, then `git apply`); origin: `review-migration-plan.md:32` (#117's replacement text: "the scaffold leaves the change uncommitted, so `--branch` is the target") | missed by review-migration-plan: #117's own fix misread the CLI; verified now against the code | Replace "First body line: `/ambicode:review --headless --answer estimate=run --branch`; preserve remaining body/front matter and naked prompt.md bytes. Scaffold change is uncommitted; branch target needs a configured base or explicit --base derived from synthetic scaffold metadata. Test actual target selection; do not accidentally review an empty committed branch diff." with "First body line: `/ambicode:review --headless --answer estimate=run` — **no target flag**: the review scaffold commits the base and leaves the change uncommitted (`reviewScaffoldFile`), and `review`'s default target is the uncommitted work (`--branch` reviews the branch, not the working tree). Preserve remaining body/front matter and naked `prompt.md` bytes. Test on a synthetic scaffold built the same way that `review --estimate` lists a non-empty file set and that the same command with `--branch` would list none." |
| 152 | medium | 00-README :5-6, :112-113, :194-196; step-00 §1–§2 | The plan overrides D19 and CHANGELOG round 3 ("no new baseline") on the strength of two user decisions — a new naked baseline, and declining its equivalence test — recorded nowhere but in the plan. The operational README that step 00 owns still says: "The naked plugin's arm is assumed to equal the harness's no-plugin arm. **Check that once** with `--ablation with-without` on the naked plugin before you trust a baseline built this way." Step 00 updates counts and costs in that README but not this sentence, so after step 00 the harness docs and the plan contradict each other on whether the baseline may be trusted. | `00-README.md:5-6, 112-113, 194-196`; `step-00-harness.md:31-32, 71-75`; `evals/evals-core/README.md` 'Baseline' bullets (ae45901); `v6/CHANGELOG.md` round 3 ("no new baseline"); `grep -rIl 19-44-56-791Z` → only `migration-plan_v6/` | introduced by this plan | 00-README after ":196" add: "Decision record (user, 2026-10-04, in the conversation that produced the baseline): «archived оставь там же обнови baseline» — the archived eval stays where it is, the working baseline is regenerated (→ `eval-2026-10-04T19-44-56-791Z.json`, supersedes D19 for this hand-off); «нет» to running the paid naked-vs-without equivalence check. No further baseline or equivalence run without a new instruction." step-00 §2, append: "Replace the README's 'Check that once with `--ablation with-without` … before you trust a baseline built this way.' with 'The user declined this check on 2026-10-04; every gate against the 2026-10-04 baseline prints the equivalence as unverified.' and make `eval-gate.mjs` print that line under `info` whenever the baseline's plugin is `naked` (test it)." |
| 153 | medium | 00-README decisions (0-V row); step-00 §2; step-03 "A version mismatch refuses" | Removing the 0-V bypass is right, but the plan puts the predictable consequence at the point of no return. `withBaseline` refuses any version mismatch; the machine moved 2.1.287 (2026-10-02 baseline) → 2.1.288 (review-migration-plan, 2026-10-04 morning) → 2.1.289 (2026-10-04 19:45 baseline and now) — three versions in ≤ 2 days — and v6/41 puts steps 0–3 at 2–3 weeks. Decision A will almost surely refuse, and only then is the user asked to pin or re-baseline. | `evals-bench.mjs:679`; baseline metadata (§0 above); `review-migration-plan.md:70`; `v6/41-migration.md:21`; `step-00-harness.md:55-58`; `step-03…md:198` | introduced by this plan (0-V superseded) | 00-README decisions table, replace the 0-V row with: "\| 0-V \| user, before step 00 \| No old-version bypass; a mismatch refuses. Decide now: (a) keep Claude Code at 2.1.289 on the measurement machine until decision A (record the mechanism and verify it), or (b) pre-authorize one naked re-baseline (`evals:baseline`, $15 cap, ≈ $10) on the version decision A runs on. Neither → A waits for the user when the version has moved \|". |
| 154 | medium | step-00 §4 "Add harness/gate `--kind`"; step-03 gate command | A parallel seam where one exists. `eval-gate.mjs` already checks recall, cost and turns **per kind** (`for (const kind of …runs.map((r) => r.kind))`), and `withBaseline` matches only the run's own cases, so a localize-only run gated against the 18-case baseline needs no flag. Localize cases carry the `localize` tag and `run` passes `--tag` through to `claude plugin eval` (`evals:walk` uses `--tag walk`). The new flag and the test "unrelated review cost cannot change investigate's gate" duplicate existing behaviour (CLAUDE.md: extend the seam that exists). | `eval-gate.mjs:58-87`; `evals-bench.mjs:111` (tags), `:680` (iterates `results.cases`); `package.json` `evals:walk` (`--tag walk`); `step-00-harness.md:120-125`; `step-03…md:187` | introduced by this plan | step-00 §4: replace the paragraph "Add harness/gate `--kind localize\|review` selection … before decision A permits building it." with "For the investigate-only decision, narrow the run with the existing tag filter (`run … --tag localize`). The gate already reports per kind and `withBaseline` matches only the run's own cases, so it needs no new flag; add a test that a localize-only result gated against the 18-case baseline yields localize checks only. Full curated generation remains 18; step 08 owns the later live review measurement." step-03: walk and decide commands gain `--tag localize`; the gate command drops `--kind localize`. |
| 155 | medium | 00-README :136-138, decisions A row; 03-review-resolution reading 12; step-03 :199-202 | Three changes to decision A are made by the plan rather than presented. (1) The population: v6 33 §1 gates A on the whole decide run; the plan scopes it to the 10 localize cases (reasoned — review cases would replay-miss — but it is the point-of-no-return criterion). (2) v6/41 step 3 lists "abandoned (then steps 4–5 ship on v0.4.0's slash and MCP hooks, #73)" as a user option; the plan says "do not implement an alternate v0.4.0 migration without a revised scope", without naming it as an option. (3) "Unrun measurement or unavailable P2/trust probe cannot be a proceed decision" removes the user's choice when P2 has **failed**; v6 has a defined fallback (non-acting answers only, acting via trusted preanswer) and D10 leaves proceeding to the user. | `00-README.md:136-138, 186`; `03-review-resolution.md:61-63`; `step-03…md:199-202`; `v6/33-measurement.md:59-64`; `v6/41-migration.md:11` | introduced by this plan | 00-README A row → "\| A \| 03 \| Investigate recall within the recomputed band and cost ≤ 1.15x over the 10 localize cases — **proposed scope** (v6 33 §1 names the whole decide run); the user confirms the scope before the paid decide; turns reported; user decides continuation \|". 00-README :136-138 → "If A fails, present v6/41 step 3's options (proceed, cut down, abandon with steps 4–5 on v0.4.0's hooks); a chosen fallback gets its own step file before dispatch." step-03 :201 → "An unrun measurement is not a proceed decision. A failed or unrun P2/P58 is presented with its limitation (interactive acting answers impossible; acting answers only as trusted preanswers); the user decides whether to proceed." |
| 156 | medium | step-00 §3 (per-arm prompts) vs `naked-arm.mjs` | `buildNaked` copies whole case directories into the naked control. After step 00, a case directory holds `prompt.with.md`, `prompt.naked.md`, possibly a swap marker, and — under Mechanism A — a per-arm prompt key in `case.yaml` that `claude plugin eval` reads itself. The plan's guard ("refuse `run --prompt with` with a naked … ablation") covers the harness flag only; a future `evals:baseline` (allowed by #153 (b)) would serve the typed `/ambicode:…` prompt to the naked arm under Mechanism A, or the swapped-in prompt after an interrupted Mechanism B run. | `evals/scripts/src/naked-arm.mjs:26-27` (`cpSync(…, { recursive: true })`); `step-00-harness.md:88-97` | new interaction: `naked-arm.mjs` is new in ae45901 | step-00 §3, append: "`buildNaked` copies a case without `prompt.with.md`, `prompt.naked.md`, the swap marker and any per-arm prompt key in `case.yaml`, and refuses to build while a swap marker is outstanding. Test: a case carrying all of them yields a naked copy whose `prompt.md` is byte-identical to the generator's naked prompt." |
| 157 | medium | step-01 §2 and "Integration contract" | The plan-body allow row needs ownership (chain's latest `route`, `adopts`, `exit {superseded}`), which the guard must compute inside a bundle allowed only `node:fs`; the integration contract then says step 03 "replaces the fixture reader with the shared ownership/session context … no second fold". The shared context is `RouteContextPort` over `Runtime` (async, zod) — importing it breaks the bundle rule and the 50 ms budget; not importing it is a second ownership fold. Two agents will resolve this differently. | `step-01-guard.md:80-85, 145, 158-160`; `01-contracts.md:63-79`; `src/hook/guard-core.ts:1` (no imports) | introduced by this plan (v1 plan had a pointer-only predicate) | step-01 §2: replace "ownership is resolved through the ledger-backed reader specified in 01-contracts" with "ownership is decided by one pure, import-free function `ownerOf(entries, slug)` in `src/route/ownership.ts` (created here; step 03's `RouteContextPort.assertOwner` calls the same function over the same parsed entries); the guard reads the ledger with `node:fs` and calls it — one predicate, not a second fold". Integration contract: replace "Step 03 replaces the fixture reader with the shared ownership/session context." with "Step 03 wires `assertOwner` to `ownerOf`; the guard keeps its `node:fs` reader." Proofs: add "startup re-measured with a 1 MiB ledger fixture". |
| 158 | medium | step-03 §2 vs step-09 §1; step-02 intro vs 01-contracts §2; 01-contracts §1 vs §6 | Three shared artefacts with two owners. (a) `SUPPORTED_SCHEMA_VERSION`: step 03 "extend strict config reader with schemaVersion 3", step 09 "`SUPPORTED_SCHEMA_VERSION` becomes 3" — between 03 and 09 a v3 file is either loadable or `config-schema-too-new`. (b) `src/route/context.ts`: contracts §2 "owner 03 … freeze typed exports", step 02 "Define the typed context port", while step 02 owns `src/task/` only. (c) Locks: step 02 serializes id allocation + append; step 03 "serialize[s] competing plan claim/write operations" — two locks over one ledger unless one reuses the other. | `step-03…md:33-36`; `step-09-init-rules.md:48-49`; `step-02-evidence.md:10`; `01-contracts.md:47-53, 56-58, 205-208` | introduced by this plan's ownership table | step-03 §2 append: "`SUPPORTED_SCHEMA_VERSION` becomes 3 here (reading only); step 09 adds writing and migration." step-09 §1: replace "`SUPPORTED_SCHEMA_VERSION` becomes 3" with "`SUPPORTED_SCHEMA_VERSION` is already 3 (step 03)". step-02 intro: replace "Define the typed context port; step 03 implements it." with "Create `src/route/context.ts` with the types of 01-contracts §2 only; step 03 owns that file from then on and implements it." 01-contracts §6: replace "Reuse filesystem ports; serialize competing plan claim/write operations" with "Serialize competing plan claim/write operations with step 02's ledger lock (one lock per task ledger, no second lock)". |
| 159 | medium | step-03 §7/§9; step-07 | v6's investigate route has a diagnostic path: "proposals run only through `$A check --only` after the raised gate `check-only-unauthorized`", with its own ceremony row. Step 03 ships investigate with "No check … needed", and step 07, which builds `check --only`, never returns to investigate. The path is in nobody's assignment. | `v6/skills/22-investigate.md:41-42, 52`; `step-03…md:125`; `grep -n investigate step-07-task.md` → no hit | missed by review-migration-plan (same gap in v1) | step-03 §9, append: "The `read` step text omits the diagnostic path until `check --only` exists; report this under Deviations." step-07 §2, append: "Then add the diagnostic sentence of 22 'Diagnostics' to the investigate `read` step text, with a test that `check-only-unauthorized` raised from investigate re-enters `read` through `$raisedBy` and that *don't run* is the default." |
| 160 | medium | 01-contracts §5 | "Known key/options resolve from the full registry and declared route. **Unknown options refuse.**" v6 allows free text wherever a gate declares `onAnswer` `"*"` (`$answer` substitution) — investigate's `scope` gate answers are free text by design, and the plan's own gate-table test drives "free text". Read literally, the contract refuses the scope answer. | `01-contracts.md:155`; `v6/modules/12-route.md:46`; `v6/skills/22-investigate.md` step 3a; `02-scenarios.md:34` | introduced by this plan | Replace "Unknown options refuse." with "Unknown options refuse, unless the gate declares `onAnswer` `\"*\"`: the text is then recorded as the answer and substituted for `$answer`. Free text is never acting." |
| 161 | medium | step-03 §9 ("trigger cases as negatives"); step-00 §2 (trigger scripts) | v6/41 deletes "`evals/evals-triggers` as a gate (cases kept as negatives)". The suite exists to gate description edits by which skill fires; its positive cases expect a skill to fire. Each of steps 03, 06, 07, 08, 09 sets `disable-model-invocation` on its skill, so those positives fail by design afterwards, yet no step flips them or retires `evals:triggers:gate`, and step 00 preserves both scripts. | `v6/41-migration.md:27-28`; `evals/evals-triggers/README.md:7-11`; `step-03…md:153-155`; `step-00-harness.md:65-66`; `package.json` `evals:triggers:gate` | missed by review-migration-plan | step-03 §9: replace "Keep trigger cases as negatives, not trigger gate." with "In `evals/evals-triggers`, each step that makes a skill user-invoked flips that skill's positive cases to 'no AMBICODE skill fires' (D2); step 03 does investigate's and removes `evals:triggers:gate` from `package.json`; the README says the suite now checks only that nothing fires on a plain question (41 Deleted). Model-free; running it is a paid item." |

Counts: **0 critical, 3 high, 10 medium.**

**Not counted (editorial):** 65 word-number fusions from a lost space (`default1`, `idle60`,
`exit0`, `instance19`, `Serial05→09`, `body2/start4/ground8/report-step2/map6/search4 KiB`, …;
`grep -oE` count over the 16 files) make the cap line in step-03 Proofs and several S-rows hard to
read; stale figures inherited from v1 (`step-05:80` "decide tier ≈ $14" is now ≈ $5.40 at 10 cases by
the plan's own rate; `step-05:30` "`reuse-cases.mjs` (restored in step 0)" — it is tracked);
`validate-plan.mjs` asserts specific sentences (`'Compute the\nnoise band …'`), so a wording fix breaks
the validator while proving nothing about content.

## 3. Prior findings #116–#131, verified in the plan text

| # | Where the plan closes it | Status |
|---|---|---|
| 116 | step-00:84-86 "Do not execute plugin eval to discover schema support … not a free dry run"; dry run spawns nothing (:127-129) | closed |
| 117 | step-08 "Review per-arm prompts (owned here)"; step-00:102-104 | closed as a deliverable; its prompt line is wrong → **#151** |
| 118 | step 00 owns the operational README and gate usage; v6 untouched | closed (moot after 0-V superseded) |
| 119 | step-00:50 keeps prompt/model/version/case/partial/arm refusals | closed (moot after 0-V superseded) |
| 120 | step-00:108-118 (`--forced` removed from the six scripts incl. `evals:baseline`, `--regenerate`, 18 vs 26 recorded) | closed |
| 121 | 00-README:192 "P21 \| 10 only"; step-10:85-86 | closed |
| 122 | serial order 05 → 09; step-09 header "5-I: none until user decision"; :146 "unknown means propose none" | closed |
| 123 | gate command without the bypass; validator asserts it | closed |
| 124 | ownership table rows; step-04 §5 "Extend step 03's"; step-05 §2; step-09 §2 "same file/symbols" | closed |
| 125 | step-03:87-88 (`ledger-unreadable`, `permission-denied`); 02-scenarios supporting assertions | closed |
| 126 | step-06 "Additional v6 deliverables" 5 | closed |
| 127 | step-07:128-132 (0-R, `reviewer-error`, no old recordings); :74-76 `baseline-missing` | closed |
| 128 | step-01:25 (§6 row B3), :93 (synthetic string), :83-85 (node:fs reading reported) | closed; see #157 for the new ownership tension |
| 129 | step-04:44-51 (literal names when observed, else class; `acceptanceField` marked as reading) | closed |
| 130 | step-08 "Byte ceilings and final integration" | closed |
| 131 | step-10 table row "Present … the user approves reopening" | closed |

## 4. Citation and starting-state audit (against `ae45901`)

Correct: `SPECS` (`main.ts:247`), `main` (`:196`), `dispatch` (`:265`); `OptionSpec` (`args.ts:8`);
`Runtime`/`openRepository`/`openWorkspace` (`root.ts:26, 80, 91`); `appendLedger`/`readLedger` with
`L<n>` ids and read-then-append (`ledger.ts:17-30`) — the plan's same-session race is real;
`{kind: 'note', note: <kind>}` (`note.ts:78`); `createExclusive`/`appendText` ports
(`filesystem.ts:40, 42`); `findSessionRepository`, `mintTaskSlug`; `src/checks/{run,select,
authorize,adapters}.ts`; `DIRECTORY_ALLOWLIST` lacks `routes/` (`package-candidate.mjs:15-21`);
`withBaseline` automatic naked arm (`evals-bench.mjs:672`), version refusal (`:679`),
`infrastructureError` (`:700`), `traceMetrics` (`:620`), `harvestTraces` (`:911`), `writeWalk`
(`:956`), `buildNaked` (`naked-arm.mjs:19`), `invalidRuns` (`run-validity.mjs:8`); the four reuse
files tracked; `stash@{0}` is `On eval: GYM-CACHE`; baseline metadata as the plan states (18 cases,
54 runs, 2.1.289, `claude-sonnet-5-5`, naked plugin, not partial). Input manifest: 50 digests verified.

Not true as stated: none of the "confirmed starting state" rows. The gate command's `--kind` flag
does not exist yet (the plan adds it; #154 argues it should not).

## 5. Completeness and fidelity against v6

- **v6/41 steps 0–10**: every item has a home. Moves the plan states and reasons about: step 9
  before 6 (scheduling); config reader and ecosystem table pulled into 03; `acs`/`refs`/`find` first
  versions in 03; live reviewer tier built in 08 with 0-R feasibility in 00 (as v1, settled). Gaps:
  investigate diagnostics (#159), trigger-suite conversion (#161).
- **S1–S14** (33 §8): all fourteen in 02-scenarios with the oracles v6 states, including M1's S6/S9,
  M3's S7 (refusal, no `exit`), H3's S3 (no new write/check), C1's S14 and C2's S13. Owners match
  v6/41's "Measured by" column.
- **R17/R18, C1, C2, H2, H3, M2**: contracts §3–§6 restate them without weakening; the
  `review-run`/`plan check` "consume, do not re-run" reading (contracts §3) is the sound way to
  reconcile a command the model runs with the code step that follows it.
- **D-decisions**: D2, D8, D9/D15, D10, D11, D12, D14, D17, D18/R16 enforced where they bite; D19 is
  superseded by the plan on a user decision I could not find recorded (#152).
- **Spend**: every model call is behind a dispatch line with a ceiling; the definition of a model
  call includes `claude plugin eval` and LLM graders even with a zero cost flag. P-S (#149) is the
  one probe missing from the table.
- **NDA**: no committed case names, key paths only, counts not labels; #150's fix keeps ignored
  inputs out of worktrees rather than relaxing this.

## 6. What I did not check

- No eval, probe, `claude -p` or `plugin eval`; P2, P17, P37, P47, P48, P58 and P-S stay unverified
  platform facts. Whether Claude Code exposes the session to Bash children (#149) is unknown to me.
- Case content, prompts, traces, `benchmarks/`, the archive's real-run report body.
- v6 modules 10, 11, 14–17 and skills 20, 21, 23, 24 beyond the sections the findings cite; the plan
  steps 04–10 were checked for v6 fidelity at the level of their deliverables, not line by line.
- Whether `fixtures/reviewer-recordings.json` replays for the `ts-source-regression` integration
  walk step 08 prescribes.
- The third external review's full text (only its CHANGELOG summary).

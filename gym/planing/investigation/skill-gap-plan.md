# AMBICODE: current vs perfect, and the road from one to the other

Report 3. It builds on [skill-walkthrough.md](skill-walkthrough.md) (today),
[skill-best-practices.md](skill-best-practices.md) (research) and
[skill-perfect-walkthrough.md](skill-perfect-walkthrough.md) (target).

## Context

Three reports sit in `gym/planing/investigation/`: today's walkthrough
(`skill-walkthrough.md`), the research (`skill-best-practices.md`) and the
target design (`skill-perfect-walkthrough.md`). The user asked for a strict
comparison of the target against the current plugin, a list of everything the
current plugin breaks, and a plan ordered from cheapest effort to best result.
Each step says how it is confirmed, why it should work and why it might not. A
full refactor is acceptable.

Rereading the reports, I re-opened the eval traces. They are on disk: 586 of
them in `evals/evals-core/results/traces/`. They overturn three statements in
reports 1 and 2, and the plan is built on the corrected facts.

## 1. New evidence from the traces (checked 2026-09-30)

I measured this with jq over the traces of the four 2026-09-29 runs. Each
count below is taken from `tool_use` blocks, not from graders.

```
run    model            plugin  arm   localize R   prepare ran  prepare piped/truncated  review skill fired
04-05  claude-opus-5-5   0.3.4  with  0.674        26/29        31/31 (28× head -c 5–20k, 3× node -e)   24/24 (neutral prompt)
                                 w/o  0.704
12-17  claude-sonnet-5-5 0.3.4  with  0.610         1/30        —                                   0/24  (neutral prompt)
                                 w/o  0.716
13-05  claude-sonnet-5-5 0.3.4  with  0.647         1/10        —                                   0/8   (neutral prompt)
                                 w/o  0.726
14-01  claude-sonnet-5-5 0.3.4  with  0.497         1/10        —                                   8/8   (prompt says "Use the ambicode review skill")
                                 w/o  0.790
```

- **The plugin was the same in all four runs; the model was not.** The
  investigate body in the traces is byte-identical across the runs; only
  `ARGUMENTS` differs. Each run pinned a model through `--model`
  (`suite.modelOverride`): Opus 5.5 first, then Sonnet 5.5. The npm scripts
  pin none, so the model depended on who typed the command. Report 1 said
  "each run tested a different plugin version", which was wrong, as was its
  claim that the traces were gone. Both are now corrected there.
- **What was measured is not HEAD.** The traces carry version 0.3.4.
  `plugin.json` at HEAD says 0.3.3, and the investigate body differs from
  `skills/investigate/SKILL.md`. So the baseline must be re-run on HEAD.
- **The skill's procedure depends on the model.**
  - With Opus, the agent runs `prepare` and the review skill fires.
  - With Sonnet, the agent loads investigate and then goes straight to
    `grep` and `sed`.
  - The review skill fires under Sonnet only when the prompt names it.
- **Prose rules fail even on Opus.** The skill says "Read it whole — never
  truncate it", yet the agent piped `prepare` through `head -c` in 28 of 31
  calls. It also re-ran `review` 2–3 times to strip `xcrun`/`xcodebuild` noise
  from the output with `tail`/`grep`.
- **Recall is lower with the plugin even when `prepare` never ran** (Sonnet:
  0.585 vs 0.744 mean, −0.16). So the loss comes from the skill text itself,
  not from the CLI. Precision is slightly higher with the plugin in 2 of 3
  Sonnet runs (0.648 vs 0.568; 0.613 vs 0.513). The text makes the agent more
  conservative.
- **Only on Sonnet is the recall loss larger than the noise.** The new
  `eval-gate` computes a noise band from how far an arm's mean moves between
  repetitions:
  - Opus 04-05: Δ −0.031 against a band of 0.064. This is noise. What fails
    on Opus is cost (1.32×) and turns (+4.7).
  - Sonnet 12-17: Δ −0.106 against a band of 0.098. This is a loss.
- **Review cost is not measured.** The review arm replayed a recorded
  reviewer answer (`EVAL_AMBICODE_REVIEWER_REPLAY`), so the reviewer's own
  $0.33–0.67 per review is missing from the arm. The gate reports that check
  as GAP.
- **Agents read through Bash, not through Read.** In the with-arm, Bash
  `cat`/`sed`/`grep`/`head` outnumber Read calls: 164 vs 85 on Opus, and
  177 vs 24 on Sonnet. The instruction to read spans with offset and limit is
  not what happens.
- **Three of the eight review cases hit `snapshot-too-large`.** These are
  `fe-vs-6086` ×2 and `fe-vs-6292`, where i18n JSON files exceed 262,144 bytes
  (`src/config/defaults.ts:41`). The agent recovers with `--exclude` after one
  or two failed full review runs.
- **Built-in skills in the listing overlap with ours.** The listing has 22
  skills, including Claude Code's own `code-review` and `verify`, so
  "review my change" has three candidates.

## 2. Strict comparison: perfect vs current

Verdicts: ❌ breaks the practice, ◐ partial, ✅ meets it.

| Area | Perfect (report 2) | Current, with evidence | Verdict |
|---|---|---|---|
| Triggering (A1) | ≥95% per case over 3 runs, on every pinned model | Review fired 0/32 unforced on Sonnet. The trigger suite has 8 cases, `--runs 3`, and no pinned model. | ❌ |
| Sibling and built-in collision (A2) | One verb family per skill; negatives in the eval | Nothing is tested against the built-in `code-review` and `verify`. There are no mixed-intent cases. | ❌ |
| Listing cost (A3) | Short descriptions; user-only skills hidden | ~495 tok | ✅ |
| Survival after compaction (A4) | Critical text reaches the agent through the body or re-run CLI output | "Read X if you have not this session", for 2 shared files. Inferred from the docs, not reproduced. | ◐ |
| Modules per activity (B1) | ≤3 | task loads 5: body, 2 shared files, contract, prompts | ❌ |
| Output bounded by design (B2) | Output never exceeds what the Bash tool shows whole: 30,000 chars, measured | Measured outputs fit: `prepare` 6.5–6.8 KB, `review` 5.0 KB. The 512 KiB `maxContextBytes` still allows larger payloads, which would reach the agent as a 2 KB preview. The agent truncates anyway (28/31), a habit the size does not force. | ◐ |
| Turns and cost (B3) | ≤1.1× cost and ≤+2 turns vs the no-plugin arm | 1.25–1.6× cost; +2.6 to +5.9 turns | ❌ |
| Fixed steps run as code (C2) | The CLI or a hook does invariant steps | `prepare` runs only if the model obeys: 26/29 on Opus, 3/50 on Sonnet | ❌ |
| "Never" rules enforced (C1) | A PreToolUse guard denies git writes and unaccepted plan saves | No PreToolUse hook. task has 19 "never" and 8 "do not"; plan has 15 and 8. | ❌ |
| Rule typography (C3) | Each rule states its reason; bold only where a skimmer must stop | 71 bold markers in plan, 54 in task, 41 in investigate | ❌ |
| Every gate has a release (C4) | Approve, decline and skip all tested | F1: a declined selector gate never releases (`src/checks/run.ts:134-151`). F7: rules wires packs in before its confirmation step. | ❌ |
| Model-authored rules (C5) | Verbatim `source.quote`, verified; drafts staged | Prose goes into live packs with no quote check | ❌ |
| Prompt injection from data (C6) | Reviewer has read-only tools, a snapshot and the untrusted-content contract | Same | ✅ |
| Evidence from the record (D1) | Ledger plus Stop hook; the navigation line is computed | The navigation line and "red before green" are self-reported | ❌ |
| Paraphrased requirements (D2) | The raw hash is compared with the envelope | Undetectable | ❌ |
| An empty result is not "clean" (D3) | The CLI prints coverage and the agent quotes it | The CLI prints coverage; quoting is not checked | ◐ |
| Precision in production (D4) | Selections on the view page are recorded | Not recorded | ❌ |
| Trust and safety (E1–E3) | Minimal grants; a human publishes | Human publication ✅. `Edit(**)`/`Write(**)` in any repo, with no workspace-trust gate (E2) ❌ | ◐ |
| Read / write / execute separation | Read-only skills get no write tool (writes go through the CLI); edits are scoped; every execution is a policy-authorized CLI call | investigate and plan grant Write. Reads go through Bash `cat`/`sed`. task has no sanctioned way to run one test or the formatter (F6). | ❌ |
| Measurement (F-1…F-5) | Pinned model, ≥3 runs, a Δ gate, a calibrated judge, cost in the verdict | The model is not pinned (the confound above). Runs per case vary (1 or 3). No Δ gate. The judge is uncalibrated. The review arm's prompt was changed to force the skill. | ❌ |
| Documented outcomes (F3) | Every emitted code documented | 14 codes are missing; `--decline` and `--task` are missing from `--help` | ❌ |
| Task continuity (F4) | The CLI mints the slug once | The agent builds the slug; source-free work splits into several directories | ❌ |

**Root causes.** Four causes produce nearly every ❌ above.

1. **The workflow lives in prose, and a weaker model skips it.** This causes
   C2, B3, C3 and the Sonnet collapse.
2. **The agent distrusts CLI output that fits.** This was corrected after
   measuring (`probes-2026-09-30.md`). The outputs are 5–7 KB, and the Bash
   tool shows up to 30,000 characters whole. The agent still pipes `prepare`
   through `head -c` and re-runs `review` to filter it. The cause is the
   model's habit, together with the noise the eval sandbox adds (unverified).
   The size is not the cause.
3. **There is no enforcement layer.** Everything is text or `allowed-tools`,
   and `allowed-tools` grants but does not forbid. This causes C1, D1, D2 and
   E2.
4. **Measurement cannot separate a plugin change from a model change.** This
   causes F-1 through F-5. Every earlier conclusion about the plugin is
   confounded.

## 3. Iterations, cheapest effort first

Each iteration names its effort (my guess, unverified), its eval spend, its
changes, how it is confirmed, and why it should or might not work. **Kill
criterion** means the evidence that drops the iteration. A change that fails
its confirmation gets reverted, including anything that existed only to
support it.

Eval spend is measured from the 2026-09-29 result files:

```
Opus 5.5:   $57.83, 53 min for ~107 case-runs (both arms)   ≈ $0.54 per run
Sonnet 5.5: $21.26, 26 min for 108 case-runs                ≈ $0.20 per run
One decision = 18 cases × 3 runs × 2 arms × 2 models        ≈ $80, ~80 min at -j 4
```

**Superseded on 2026-09-30.** Campaign R1 spent about $221 in 13.5 h and used
up a weekly plan limit before this plan's first iteration was finished. The
$80 two-model matrix is no longer the unit of spend. Every eval now goes
through a capped tier (`evals/evals-core/README.md`, "Deciding with it"):

```
walk      6 cases × 1 run × plugin arm, Sonnet      $1.12–1.28, 2 min (measured)
decide    26 cases × 3 runs × plugin arm, Sonnet    ≈ $14 (projected), gated against a cached baseline
baseline  26 cases × 3 runs × 2 arms, Sonnet        ≈ $28 (projected), once per Claude Code version
Opus      by hand, at a release only
```

Every "Spend" line below gives its tier. Haiku was probed as the cheap tier
and rejected. On localize it cost 1.7–1.9× Sonnet, because it took 3–4× the
turns, and its behaviour differs from Sonnet's (`probes-2026-09-30.md` §5).

### Iteration 0: measurement you can trust
Effort S, 1 day. Spend: one `evals:baseline` (≈ $28). A repeat for the noise check is a second baseline, and runs only on an explicit go.

Nothing after this iteration can be judged without it.

- **Pin the model.** Add `--model` to the `evals`, `evals:full` and
  `evals:triggers` scripts in `package.json`. Run a two-model matrix (Opus 5.5
  and Sonnet 5.5) as separate result files. Record `model` per run in `score`
  output (`evals/scripts/src/evals-bench.mjs`, `score` at about line 538).
- **Fix the run count.** `--runs 3` for decisions; keep the current case YAML
  `runs: 1` only for a smoke tag.
- **Add trace-derived measures to `score`.** Count them from the `tool_use`
  blocks, as done above, not with a regex over the whole trace:
  - `prepare-ran`
  - `prepare-truncated`
  - `review-runs-per-case`
  - Bash reads versus Read calls
  - files named
  - turns and cost

  The harness already copies traces into `results/traces/`.
- **Separate "does it fire" from "does it help".**
  - The review arm returns to the neutral prompt.
  - The forced prompt ("Use the ambicode review skill") becomes a third arm,
    `with-forced`.
  - Triggering is judged on the neutral prompt only.
- **New script `evals/scripts/src/eval-gate.mjs`.** It fails when any of the
  following holds:
  - `partial` is set;
  - for localize, recall with the plugin is below recall without by more than
    the spread (the spread is the min–max over 3 runs);
  - the cost ratio exceeds the budget;
  - `meanDelta` is below 0 beyond the spread.

  Put a unit test beside it in `evals/scripts/src/*.test.mjs`.
- **Probe three platform facts** that later iterations depend on, and record
  each result in `gym/`:
  - Where the Bash tool cuts output. I'd guess about 30,000 characters from
    the docs; this is unverified.
  - Hook latency. Time `node scripts/ambicode.mjs hook` against a no-op script
    for 20 calls each.
  - Whether a `PostToolUse` hook on `AskUserQuestion` and on `Skill` receives
    the answer or the arguments. Test it in a throwaway settings file.
- **Correct reports 1 and 2**, as stated in §1 above.
- **Save this comparison** as `gym/planing/investigation/skill-gap-plan.md`.

**Confirm.**
- Two back-to-back runs of the same config and model agree within the stated
  spread.
- The gate script's test fails on a fixture with negative Δ and passes on a
  positive one.
- `npm run verify` is green.

**Why it should work.** It removes the confound that is already proven (model
change), and it applies course B5/F-1 practice.

**Why it might not.**
- Ten localize cases give a spread wide enough to hide every effect below
  about 0.1 recall.
- The mitigation is more cases: 13 of 59 BE and 7 of 57 FE cases are eligible
  (`sweep-1.log`). A bigger set raises the cost of each decision.

**Kill criterion.** None. Everything else depends on this iteration.

### Iteration 1: the reproduced defects
Effort S, 1–2 days. No eval spend.

- **F1.** In `src/checks/run.ts:134-151`, honour `options.declines` for
  `selectorKey`: report the check as a declined gap, as line ~220 already does
  for check keys. Test first, in `src/checks/checks.test.ts`, next to the
  selector approve test at `:651-666`.
- **F3.**
  - Add a test that collects every `AmbicodeError` code from `src/` and
    asserts that each one appears in `skills/review/references/outcomes.md`,
    or on an explicit allowlist of internal codes.
  - Document the 14 missing codes.
  - Add `--decline` and `--task` to `src/cli/main.ts` help.
- **F7.** Reorder `skills/rules/SKILL.md`: the disposition table and
  confirmation come before wiring. Add a stated rollback, which removes the
  `policyFiles` entries and the pack files.

**Confirm.** New tests fail on the unmodified code, then pass. `npm run verify`
is green.

**Why it should work.** Each defect is already reproduced or counted.

**Why it might not.** It won't move Δ. These are correctness fixes, not
performance fixes.

### Iteration 2: subtraction, the cheapest lever on the measured regression
Effort S. Text only. Spend: `evals:walk` per variant (≈ $1.2 each), then one `evals:decide` (≈ $14) only for the variant the walks favour.

Hypothesis: the investigate text itself costs recall, since Sonnet lost 0.16
without ever running the CLI. Build three variants cheaply and measure them
(CLAUDE.md: build both, report the loser's number).

- **A:** the current `skills/investigate/SKILL.md`, 1,053 words.
- **B:** a slim body of about 250 words. Retrieve the sources, then run
  `$A prepare … --term …` once, reading it whole, then read the shortlist,
  then name every file the change would touch with a one-line reason each,
  then save the note. Remove the bold MUST/never typography and give each rule
  its reason (C3). Remove the pointers to shared files; state the 5 rules
  inline.
- **C:** investigate made non-model-invocable. This measures whether the
  skill should exist for localization at all (Vercel: passive context beat the
  skill).

Apply the same typography and pointer hygiene to plan, task and review only
after B wins, and measure again.

**Walk result, 2026-09-30.** `run --plugin` on copies of the packaged plugin,
Sonnet 5.5, 2 localize cases × 2 runs per variant, $1.01–1.53 each, $6.3 in all
including one discarded round (B's first walk, invalidated below). This is a
mechanics read, not a decision: n=4, and recall differences of 0.05 sit inside
the noise.

```
variant                          prepare ran   prepare cut   turns   P     R     F1    $ (4 runs)
A  current, 1,053 words          0/4           —             18.0    0.22  0.23  0.21  1.26
B  slim, 287 words               3/4           3/3           19.0    0.26  0.29  0.25  1.01
B2 B + the reason for "bare"     4/4           0/4           20.3    0.35  0.31  0.32  1.18
C  not model-invocable           0/4           —             25.3    0.31* 0.17* 0.21* 1.53
```
`*` C's fe-vs-6334 run 1 named no files (absent), counted as 0.

- The body size is not what fixed `prepare`. **B ran it but piped it through
  `head` in 3 of 3 runs**, with "read all of its output" in the text. B2 adds the
  measured reason (about 6.5 KB against a 30,000-character limit, so a cut only
  drops the policy at the end) and the cut vanished, 0 of 4. That is the
  earlier "never truncate failed 28/31" finding, reproduced, and also the
  first text-only wording that held. Four runs is a signal to confirm, not proof.
- B lost the skill trigger in 1 of 4 runs with an unchanged description, so
  firing is not deterministic; iteration 3 owns that.
- C (skill off) cost the most, 1.53 against 1.26 (A) and 1.18 (B2), with 25
  turns against 18–20, and had one run with no answer. The skill helps
  efficiency even where `prepare` never ran; on this evidence "drop
  investigate for localization" is not the way to go.
- **B2 does not land yet.** Swapping it into `skills/investigate/SKILL.md`
  fails 5 shipped-content tests (unconditional note, shared-contract pointer,
  LSP navigation evidence line, shortlist discipline and pointer). Each pins a
  decision the slim body dropped. Landing B2 means deciding which of those
  five to keep in it. The text is saved as
  `gym/planing/investigation/investigate-B2-candidate.md`. The decision-tier
  confirmation below has not been run.

**Confirm.** `eval-gate` on Sonnet against the cached baseline:
- recall(with) ≥ recall(without) − spread;
- cost ≤ 1.1×;
- `prepare-ran` is reported.

**Why it should work.**
- SkillsBench: rigid procedures displaced reasoning in 13 of 87 tasks.
- Smaller bodies and 1–3 modules gain +19 pp against +10 pp.
- The trace shows the with-arm naming fewer files.

**Why it might not.**
- The localize question rewards recall, while the plugin's value may be
  precision. The plugin was more precise in 2 of 3 Sonnet runs. Report F1,
  precision and recall together. The user decides whether precision is the
  goal.
- If C wins, investigate's localize role is dropped, and the "note for plan"
  value is kept only if a plan-suite measure shows it.

**Kill criterion.** If A beats B and C beyond the spread on Sonnet, keep
A and stop subtracting.

### Iteration 3: triggering
Effort S. Text plus eval cases. Spend: `evals:triggers`, capped at $5 (a trigger suite of about 25
queries × 3 runs on Sonnet).

- Grow `evals/evals-triggers` from 8 to about 25 cases:
  - 12 mixed-intent phrasings ("look at ORD-17 and fix it");
  - 5 negatives;
  - 3 collisions with the built-ins ("review my change" vs `code-review`,
    "verify this" vs `verify`).
- Use the skill-creator method: a 60/40 split and at most 5 description
  iterations, keeping the best **test** score.
- Rewrite the descriptions in `skills/*/SKILL.md` frontmatter keyword-first.
  The review description should state what the built-in lacks: GitLab MR,
  Jira ticket, policy checks.

**Result, 2026-09-30** (Sonnet 5.5, structural graders, $8.0 in all; suite now
28 cases, split 15 dev / 12 test / 1 diagnostic, README in `evals/evals-triggers/`):

```
                         before (1 run)   after D1 (1 run)   after D1 (test, 3 runs)
dev   (15 cases)         14/15            15/15              —
test  (12 cases)         12/12            12/12              36/36
diag  url-bare           0/1 (known)      0/1 (known)        —
review-bench-shape       0/4              3/3 + 1/1          —
```

- Explicit phrasings ("review my change", "which files would I touch", a verb plus
  a ticket URL) already fired the right skill on the old descriptions, in 26 of
  27 runs. The 56% no-invoke rate from the sources did not reproduce here, so the
  rewrite of all five descriptions the plan proposed was not needed. One
  description changed.
- The one gap is the *neutral review prompt*, the one the curated review cases
  use. The model read `git status` and `git diff` first and reviewed by itself
  (4 of 4 runs, traces read). The review description, unlike investigate's and
  task's, never said "instead of doing it yourself". D1 says so and names the
  phrasing (`skills/review/SKILL.md`).
- **On the core eval, the neutral review prompts now fire `ambicode:review`**: a
  `evals:walk` after D1 shows the skill in both unforced review cases, which
  fired it 0 of 24 times before. That walk also shows what comes next: the FE
  review case still hits `snapshot-too-large` at step 2, and `prepare` still does
  not run in the localize cases (iteration 4).
- Limits: one description iteration of the 5 allowed, and D1 was written after
  reading the failing prompt, so `review-bench-shape` is a dev case that D1 was
  fitted to. The held-out `test` split has no case that failed before, so it
  shows no regression, not a gain. 36/36 is over 12 cases × 3 runs.

**Confirm.** ≥95% per positive case on Sonnet over 3 runs, and 0 fires on
the negatives.

**Why it should work.** A1: Vercel's 56% no-invoke rate and Spence's 50–55%
baseline were both moved by description and instruction changes.

**Why it might not.**
- Built-in skills may win on "review my change" whatever we write.
- The fallback is Spence's forced-eval `UserPromptSubmit` hook, which reached
  100% activation at +10.7 s per prompt. Adopt it only if the cost is
  measured and accepted.

### Iteration 4: fixed steps become code, and the output needs no second look (root causes 1 and 2)
Effort M, about 1 week. Spend: `evals:walk` for each build (≈ $1.2); it shows directly whether `prepare` ran. Then one `evals:decide` (≈ $14).

- **Make `prepare` run by construction, through a `PostToolUse` hook on
  `Skill`.** The route is probed and it works: the hook receives `{skill,
  args}` as JSON, and its `additionalContext` reaches the model.
  - The hook runs `prepare` for `ambicode:investigate|plan|task` and takes
    terms from the args through the existing seam `termsFromRequirements`
    (`src/code-intelligence/locate.ts`).
  - It finds the repository at the session directory or one level below it,
    because the eval cases put it in `repo/`.
  - The other route, `!`command`` injection in the skill body, was **built
    and rejected**. It shell-evaluates `$ARGUMENTS`: `x$(echo SUBSHELL-RAN)y`
    ran. Skill args come from ticket text, so this is command injection.
  - The hook is a standalone script, not the 259 KB bundle: 38 ms against
    88–143 ms, measured.
- **Make the work order self-explaining, and cap it at 30,000 characters.**
  - Put a 5-line header in `src/cli/commands/prepare.ts`, so that
    `skills/shared/prepare-output.md` can be deleted and the task module count
    drops from 5 to 3.
  - Replace the 512 KiB `maxContextBytes` cap for the agent-facing payload
    with the measured Bash limit, and refuse above it with `--show <section>`.
- **Dropped after measuring: auto-omitting oversized review files.** The
  `snapshot-too-large` refusal returns quickly, names its release
  (`--exclude …`), and states a deliberate principle ("AMBICODE does not
  review part of a change and report it as a whole"). It costs one fast turn,
  not a review.
- **`--task-open <request|id>`** mints the task slug once (F4). `requirements
  template` prints the envelope skeleton, so `requirements-mcp.md` shrinks to
  that skeleton.

**Confirm.**
- `prepare-ran` ≥ 95% on Sonnet.
- `prepare-truncated` = 0.
- The hook's `prepare` appears in 100% of traced runs where the skill fired.
- Turns within +2 of the without arm.
- Recall no worse than after iteration 2, beyond the spread.

**Why it should work.** B3 and C2: the workflow runs as code, and programmatic
tool calling cut tokens 37%. This removes the model dependence measured
above.

**Why it might not.**
- Auto-prepare with bad terms gives a noisy shortlist that anchors the model
  and could cut recall further. The gate catches this, and the fallback is
  prepare-on-request with a slim body.
- The agent may run `prepare` again anyway, from habit, which adds a turn.
  Count it with `prepare-ran` > 1 per run, and state in the skill that the
  hook already did it.

**Results, 2026-09-30 (hook and shortlist only; the rest of this iteration is not started).**

What is built: the `Skill` hook, `prepare` run with terms from the skill args,
delivered whole. Not built: the 5-line header and deleting
`prepare-output.md`, `--task-open`, `requirements template`, the 30,000-character cap.

- **Delivery limit, probed.** Hook context of at most 9,800 characters arrives
  inline; 10,400 or more is saved to a file behind a preview and a path. The FE
  scaffold's payload was 10,215 bytes at 10 candidates, so it would have arrived
  as a file. The hook now drops the lowest-ranked candidates until the message
  fits (`INLINE_LIMIT`), and a test fails without that.
- **The mechanics worked and recall did not move.** First hook walk, 6 localize
  runs, $1.85: P 0.21 R 0.20 against A's P 0.22 R 0.23. Cause: the shortlist
  built from model-written skill args had 0 hits on the true files (0 of 10 FE,
  0 of 7 BE). The shortlist was the weak link, not delivery.
- **Shortlist recall, measured offline and free** (`npm run
  evals:shortlist-recall -- <BE repo> <FE repo> [limit]`: terms from the 116
  real tickets, does `locate`'s top N hold the true files):

```
variant                                   recall@10   any-hit of 116
baseline                                  0.197       54
E1+E2 (term weighted by how few files
  it hits; identifier word parts as terms)  0.269       68   (kept)
E3 E1+E2 + stemming                         no gain          (reverted)

E1+E2 at other limits: @15 0.314 (72)   @20 0.346 (79)   @30 0.396 (85)
BE @15 0.499 (46 of 59 any-hit)   FE @15 0.123 (26 of 57)
```

  FE stays weak: its true files share no vocabulary with the ticket, which is
  a job for LSP and the model, not for term matching.
- **Payload, to afford 15 candidates.** Two reasons per candidate instead of
  all of them, limit 10 to 15:

```
6 terms                     BE bytes   FE bytes
limit 10, all reasons       9,165      10,215
limit 10, 2 reasons         8,531       9,345
limit 15, 2 reasons         9,389      10,389   -> hook trims
limit 20, 2 reasons        10,316      11,447   rejected
hook output, real          BE 9,640 (14 kept)   FE 9,754 (10 kept)
```

- **Walk, Sonnet, 10 localize cases x 1 run, `with` only, $1.93** (after the
  locate change): BE P 0.62 R 0.80, FE P 0.49 R 0.75, overall P 0.55 R 0.78.
  The walk report says "prepare never ran" for every run. That is the report
  counting Bash calls only; eval traces carry no hook events, so hook delivery
  cannot be seen there.
- **Not a result: the same ten cases without the plugin.** The contrast run hit
  the account's session limit (resets 11:10pm Europe/Warsaw); 12 of 20 runs
  ended in one turn at $0. The 3 BE cases with both arms valid (be-vs-5075,
  5546, 5766) give with R 0.51, without R 0.47: no signal. The 6 earlier runs are a
  different case set, so 0.20 to 0.78 is not a controlled improvement. The
  contrast has to be rerun before this is called a win over the naked model.
- Run-to-run spread is large: be-vs-5546 gave R 1.00 and 0.67 on two
  identical `with` runs.

### Iteration 5: an enforcement layer (root cause 3)
Effort M, about 1 week. Spend: unit tests, then one `evals:walk` for the regression check (≈ $1.2).

- **A `PreToolUse` guard** in `hooks/hooks.json` and `src/hook/run-hook.ts`.
  - Bash, using `if:` matchers: deny `git commit/push/stash/reset/checkout/clean`
    and `glab mr`.
  - `Write|Edit`: deny `.ambicode/task/**` except through the CLI. Answer
    `ask`, never deny, for an edit outside the prepared paths, with the
    re-prepare hint.
  - A standalone script, not the bundle. Measured over 20 calls: 38.4 ms
    against 87.7–143.4 ms. The target is < 50 ms per matched call.
  - While here, give the existing `PostToolUse(Edit|Write)` hook the same
    treatment. It costs 143 ms per edit and emits nothing unless a pack opts
    in (F2).
- **The ledger** (`.ambicode/task/<slug>/ledger.jsonl`), written only by the
  CLI and hooks. The first step is the `prepare`, `baseline` and `check`
  entries.
- **`$A note save --task <slug> --kind investigation|plan|notes`.** A plan
  save is denied unless the ledger holds an acceptance entry, which depends on
  the iteration 0 probe. Without the probe result, the fallback is `$A accept`.
- **Narrow `allowed-tools`.**
  - investigate and plan lose `Write`.
  - task keeps `Edit` and `Write`, guarded by the `ask` above.
  - This addresses E2, because pre-grants are no longer blanket.

**Confirm.**
- A hook unit matrix of deny, ask and allow for every rule, in `npm run
  verify`.
- Latency measured and reported.
- The `ask` fires on ≤20% of benchmark edits.
- Eval Δ does not regress.

**Why it should work.** C1 and course B6: structural boundaries beat prompts.
Measured: text-only "never truncate" failed 28/31.

**Why it might not.**
- The standalone guard cannot resolve policy, since that would need the
  bundle. Keep it to static path and argv rules.
- False denies block real work, which is why grey cases get `ask`.
- The ledger is a new artifact, kept append-only and schema-tolerant.

### Iteration 6: evidence from the record
Effort M–L, 1–2 weeks. Spend: `evals:walk` (≈ $1.2), then one `evals:decide` (≈ $14).

- **`$A report --task <slug>`** prints Evidence and Not verified from the
  ledger.
- **A `Stop` hook** that blocks once, guarded by `stop_hook_active`, when:
  - a cited `path:line` does not exist;
  - a ledger gap is missing from "Not verified";
  - "accepted" is claimed with no acceptance entry;
  - the review "not covered" block was not quoted verbatim.
- **The navigation line** is computed from `transcript_path`, with a fixture
  test for the transcript parser.
- **A `PostToolUse` hook on the MCP read tools** records `rawHash`, and
  `requirements-paraphrased` is refused (D2).

**Confirm.** 100% of cited `path:line` exist across the eval runs. Fixture
tests cover each Stop rule, including a case where it must not block.

**Why it should work.** D1: checked evidence replaces claimed evidence.

**Why it might not.**
- The transcript format is not a documented API.
- MCP servers return rendered HTML, so hashes need normalization.
- Stop-hook nagging adds turns. Measure the block rate; above 10% of runs,
  loosen the rule.

### Iteration 7: task gets a sanctioned execute path, and a suite that measures task
Effort L, about 2 weeks. Spend: a new suite, so its own baseline. Size it with one walk-style run first, and cap every script.

- **`$A check --task <slug> <key> --only <file>`**, for the red and green
  runs. It reuses `runChecks` and the authorization seam in
  `src/checks/{run,authorize}.ts`; do not add a parallel runner.
- **A new `format` command slot** (run, propose or forbid), set up by init.
- **`review --task` baseline scoping** (F5): the baseline's dirty files that
  the task did not touch are excluded and stated.
- **`review --estimate`** (a dry `bundle`).
- **A new eval suite, `evals/evals-task`**: 10 defect tickets, each with a
  hidden failing test. Graders:
  - the hidden test passes;
  - the ledger shows red before green;
  - no assertion was weakened (a diff check).

**Confirm.**
- pass(with) − pass(without) exceeds the spread, on Sonnet.
- Cost ≤ 1.2× unless the pass gain pays for it.

**Why it should work.** It measures what `task` claims. Today there are no
task cases, so the task skill is unmeasured.

**Why it might not.**
- SWE-type gains from skills are small (SkillsBench SE +4.5 pp). The suite may
  show Δ ≈ 0 again.
- If it does, cut `task` down to the guard plus the review offer, and let the
  base agent do the editing.

### Iteration 8: rules and init refactor
Effort M–L. No benchmark effect; the gates are tested.

- **rules:**
  - `rules discover`;
  - drafts go to `.ambicode/policies/drafts/`;
  - a verbatim `source.quote` that `policy check --drafts` verifies;
  - validation bounded at 3 rounds;
  - a confirmation table before `rules apply`;
  - `rules revert`.
- **init:** `--dry-run` is mandatory, followed by `init --apply --set k=v`
  (the CLI writes the YAML) and `doctor`. That proves every non-null command
  starts.

**Confirm.**
- Fixture repos show 0 packs live before confirmation, 100% of quotes
  verified, and 0 `pack-glob-matches-nothing`.
- `doctor` fails on a broken argv fixture.

**Why it should work.** C5: self-authored procedure averages −1.3 pp, while
curated and quoted procedure gains.

**Why it might not.** Confirmation fatigue. Batch everything into one table
with defaults.

### Iteration 9: the production precision signal
Effort M.

- The `view` page records offered, selected, edited and posted per finding,
  into `result.json` and `.ambicode/metrics.jsonl` (D4).

**Confirm.** A page test shows that submitting writes the counts.

**Why it should work.** It gives a free, real-world counterpart to the
"< 1% marked incorrect" figure.

**Why it might not.** Selection bias: people skip correct but low-value
findings. Report it as the accepted rate, not as precision.

## 4. Verification, end to end

- Every iteration: `npm run verify` is green, and new tests fail before the
  change. `CLAUDE.md` names 543 tests; the latest log shows 749. Update the
  number when a test is added.
- Iterations 2–7: `evals:walk` first, then `eval-gate` on `evals:decide` against the cached Sonnet baseline, `--runs 3` (Opus only at a release). The
  result file and the score output are committed next to the change, and the
  losing variant's numbers are reported.
- Iterations 4 and 5: measure against `dist/` after `npm run
  package:candidate`, not `src/`, and install through `install-local` before
  the eval.
- The finish line is the "perfect" bar from report 2 §10:
  - localize recall(with) ≥ recall(without), and cost ≤ 1.1×;
  - review fires in ≥ 95% of unforced cases;
  - task pass(with) > pass(without);
  - 0 text-only "never" rules.

## 5. Not settled by this plan

- Whether the goal on localize is recall or precision. The plugin trades one
  for the other on Sonnet. Iteration 2 reports both, and the user decides.
- Probes done (`probes-2026-09-30.md`): the Bash limit is 30,000 characters;
  hook latency is 38 ms standalone and 88–143 ms for the bundle; the `Skill`
  hook gets its args. Still open: whether `PostToolUse` on `AskUserQuestion`
  carries the answer. That needs one interactive session, and the settings
  file for it is in the probes doc. The fallback is `$A accept`.
- The effort figures are guesses. The eval spend comes from measured
  per-run cost.

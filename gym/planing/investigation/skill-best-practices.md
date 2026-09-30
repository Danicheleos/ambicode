# What a perfect skill and plugin look like: issues, fixes, pushbacks, best measured numbers

Report 1 of 2. Report 2 is
[skill-perfect-walkthrough.md](skill-perfect-walkthrough.md), which applies
this report to each AMBICODE skill.

## 0. Sources, and what I could not read

| Source | Read | Used for |
|---|---|---|
| `archive/work-with-agents/plan.md` | whole | The learning map. |
| `course/stage-a.md` (A1–A4) | whole | Context budget, portable skills, MCP, plugin evals. |
| `course/stage-b.md` | B1 theory, B2, B3 theory, B4 pitfalls, B5, B6 | Agent patterns, evals methodology, judge calibration, reliability. |
| `course/stage-e.md` | E1 theory, E3, E5, capstone; pitfalls of E2 and E4 | When to fine-tune, data rules, eval before tuning. |
| `course/00-glossary.md` | stages A and B | Terms. |
| `course/stage-c.md`, `stage-d.md` | headings and pitfall lists only | Model internals and local serving. They are not about skills. Their one transferable rule, "measure on your own tasks, on one backend, never from a leaderboard" (D3, E5), is in §3.F. |
| [Medium: "Fine-Tuning Claude — A Practical Guide"](https://medium.com/@heyamit10/fine-tuning-claude-a-practical-guide-477ac6e8dcf2) | **not read**: HTTP 403 from WebFetch, curl, the author subdomain and the mirrors. Only the search snippet is visible. | Nothing. The snippet says the guide fine-tunes Claude with "Hugging Face's transformers" on "a GPU-enabled environment". Claude's weights are not public, so that cannot be a fine-tune of Claude. I treat the article as not credible and cite no number from it, including its "60% less post-processing" claim. |
| [AWS: fine-tuning Claude 3 Haiku on Bedrock](https://aws.amazon.com/blogs/machine-learning/best-practices-and-lessons-for-fine-tuning-anthropics-claude-3-haiku-on-amazon-bedrock/) | whole | §2. |
| Web research, 2026-09-30 | per link in §4 | §4, world-best numbers. |
| AMBICODE's own eval results (`evals/evals-core/results`, `evals/evals-triggers/results`) and `claude plugin details` | measured locally today | §5, where AMBICODE stands. |

## 1. The short answer

A perfect skill has seven properties. Each one is measurable, and each one
is backed by a source in §3 or §4.

1. **It fires when it should, and only then.** It does this on natural
   phrasings, including negative cases. Measure it with a trigger eval: about
   20 queries, split 60/40 into train and test, with 3 runs per query.
2. **It is cheap to carry.** The description is short and keyword-first. The
   body stays under 500 lines, and anything else loads only on demand.
3. **Code does the fixed steps, and the model does the judgment.** If a step
   is the same every time, it belongs in the CLI, not in prose the model
   might skip.
4. **Its "never" rules are enforced, not requested.** Permissions and
   `PreToolUse` hooks deny the forbidden action. The text only explains why.
5. **Every gate has a release.** Approve, decline and skip all work, and a
   test exercises each one.
6. **Its output can be checked.** Every claim cites an artifact that a script
   can verify: a path:line that exists, a run id in a ledger, a check result.
7. **It measurably beats the same agent without it.** The comparison runs on
   a frozen case set, with ≥3 runs, a pinned model, and the Δ gated in CI. A
   skill with Δ ≈ 0 is always-on cost with no return.

AMBICODE today has 3, 5 (except F1) and part of 2. It fails 7: the plugin's
own benchmark shows Δ ≈ 0 and worse localization recall (§5).

## 2. Fine-tuning versus skills: what the two fine-tuning sources teach

**Where fine-tuning sits.** The course's ladder (E1) is: prompt first, then
retrieval or tools, and fine-tuning last. You tune only when a frozen eval
shows the base model failing *and* you have 200–2,000 examples of the
behaviour you want. A skill is rungs 1–2. Fine-tuning changes the
distribution of answers. It does not add knowledge.

**Fine-tuning is not available for the models AMBICODE runs on.** Bedrock
fine-tunes **Claude 3 Haiku** only, in us-west-2, with at most 10,000 training
and 1,000 validation records
([AWS GA post](https://aws.amazon.com/blogs/aws/fine-tuning-for-anthropics-claude-3-haiku-model-in-amazon-bedrock-is-now-generally-available/)).
Anthropic's usage policy also forbids training a model on Claude outputs
without authorization (course E3). So distilling AMBICODE's reviewer into
another model is blocked unless the teacher is an open-weights model.

**What the AWS numbers show, on TAT-QA financial QA (10,000 train, 3,572 test):**

```
model                      F1     vs fine-tuned Haiku
fine-tuned Claude 3 Haiku  91.2   —
Claude 3.5 Sonnet (base)   83.0   −9.9%
Claude 3 Sonnet (base)     76.3   −19.6%
Claude 3 Haiku (base)      73.2   −24.6%
output tokens: 34 → 22 mean (−35%), −39% median, stdev 27 → 14
```

**The lessons that transfer to skills without any training:**

- **Quality beats quantity.** A smaller clean set beats a larger noisy one.
  For skills, this matches SkillsBench: curated skills help and
  self-generated ones hurt (§4).
- **Clean the data with a judge, then check the judge.** AWS uses Claude 3.5
  Sonnet as a data judge. The course (B5) adds the missing half: calibrate the
  judge against human labels before trusting it.
- **Use a system prompt plus XML-delimited semantic blocks.** AMBICODE already
  does this for untrusted evidence.
- **Few-shot examples help even a fine-tuned model**, most when data is small.
  For skills, this means one or two canonical input→output examples beat a
  longer list of rules (course A1, lever 3; skill-creator).
- **Tuning mostly buys format and concision** (−35% output tokens). Structured
  output (JSON schema) plus an example buys most of that with no training.
  AMBICODE's reviewer already uses `--json-schema`.

**Pushbacks.** Fine-tuning is right for the course capstone: a local reviewer
where the cloud is unavailable. It still needs an eval "before", an
open-weights teacher, and a frozen test that never touches training data.
None of that makes it a lever for the skills themselves.

## 3. Issue catalogue: problem, fix, pushback, AMBICODE status

Each row lists the evidence for the problem, the fix with the best evidence,
the honest counter-argument, and where AMBICODE is today. "F1…F8" refer to
the defects in [skill-walkthrough.md](skill-walkthrough.md) §9.

### A. Discovery and triggering

| # | Issue | Evidence | Fix | Pushback | AMBICODE |
|---|---|---|---|---|---|
| A1 | **Under-triggering.** The skill exists but is never invoked. | Vercel: the skill was not invoked in **56%** of cases, and the pass rate stayed at the 53% baseline. Spence: baseline activation was **50–55%** on Sonnet 4.5. | Write the description as what + when + the words users actually type, key use case first, because the listing cuts at **1,536 chars**. Make it "a little pushy" (skill-creator). Tune it with a trigger eval: 20 queries, 60/40 split, 3 runs each, up to 5 iterations, keeping the best *test* score. | Pushy descriptions raise false triggers. A forced-eval `UserPromptSubmit` hook reached **100%** activation but adds **~10.7 s** per prompt and tokens on every prompt. Its LLM-eval variant got **1/5** true negatives. | The trigger suite routes 7/8 cases; `url-bare` is diagnostic by design. On the real benchmark, `plugin-fired` on review cases swung from **0/24** (run 12-17) to **8/8** (run 14-01). Unstable, cause unmeasured. |
| A2 | **Sibling collision.** investigate, plan and task all claim "a URL" or "a change". | Course A1, self-check 6 names exactly this risk in AMBICODE. | One verb family per skill. Add negative cases with `min:0,max:0, arm: both`. Use `paths:` where scope is path-shaped. | Narrow verbs miss natural phrasings ("can you look at ORD-17 and fix it"). | Covered by the trigger suite for 4 URL verbs, 2 bare verbs and 1 unrelated question. Mixed-intent prompts are not covered. |
| A3 | **Listing budget overflow** drops descriptions. | The listing budget is 1% of the context window. Descriptions are dropped starting with the least-used skills (Claude Code docs). | Keep descriptions short. Mark user-only skills `disable-model-invocation`, which removes them from the listing entirely. | None. | Measured: always-on **~665 tok** (`claude plugin details`). That includes ~170 for init and rules, which are user-only and never reach the listing, so the real listing cost is ~495. The marketplace highlights ≥ 2,000. Fine. |
| A4 | **Loss after compaction.** | Invoked skill bodies are re-attached, keeping the first **5,000 tok** each and **25,000** in total, most recent first (docs). Tool results, including `Read`s of reference files, are cleared first. | Keep each body under ~4k tokens so it survives intact. Deliver anything critical through the body or through CLI output that is re-run, not through a one-time `Read`. | None. | Bodies are 1.4k–3.5k tok, so they survive. **But** the skills say "read `requirements-mcp.md` / `prepare-output.md` if you have not *this session*". After compaction the agent *has* read them this session but no longer holds their content. **Inferred from the docs, not reproduced.** |
| A5 | **Passive context beats on-demand retrieval for general knowledge.** | Vercel: an 8 KB AGENTS.md index scored **100%**; a skill scored 53%, or 79% with instructions. | Put facts every task needs in always-on context (CLAUDE.md or the SessionStart hook). Keep skills for vertical, user-triggered workflows. | Always-on text is paid in every session of every project. Vercel's case was API knowledge the model lacked; workflows are different. | AMBICODE already puts the operating contract in a SessionStart hook (~370 words). That is the right split. |

### B. Context cost

| # | Issue | Evidence | Fix | Pushback | AMBICODE |
|---|---|---|---|---|---|
| B1 | **Bodies that are too long.** | Spec and docs: a body under 500 lines and under ~5k tokens. SkillsBench: **1–3 modules per task +19.0 pp, 4+ modules +10.1 pp.** | Move rare branches into `references/`. Cap the modules one activity loads at 3. | Splitting too far turns one read into four, and SkillJuror found disclosure helps only when the resources are actionable. | Bodies are 632–1,530 words. One `task` run loads the body, `requirements-mcp.md` (818 w), `prepare-output.md` (831 w), the contract (370 w) and the prepare prompts. That is **5 modules**, above the 1–3 sweet spot. |
| B2 | **Tool output floods the context.** | Anthropic tool guidance: summary plus handle, then paginate. MCP caps output at 25k tok. Context rot (A1). | Return a bounded summary with ids, and a `show <id>` for details. Order fields by importance so a cut loses the least. | Truncation already cost AMBICODE the navigation block once (commit `10aea5e`). The fix must be *bounded by design*, not "please don't truncate". | `prepare` is capped at `maxContextBytes` **512 KiB**, around 130k tokens worst case, and the skill says "read it whole". The cap guards the process, not the agent's context. |
| B3 | **Extra tool round-trips.** | Anthropic advanced tool use: programmatic tool calling cut tokens **37%**. Tool examples raised accuracy from **72% to 90%**. | Collapse fixed sequences (config, then retrieve, then prepare, then git status) into one CLI call. | A single call hides the steps from the transcript, so it must print what it did. | Measured on the benchmark: localize **turns 11.9–16.4 with the plugin versus 7.5–11.7 without** (§5). |

### C. Instruction following and control

| # | Issue | Evidence | Fix | Pushback | AMBICODE |
|---|---|---|---|---|---|
| C1 | **Text-only prohibitions.** | Course B6: a system-prompt ban is "necessary but insufficient; the structural boundary matters". The docs say `allowed-tools` *grants* permissions and does not restrict them. | `PreToolUse` hook with `permissionDecision: deny` or exit 2. `disallowed-tools` while the skill is active. Narrow `allowed-tools`. | Every tool call spawns the hook, which adds latency. Needs a fast static matcher, and a false deny blocks legitimate work, so use `ask` rather than `deny` for grey cases. | **F8.** Counted: `task` has **19 "never" + 8 "do not"**, `plan` 15 + 8. None is enforced by a hook. `task` pre-grants `Edit(**)` and `Write(**)`. |
| C2 | **Steps in long procedures get skipped.** | Course B2: use a workflow (code-orchestrated) wherever the steps are known. | Put fixed steps in the CLI. A `Stop` hook checks the report shape and required artifacts, blocking once with a reason; `stop_hook_active` stops loops. | SkillsBench: **13 of 87 tasks got worse with skills**, from "rigid pipelines, displaced reasoning". Hard-code only what is truly invariant. | The helper grader (`prepare|locate` ran) matched **26/30** runs, then **1/30, 1/10, 2/10** in later runs while `plugin-fired` stayed at 28–30/30. **Corrected 2026-09-30 from the traces** (`evals/evals-core/results/traces/`): the grader is right. The agent really stopped calling `prepare`. The later runs used **Sonnet 5.5**; the first used **Opus 5.5**. The investigate body was byte-identical in all four runs. On Sonnet the procedure is skipped. See [skill-gap-plan.md](skill-gap-plan.md) §1. |
| C3 | **MUST/NEVER in capitals makes the model anchor or over-cautious.** | skill-creator: "explain why instead of heavy-handed MUSTs". Vercel: "You MUST invoke" read the docs first and **missed project context**; "explore first, then invoke" did better. | Give each rule its reason. Save bold for the 2–3 lines a skimmer must not miss. | Some rules really are absolute (never publish). Enforce those with hooks (C1), not typography. | Counted: plan has **71** bold markers (~35 spans), task 54, investigate 41. |
| C4 | **A gate with no release.** | CLAUDE.md "Making changes": a question with one answer is a defect. | Every gate ships with approve, decline and skip paths, each tested. | None. | **F1 (reproduced):** a selector decline is ignored. **F7:** rules wires packs in (step 7) before its confirmation gate (step 8). |
| C5 | **Model-authored procedural knowledge.** | SkillsBench: self-generated skills average **−1.3 pp**, and −8.1 to −11.5 pp on some configurations. Curated skills gain **+16.6 pp**. | Whatever the agent authors as durable guidance (policy packs, plans) must quote its source and pass human confirmation. | Confirmation fatigue. Batch it into one table with defaults. | `rules` authors packs from prose. It asks for `source.location` but not a verbatim quote, and nothing verifies it. |
| C6 | **Instructions inside data are obeyed.** | OWASP LLM01 / ASI01. | A structural boundary: the reader of untrusted content has no side-effecting tools. | None. | **Strong.** The reviewer gets `--tools Read,Grep,Glob`, safe mode and a snapshot. The contract marks UNTRUSTED EVIDENCE. |

### D. Evidence and output quality

| # | Issue | Evidence | Fix | Pushback | AMBICODE |
|---|---|---|---|---|---|
| D1 | **Self-reported evidence cannot be verified.** | Course B5: check with code wherever a failure can be formalized. | Generate evidence from the trace, not from the agent's memory. A Stop or SessionEnd hook reads `transcript_path` and writes the navigation line and the list of tools used. | Transcript format is not a documented API (course A1), so the parser needs a fixture test. | The `Navigation: LSP — …` line is self-reported. Nothing checks it (walkthrough, investigate worst path). |
| D2 | **Paraphrased requirement text.** | requirements-mcp.md already forbids it; only text enforces it. | Store `contentHash` and length of the retrieved text next to the MCP call id. A PostToolUse hook on the MCP read tool records the raw response hash, and the CLI compares it with the envelope. | Some MCP servers return rendered HTML, not raw text, so normalize before hashing. | Not detectable today (walkthrough R3). |
| D3 | **An empty result reads as "clean".** | The review skill's reporting rules. | The CLI prints the coverage statement itself. The agent quotes it; it does not compose it. | None. | Mostly done: the review output has four parts including "not covered". |
| D4 | **Reviewer precision.** | Claude Code Review: **<1%** of findings marked incorrect. The best independent precision is **76.2%** (§4). | Validate locations. Keep a human-selection step. **Record selected versus offered on publication.** That gives an in-production precision number for free. | Selection rate is biased: people skip correct but low-value findings. Report it as the "accepted rate", not precision. | Location validation is strict and all-or-nothing: one bad location voids the result. Selection on the view page is **not recorded** as a metric. |

### E. Safety and supply chain

| # | Issue | Evidence | Fix | Pushback | AMBICODE |
|---|---|---|---|---|---|
| E1 | **Risky skills in the wild.** | [Agent Skills in the Wild](https://arxiv.org/abs/2601.10338): **26.1%** of 31,132 skills have a risky pattern, **5.2%** high severity. Top issues: data exfiltration **13.3%**, privilege escalation **11.8%**. | Review skills like code. Grant minimal `allowed-tools`. No network in scripts. | None. | Low risk: no network, no credentials, MCP only through the agent. |
| E2 | **`allowed-tools` bypasses workspace trust.** | Docs: "Workspace trust doesn't gate this field … including in a `-p` run in a folder you've never trusted." | Grant only what the skill needs at the moment it needs it. | Too narrow means a permission prompt on every step. | `task` grants `Edit(**)` and `Write(**)` with no prompt in any repository. |
| E3 | **Irreversible actions without a human.** | OWASP LLM06 / course B6 §4. | Human in the loop for publishing, push and merge. | None. | **Strong.** Publication requires a human pressing Submit on the local page. |

### F. Measurement

| # | Issue | Evidence | Fix | Pushback | AMBICODE |
|---|---|---|---|---|---|
| F-1 | **A single run.** | B5: pass rate on 50 cases carries **±5–10 pp** of noise. | ≥3 runs. Report the mean and spread. Accept a change only when the difference exceeds the spread. | Cost scales linearly with runs. Use a smoke tag for iteration and the full set for decisions. `npm run evals` uses **`--runs 1`**. Two of the four 2026-09-29 runs had 3 runs per case; the other two had 1. |
| F-2 | **Δ is not gated.** | A4: `claude plugin eval` never fails on Δ. You must read `meanDelta` yourself. | Add an `eval-gate` script that fails on `partial` or on `meanDelta < 0` beyond the spread. | Noisy gates block good changes. Gate on a smoothed value over several runs. | No Δ gate. Measured Δ: **+0.007, −0.010, 0.000, −0.010** in the last four full runs. |
| F-3 | **Uncalibrated judge.** | B5: κ ≥ 0.6 is acceptable, ≥ 0.8 good. TPR and TNR ≥ 0.9 before a judge can gate. | Label 60+ items (≥20 failures) by hand. Split train/dev/test. Report κ. | Hours of manual labelling that cannot be delegated. | `names-a-true-file` is an LLM judge; its agreement with humans is not recorded. |
| F-4 | **Ceiling cases.** | A4: a case scoring 1.0 in both arms says nothing about the plugin. | Choose cases where the no-plugin arm fails. Grade continuous measures (F1, recall), not only pass/fail. | Hard cases are rarer and costlier to curate. | Localize cases score **1.0 in both arms** in the harness, while the F1 from `evals:score` differs by arm. The harness score hides the difference. |
| F-5 | **Cost is not in the verdict.** | A1 / B1: without a cost log, every comparison is guesswork. | Report cost and turns next to quality, and budget them. | None. | The score already emits cost and turns. They are simply not gated. |

## 4. Best measured numbers in the world (as of 2026-09-30)

These are the strongest published numbers I found for each question. None is
a universal record. Each was measured on a specific task set, so read each
row as "what has been shown possible", with its setup.

| Question | Best number | Setup and caveat | Source |
|---|---|---|---|
| How much can skills add? | **+16.6 pp** mean (33.9% → 50.5%); up to **+25.7 pp** in one configuration | 87 tasks, 18 model-harness configurations, deterministic verifiers. Software engineering gained only **+4.5 pp** in v1 (healthcare +51.9). v4 reports natural science +28.8, cybersecurity +18.9, maths +9.7. Numbers differ by paper version. | [SkillsBench, arXiv 2602.12670](https://arxiv.org/abs/2602.12670) |
| How many skills per task? | 1–3 modules **+19.0 pp** vs 4+ **+10.1 pp** | Same benchmark. | same |
| Do model-written skills work? | **−1.3 pp** mean; −8.1 to −11.5 pp on some configurations | Agents wrote their procedure before solving. | same |
| Does skill structure matter? | Progressive disclosure **+4.1%** of trials passed (17/410); resources used per trajectory 1.18 → 3.85 | 82 tasks. Helps when the resources guide implementation or repair, not when success hinges on an exact output format. | [SkillJuror, arXiv 2606.11543](https://arxiv.org/abs/2606.11543) |
| Passive context vs skill | AGENTS.md index **100%**; skill with instructions **79%**; skill alone **53%** = baseline | Next.js 16 APIs absent from training. 40 KB of docs compressed to 8 KB. | [Vercel, 2026-01-27](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) |
| Skill activation reliability | Forced-eval hook **100%** (Sonnet 4.5), baseline 50–55%. On 24 harder prompts: **75%** accuracy, 5/5 true negatives | ~250 invocations, $5.59 in total; +10.7 s per prompt. | [Spence, 2026-02-08](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals) |
| Description optimization method | 20 queries, 60/40 split, 3 runs per description, ≤5 iterations, best **test** score kept | A method, not a result. | [anthropics/skills skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) |
| Tool choice among many tools | Tool Search: Opus 4 **49 → 74%**, Opus 4.5 **79.5 → 88.1%**; **85%** fewer tokens | MCP evals. Tool-use examples: **72 → 90%** on complex parameters. Programmatic calling: **−37%** tokens. | [Anthropic, 2025-11-24](https://www.anthropic.com/engineering/advanced-tool-use) |
| Code-review product, in production | Substantive comments on PRs **16% → 54%**; **<1%** of findings marked incorrect; PRs >1,000 lines: 84% get findings (7.5 on average); <50 lines: 31% (0.5) | Anthropic's internal PRs. Vendor-reported. About 20 minutes and $15–25 per PR. | [InfoQ on Claude Code Review](https://www.infoq.com/news/2026/04/claude-code-review/) |
| Code-review, independent benchmark | **F1 60.8%**, precision **76.2%**, recall 50.6% (Greptile, #1). Next: 59.4 / 58.7 / 58.6 / 57.5 F1 | Martian Code Review Bench: 50 PRs from 5 OSS repositories, 136 human "golden comments", LLM judge. Rankings move between windows (CodeRabbit led Jan–Feb at 51.2 F1). | [Greptile summary](https://www.greptile.com/content-library/greptile-martian-code-review-benchmark), [CodeRabbit summary](https://www.coderabbit.ai/blog/coderabbit-tops-martian-code-review-benchmark) |
| Fine-tuned small vs large model | Haiku FT **91.2 F1** vs Sonnet 3.5 base 83.0 | TAT-QA. Only Claude 3 Haiku can be fine-tuned. | AWS (§2) |
| Plugin cost ceiling | Marketplace highlights always-on **≥ 2,000 tok**; description cap **1,536 chars**; listing budget **1%** of context; body **< 500 lines** | Platform limits, not results. | [Claude Code: measure](https://code.claude.com/docs/en/plugins/measure), [skills](https://code.claude.com/docs/en/skills) |
| Judge you can trust to gate | κ ≥ **0.8**, TPR and TNR ≥ **0.9** | A methodology threshold, not a record. | Course B5 (Hamel Husain's evals FAQ) |

## 5. Where AMBICODE stands today, measured

**Static cost** (`claude --plugin-dir . plugin details ambicode`, today):

```
Always-on:   ~665 tok
component    always-on  on-invoke
init               ~50      ~1.4k
plan              ~110      ~3.2k
investigate       ~120      ~2.3k
review            ~110      ~3.1k
task              ~150      ~3.5k
rules             ~120      ~3.3k
Hooks (5) … (harness-only — no model context cost)
```

The tool gets two things wrong. It overcounts: it includes init and rules
(~170 tok), which are user-only and never reach the listing, so the listing
really carries ~495. It undercounts: it scores hooks at zero, while the
SessionStart and UserPromptSubmit hooks inject the 370-word contract once
per epoch.

**Triggering** (`evals/evals-triggers/results/triggers-map-1.json`): 7 of 8
cases pass, score 0.925. The one failure, `url-bare`, is diagnostic by
design.

**Benefit versus the same agent without the plugin**
(`node evals/scripts/src/evals-bench.mjs score`, four curated-suite runs on
2026-09-29). **Corrected 2026-09-30:** the plugin was the same in all four runs
(0.3.4, identical investigate body in the traces). The **model** differed:
run 04-05 used `claude-opus-5-5`, and the other three used `claude-sonnet-5-5`.
The body measured here is not the one at HEAD.

```
run    arm                 P      R      F1     cost$  turns  fired helper
04-05  localize/with       0.685  0.674  0.634  0.539  16.41  29/30 26/30
       localize/without    0.687  0.704  0.650  0.409  11.66
12-17  localize/with       0.648  0.610  0.572  0.220  11.86  28/30  1/30
       localize/without    0.568  0.716  0.576  0.176   9.20
13-05  localize/with       0.613  0.647  0.601  0.239  14.40  10/10  1/10
       localize/without    0.513  0.726  0.569  0.171   8.30
14-01  localize/with       0.523  0.497  0.475  0.244  13.40   9/10  2/10
       localize/without    0.560  0.790  0.623  0.154   7.50

run    arm                 R(threads)  raised  cost$  turns  fired
04-05  review/with         0.145       0.375   0.665  18.45  24/24
       review/without      0.093       0.250   0.580  14.70
12-17  review/with         0.083       0.208   0.198   8.75   0/24
       review/without      0.083       0.208   0.191   8.58
13-05  review/with         0.093       0.250   0.223  10.25   0/8
       review/without      0.166       0.375   0.194   8.25
14-01  review/with         0.125       0.375   0.128   5.88   8/8
       review/without      0.093       0.250   0.234  10.12
harness meanDelta: +0.007, −0.010, 0.000, −0.010
```

**What these numbers say:**

- **Localization recall is lower with the plugin in 4 of 4 runs** (0.50–0.67
  against 0.70–0.79). F1 is lower in 3 of 4.
- **Localization costs 1.25–1.6× more and takes 1.3–1.8× more turns with the
  plugin**, in every run.
- **Review is a wash.** Thread recall is 0.08–0.15 with the plugin against
  0.08–0.17 without. The review skill fired in 0 of 24 and 0 of 8 runs in
  two of the four runs.
- Runs 04-05 and 12-17 have 3 runs per case (29–30 per arm); 13-05 and 14-01
  have 1 (8–10 per arm). By the
  course's standard (F-1), none of these differences is established. The
  direction is consistent for recall, cost and turns.

Set against §4: skills *can* add +16.6 pp on average, but only +4.5 pp in
software engineering. AMBICODE currently adds about 0 at a higher cost. That
is the gap Report 2 is designed to close.

## 6. What I did not do

- *Corrected 2026-09-30:* the traces were not gone. 586 of them are in
  `evals/evals-core/results/traces/`. They answer C2 (the agent skips `prepare`
  on Sonnet) and show that the model, not the plugin, changed between runs.
  See [skill-gap-plan.md](skill-gap-plan.md) §1.
- I did not reproduce A4 (reference files lost after compaction). It is an
  inference from the documented compaction behaviour.
- I read `stage-c.md` and `stage-d.md` at the heading and pitfall level only.
  They cover model internals and local serving, not skills.
- I did not re-run any eval. Every AMBICODE number above comes from result
  files already on disk, plus one `claude plugin details` call.

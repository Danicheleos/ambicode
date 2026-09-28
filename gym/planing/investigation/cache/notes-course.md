# Course digest: "Work with agents" (plan.md + course/00-glossary, stage-a..e)

Source: `archive/work-with-agents/` (651 KB, 7 files, Russian; facts dated 2026-09-27, Claude Code 2.1.272). All seven files read in full.
Citation form: `stage-a A1 (Рычаги)` = file stage-a.md, module A1, subsection "Рычаги". `A4 practice 7` = numbered step in that module's Практика. `A4 answers 9` = Ориентиры ответов item 9. `glossary "X"` = 00-glossary.md row.
Verified: the word "LSP" appears **zero** times in plan.md and course/*.md (`grep -i lsp` → no hits). Everything under 1(c) is the course's navigation/retrieval guidance applied to LSP by inference; inferences are marked.

Eval context this note is written against: localization F1 0.64 with plugin vs 0.65 naked; review recall 0.09 vs 0.25 naked; higher cost with plugin; skills navigate with Read/Grep/Glob; LSP tools almost never used.

Course map (what each part contributes to this note):
- plan.md — five stages A–E + capstone; open questions: teacher licence for the capstone, an OpenAI-compatible reviewer backend in ambicode.
- 00-glossary.md — 289 terms, one definition each; used here for exact definitions (actionable precision, progressive disclosure, arm, grader, κ).
- stage-a.md — A1 context budget of ambicode (levers, measurement, interventions); A2 portable SKILL.md and the adjudication skill; A3 MCP 2026-07-28 server (tool-output tiering); A4 `claude plugin eval` for ambicode (graders, arms, isolation, CI gate, error analysis).
- stage-b.md — B1 raw API (caching, cost function); B2 agent patterns (sectioning, orchestrator-workers, evaluator-optimizer, tool forcing); B3 Agent SDK triage agent + traces; B4 RAG vs long context vs agentic search with recall@K; B5 eval methodology (open/axial coding, binary criteria, judge calibration); B6 reliability checklist (reviewer boundary).
- stage-c.md — Python/PyTorch, transformer, inference memory; nothing on skills except the general "measure, then compare" discipline.
- stage-d.md — local models, serving, model/hardware decision; contributes measurement hygiene (fixed settings, 3 runs, binary criteria on own tasks).
- stage-e.md — LoRA/QLoRA/DPO/GRPO, data cards, regression evals; capstone = local review model for ambicode; contributes the reward shape, "correct empty" class, success criteria and path A/B for the reviewer.

---

## 0. Two harness facts measured today that change how the eval numbers read

```
$ grep -h "allowed_tools" evals/evals-core/cases/*/prompt.md | sort | uniq -c
  18 allowed_tools: [Read, Glob, Grep, Bash, Skill]
$ grep -rl "LSP\|mcp__" evals/evals-core/cases/*/graders/*.md | wc -l
0
$ sed -n 600p evals/scripts/src/evals-bench.mjs
  return ['plugin', 'eval', ROOT, '--eval-dir', evalDir, '--scaffold', '--allow-tools', 'Bash', '--no-publish', ...json, ...extra];
$ grep -c REVIEWER_REPLAY evals/scripts/src/evals-bench.mjs
0
```

- **No LSP tool exists inside the eval sandbox.** `claude plugin eval` loads nothing but your plugin (no other plugins, no MCP, no settings), and every evals-core case allows only `Read, Glob, Grep, Bash, Skill`. "LSP almost never used" in the eval is therefore a property of the harness, not evidence about the skills. stage-a A4 (Изоляция и что из этого следует).
- **The independent reviewer did not answer in the with-arm of sweep-1.** The archived README records that the nested `claude` is denied network without `WebFetch(domain:api.anthropic.com)` and that "no reviewer signs in inside the sandbox" even with it, so those suites replay recordings via `EVAL_AMBICODE_REVIEWER_REPLAY`. The committed `evals-bench.mjs` passes neither the grant nor the replay; `helper-ran.md` in evals-core says the same; and the **uncommitted working-tree diff** of `evals-bench.mjs` (plus new `evals-record-core.mjs`) adds exactly this wiring with the log line "reviewer replay: none (no recordings; the sandbox reviewer cannot sign in, so every `ambicode review` fails there)". `sweep-1.log` has no such line, so it ran on the committed version: every with-arm `ambicode review` failed. Recall 0.09 vs 0.25 compares naked Claude against a plugin whose reviewer never ran; it is a harness artefact until re-run with recordings. The course's rule: error analysis on transcripts before touching rubric or plugin; "helper crashed" is a named taxonomy category. stage-a A4 (Методология; practice 5); stage-b B5 (Шаг 1). `evals/evals-archived/typescript/README.md` lines 39–44, 233–243, 341–342; `git diff evals/scripts/src/evals-bench.mjs`.
- Review truth set: `raises-01.md` in `be-vs-5075-review-…` is a human comment that says "Not a real issue moreso just curious"; PASS requires the same concern. The reviewer role forbids reporting "preferences the project has not adopted". Under the course's adjudication rubric that comment is `correct-but-inert`; a recall metric over such items measures a different objective than the reviewer is instructed to optimise. stage-a A2 practice 1; glossary "Адъюдикация находок".

---

## 1. Concrete, checkable patterns and rules

### (a) Skill body and description design

- Every rule in a prompt is either checkable or superfluous ("produce a number before calling something slow"); the right altitude sits between an if-else tree and "be careful". stage-a A1 (Рычаги 1); glossary "Высота системного промпта".
- A few canonical, diverse **examples beat an enumeration of rules**; do not try to describe every edge case. stage-a A1 (Рычаги 3).
- Description = "what + when + keywords the user will actually say", 1–2 sentences. Bad: "Helps with reviews". stage-a A2 (Описание как контракт); A1 practice 5.
- Description is simultaneously the trigger and a permanent always-on cost: every extra word × every session × every project; every missing keyword = a skill that does not fire. stage-a A2 (Описание как контракт); A1 (Типичные ошибки).
- Test the description **two-sided**: positive case (natural phrasing fires it; grader `tool_used: Skill, min: 1`) and negative case (adjacent request does not; `min: 0, max: 0, arm: both`). stage-a A2 (Описание как контракт); A2 answers 7; A4 practice 7.
- After shortening a description, re-check firing with one cheap run (`--runs 1 --ablation none`, grader `plugin-fired`); if it fails, restore keywords. stage-a A1 practice 6.
- Spec limits: `name` 1–64 chars `[a-z0-9-]`, equals directory name; `description` 1–1024 chars; body guideline ≤500 lines, recommended <5 000 tokens; metadata ~100 tokens; file links relative to skill root, ≤1 level deep. stage-a A2 (Что фиксирует стандарт; Прогрессивное раскрытие в трёх агентах).
- Body content the spec recommends: step-by-step instruction, **input/output examples**, edge cases. stage-a A2 (Что фиксирует стандарт).
- A2's own worked skill is budgeted at **≤150 lines**: frontmatter, steps, one input→output example, two edge cases, rubric in `references/`, script in `scripts/`. stage-a A2 practice 1.
- Typical error: "a 2 000-word body where 300 words plus `references/` would do". stage-a A2 (Типичные ошибки). The course names ambicode `review` SKILL.md at 1 868 words as a split candidate. stage-a A1 practice 5.
- Skills invoked only manually (`init`, `rules`) must carry `disable-model-invocation: true`, otherwise their descriptions sit in context for nothing. stage-a A1 (Типичные ошибки); A1 practice 5.
- "One tool" rule applied to skills: if an engineer cannot say unambiguously which of `investigate`/`plan`/`task` applies, the model cannot either; broad overlapping descriptions let request wording decide. stage-a A1 answers 6.
- `allowed-tools` is not a safety mechanism (experimental, agent-specific names); a skill that is safe only because of it is non-portable by definition. stage-a A2 (Переносимое ядро и расширения).
- Portable skills do not depend on `$ARGUMENTS` / `${CLAUDE_SKILL_DIR}`; say "arguments are the text after the skill name"; scripts self-locate via `$(dirname "$0")`; "run scripts/x.sh" must say the path is relative to the skill dir while cwd is the project. stage-a A2 (Переносимое ядро; Типичные ошибки; answers 8).
- Two copies of one skill for two agents drift within a month; one canonical copy + symlink/generator + CI drift check. stage-a A2 (Типичные ошибки; practice 8).
- Workflow instructions do not belong in CLAUDE.md (always loaded); CLAUDE.md guideline ≤200 lines, specialised material goes to skills. stage-a A1 (Типичные ошибки).
- Instructions given early in a conversation are lost at `/compact`; durable rules live in CLAUDE.md, not in the conversation. stage-a A1 (Что делает /compact).
- Tool/skill descriptions should read "as for a new colleague": what it returns, when to use it, what to use instead. stage-a A1 (Материалы: Writing tools for agents); A3 practice 3.
- A tool description must answer "when to call", "what comes back", "what it does not do"; vague descriptions → wrong tool or wrong units. stage-b B2 (Типичные ошибки).
- Prompt (few-shot examples, format) is rung 1 of the ladder prompt → RAG/tools → tuning; each rung must be shown to fail, with a number, before the next. stage-e E1 (Лестница «когда тюнить»); E1 practice 8.
- Design a skill's system prompt so the stable part is byte-identical across sessions (no timestamps, no unsorted JSON) — it is a cache prefix. stage-b B1 (Prompt caching).

### (b) Tool-use guidance inside skills (making the agent pick tool X over tool Y)

- Minimal, **non-overlapping** tool set: "if an engineer cannot unambiguously name the tool for a situation, the agent cannot either". stage-a A1 (Рычаги 2).
- Economical tool responses: pagination, truncation, semantic identifiers instead of UUIDs; the stdout of `ambicode review` is a tool result that lands in context whole — measure its size. stage-a A1 (Рычаги 2); A3 (Ошибки проектирования: "raw JSON of 20 000 tokens instead of a summary and an id").
- ACI: most agent failures in practice come from vague tool descriptions and ambiguous parameters, not from the model. stage-b B1 (Цикл tool use); B2 answers 5.
- Third design principle: a carefully designed model–tool interface **with documentation and tests**. stage-b B2 (Workflows и агенты).
- The model never "calls" anything; it only selects among the definitions it sees. The lever is what is in the definition list and how it is described. stage-a A3 (Tool use, MCP и где между ними граница).
- Restrict rather than instruct: Agent SDK `tools: [...]` decides which built-ins exist in context at all; `disallowedTools` with a bare name removes a tool from context, a pattern rule only blocks matching calls. stage-b B3 (Что такое Agent SDK); B3 answers 3.
- Force rather than instruct: AI SDK `toolChoice: "required" | { type: "tool", toolName }`, `activeTools: [...]`, `prepareStep` to change the active tool set before a step. stage-b B2 (Vercel AI SDK 7). Inference: the Claude Code analogue is the skill's `allowed-tools`/`disallowed-tools` plus a `PreToolUse` hook, not a sentence in the body.
- A `PreToolUse` hook can rewrite a command (e.g. keep only FAIL lines of a test log) or, by extension, redirect a call. stage-a A1 (Типичные ошибки); glossary "Хук".
- State the sequence in the prompt and grade it: B3's triage prompt says "Use get_diff first. Read only what you need." and B5 adds a code check `readDiffBeforeAnswer` (tool call precedes the final answer in the trace). stage-b B3 practice 5; B5 practice 5.
- Process graders exist for exactly this: `tool_used` (with `input_match`, `min`/`max`) and `tool_order` (`before`/`after`); each case carries one result grader and one process grader. stage-a A4 (Грейдеры; Правила стабильного сигнала); A4 practice 7 (`tool_order: before Skill, after Bash 'ambicode review'`).
- To verify a build/test ran, ask in the prompt to write the result to a file and grade the file; grade the fact of running with `tool_used` + `input_match` on the command. stage-a A4 (Правила стабильного сигнала).
- Parallel tool calls: return all results in one `user` message, otherwise the model unlearns parallel calling. stage-b B1 (Цикл tool use); B1 answers 5.
- Tool errors return as `is_error` results, not exceptions, so the model can recover; validate `tool.input` with Zod before executing; paths are untrusted. stage-b B1 (Цикл tool use); B2 answers 8.
- ToolSearch: MCP tool schemas are deferred and loaded on demand; a single MCP result is cut at 25 000 tokens (`MAX_MCP_OUTPUT_TOKENS`). stage-a A3 (Tool use, MCP); A1 (Что лежит в контексте).
- Deterministic tool order and `ttlMs`/`cacheScope` on list results exist to keep the prompt cache; changing the tool set breaks the cache prefix. stage-a A3 (Что изменила ревизия, 8); stage-b B1 (Prompt caching).
- Least privilege is a principle, not a convenience: a triage/review agent gets `Read`, `Grep`, `Glob` and a diff tool, "no Bash and no Write". stage-b B3 (Типичные ошибки); B3 answers 8; B6 (Принципы 1).
- Forty tools instead of five is a design error; consolidate. stage-a A3 (Ошибки проектирования).

### (c) Code navigation, code intelligence, retrieval (LSP by inference — the course never names it)

- Three ways to give the model knowledge, chosen by numbers not ideology: long context + cache (<~200k tokens), RAG, agentic search. stage-b B4 (Три способа).
- **Agentic search** = `grep`/`glob`/`read` with the model searching itself, as Claude Code does; zero infrastructure, strong on code and structured docs with talkative names; **expensive and slow per query (several turns)**; quality depends on how "greppable" the corpus is. stage-b B4 (Три способа 3); glossary "Агентный поиск"; B4 answers 8.
- Just-in-time context: keep light identifiers (paths, ids) and pull content on demand; the price is that runtime exploration is slower than a ready index. The course names ambicode's code graph and boundary as this pattern. stage-a A1 (Рычаги 4); A1 answers 8; glossary "Just-in-time контекст".
- Lexical search beats embeddings on exact identifiers, error codes, function names; embeddings win on meaning; hybrid via RRF (`Σ 1/(60+rank)`) catches both. stage-b B4 (Гибридный поиск); glossary "BM25", "RRF".
- Contextual Retrieval: 50–100 tokens of context per chunk written with the whole document in view; failure rate (1 − recall@20) drops 35 % → 49 % → 67 % with embeddings → +BM25 → +reranker. stage-b B4 (Contextual Retrieval).
- Chunk by structure (headings, functions), ~800 tokens, keep metadata; top-K 20 beat 5 and 10. stage-b B4 (Retrieval-стек).
- Reranker needs 20–150 candidates; on 5 it has nothing to reorder. stage-b B4 (Реранкер; Типичные ошибки).
- **Retrieval is evaluated separately from generation**: recall@K on 40–60 hand-labelled question→chunk pairs is enough to see differences; half "semantic" questions, half exact-identifier questions, because that is where dense and hybrid diverge; expected order dense < hybrid < hybridCtx ≤ hybridCtxRerank, otherwise suspect `input_type` or index. stage-b B4 (Как измерять; practice 6).
- Compare approaches on the same questions with the same generation model, three runs each. stage-b B4 (Типичные ошибки; practice 7–8).
- Observe what the agent read that it did not need; record it as a behaviour observation per run. stage-b B3 practice 7.
- Failure taxonomy candidates for a code-reading agent: fabricated file paths; agent did not read the diff and answered from file names; too many turns on a trivial diff. stage-b B5 practice 3.
- Find where tokens go: rank the ten heaviest `tool_result`s in the transcript and name their source (helper stdout, file reads, test output). stage-a A1 (Как измерять; practice 4).
- A subagent has a clean window and returns only its final text; it re-loads CLAUDE.md, skills and MCP names and pays for its own requests; nesting ≤3; background subagents get a reduced tool set; `context: fork` inherits the parent conversation. stage-a A1 (Рычаги 5); A1 answers 4; glossary "Fork".
- Orchestrator-workers when the sub-tasks are not known in advance (e.g. which areas to read depends on the ticket); cap the number of workers and check each returned what was asked. stage-b B2 (Orchestrator-workers; Типичные ошибки; practice 5).
- Inference for LSP: the course's applicable levers are (1) make the LSP tool the only or the forced tool for the navigation step (b), (2) grade its use with `tool_used`/`tool_order` (b), (3) measure recall of the navigation step on its own (c), (4) give an example navigation trace instead of a rule (a), (5) make sure the eval harness can even see the tool (section 0).

### (d) Review-skill design

- Reviewer isolation is the structural "data ≠ instructions" boundary: the component that reads untrusted content has no side-effect tools; another component acts on a validated result. ambicode's snapshot + `Read/Grep/Glob`-only reviewer is cited as the correct shape. stage-b B6 (Принципы 2); B6 answers 7.
- Never give the reviewer Bash "to run tests": it becomes an executor of arbitrary commands from the repository. stage-b B6 (Типичные ошибки).
- Adjudication rubric: label each finding `actionable` / `correct-but-inert` / `unfounded` / `unverifiable`; two findings on one defect count once; **actionable precision = actionable / (offered − unverifiable)**. glossary "Actionable precision", "Адъюдикация находок"; stage-a A2 practice 1.
- Rubric edge cases: a non-existent path in a finding → `unfounded`; on a clean change any `actionable` label needs a second checker. stage-a A2 practice 1.
- Negative Δ on `clean-ts` is the "typical first result": the plugin finds defects in a clean change. stage-a A4 practice 4.
- E02 acceptance for `correctness-ts`: skill invoked; `ambicode review` ran from `repo/` with exit 0; agent cites review id and check statuses instead of retelling the diff; `result.json` exists with reviewer restricted to `Read,Grep,Glob`. stage-a A4 practice 3.
- Triage/review agent budget: `maxTurns: 15`, `maxBudgetUsd: 0.5`, diff capped at 60 000 chars with a truncation marker, `execFile` not `exec`. stage-b B3 practice 4–5.
- Prompt shape for a reading agent: "Use get_diff first. Read only what you need. Finish with a json block matching the schema." stage-b B3 practice 5.
- Code checks a review/triage output must pass: schema valid; every path in `touched_files` equals a path from `git diff --name-only`; `needs_tests` rule; diff read before answer; turns ≤ N for diffs < 200 lines; summary length. stage-b B5 practice 5; B5 answers 5.
- One LLM judge per failure category, binary verdict, `{ reasoning, pass }`, 2–4 labelled examples, judge model ≠ app model; give the judge the gold answer when one exists. stage-b B5 (Шаг 4).
- Parallel sectioning for review: the same diff examined by three independent calls with different instructions (security, performance, style), merged by code, not by another model call. stage-b B2 practice 4; B2 (Типичные ошибки).
- Evaluator-optimizer needs binary criteria and `maxIterations`; "make it better" never converges. stage-b B2 (Типичные ошибки).
- What a review model must do: findings only inside diff ranges; empty list on a clean change; ≤7 findings; `coverageNotes` for what it did not see; no requirement findings without requirement evidence. stage-e Capstone (Что модель должна уметь).
- Capstone success criteria fixed before training: ≥98 % pass the validator; ≤10 % false positives on `clean`; ≥60 % hit on `correctness` within ±3 lines (8B); A4 `clean-*` and `correctness-*` not worse than cloud over 3 runs. stage-e Capstone (Критерии успеха).
- Per-finding manual labels: (1) defect real, (2) location correct ±3 lines, (3) comment postable without editing; a finding is accepted only if all three; an answer is accepted if all findings accepted **and no known defect missed**. stage-e Capstone (Разметка).
- Reward shape mirrors the validator: −1 for any invalid location because the validator drops the whole answer; the course notes this teaches "fewer findings, but valid". stage-e E4 (GRPO); Capstone answers 5.
- Reward-hacking warning that applies to review policy: if clean diffs dominate, "always empty" earns positive reward; balance classes and **penalise the miss**; "false positive costs more than a miss — only if ambicode is configured so; verify against A4 priorities". stage-e E4 (GRPO; Взлом награды).
- Training data must contain a "correct empty" class at 20–25 %, otherwise the model learns a finding always exists — and symmetrically a set of only clean examples teaches silence. stage-e E3 (Данные важнее гиперпараметров; answers 8).
- Audit the teacher: 50–100 outputs read by hand; if the teacher is wrong in 15 % the student learns the 15 %. stage-e E3 (Качество ответов).
- A small model gets "prompt + diff → JSON" (path B), not an agentic tool loop; `result.json` must name the backend and model so with/without reports do not mix reviewers. stage-e Capstone (Что именно заменяется).
- Human-in-the-loop only for irreversible or external actions (push, merge, delete, post); reversible edits in a worktree can be automated. stage-b B6 (Принципы 4); B6 answers 3.

### (e) Eval methodology and error analysis

- Observability answers "what happened"; an eval answers "did it get better" and needs four things: fixed cases, automatic checks, a baseline, repetition. stage-a A4 (Что такое eval плагина).
- Scoring: run score = weighted share of passing graders; case score = mean over runs (default 3); pass if ≥ `--threshold` (default 1.0 — set it from the observed distribution, e.g. median minus one run). stage-a A4 (Что такое eval; practice 10; Типичные ошибки).
- Two arms `WITH`/`W/OUT`; Δ is the only honest answer to "did the plugin help"; a case at 1.0 in both arms says nothing about the plugin. stage-a A4 (Что такое eval).
- Graders excluded from scoring in two-arm mode (shown as indicators): `tool_used` with `tool: Skill`, plugin-server `mock_calls`, anything `arm: with-only`; `arm: both` puts a grader back. ambicode's `plugin-fired`, `helper-ran`, `helper-output-used` are correctly `with-only`. stage-a A4 (Две руки и исключённые грейдеры).
- Case fields: `runs` 1–50, `max_turns` default 10 (up to 200; exceeding it is a run error), `timeout_seconds` 300 (≤3600), `allowed_tools`, `append_system_prompt`, `env` only `EVAL_*`, `plugins`; unknown key = error; `@path` not expanded. stage-a A4 (Анатомия набора).
- Grader types and options: `regex` (`pattern`, `flags`, `match: not_contains|count:N`, `target`), `tool_used` (`tool`, `input_match`, `min`, `max`), `tool_order` (`before`, `after`), `file_exists` (only files **created** in the run), `llm` (2-of-3 votes, small judge by default, `--judge-model sonnet` for subtle rubrics), `baseline`; targets `last_message` | `trace` (first and last 12 messages; quotes escaped) | `files` (paths only) | `{source: file, path}` | `mock_calls`; `weight`, `arm` common. stage-a A4 (Грейдеры).
- Stable-signal rules: long output → `regex` on a file; `llm` only on short text; one result grader + one process grader per case; `Δ ≈ 0` with `tool_used: Skill` failing is a finding about `description`, not the tool. stage-a A4 (Правила стабильного сигнала; Типичные ошибки).
- **If `tool_used: Skill` passed and Δ is negative, suspect the judge before the plugin**: rerun with `--judge-model sonnet`, tighten the rubric, then look at the plugin. stage-a A4 answers 9.
- Error analysis precedes grader edits: read failed transcripts (`report.html` shows judge votes and the fragment it saw; `--keep-temp` keeps the sandbox), build a taxonomy (wrong cwd, helper crashed, judge tripped on format, real miss, false finding), then fix rubrics/weights first and the plugin second. stage-a A4 (Методология; practice 5).
- Calibrate the judge against manual labels on 10–20 findings using the adjudication rubric; report agreement and the list of disagreements. stage-a A4 practice 6.
- Isolation facts: fresh temp HOME, no personal settings/hooks/CLAUDE.md/MCP/plugins; only `EVAL_*` env; read-only tools by default, `Bash` only with `--allow-tools` under an OS sandbox (macOS has a backend; Linux needs `bubblewrap` + `socat`; no backend → the run refuses); `scaffold_script` runs as you; `evals/` hidden from the agent; git hooks and credential helpers disabled. stage-a A4 (Изоляция).
- What an eval cannot tell you: whether the plugin is safe (hooks and real servers run outside the sandbox) and what the answer cost (read tokens from the run record). stage-a A4 (Методология).
- Cost model ≈ cases × runs × 2 arms + 3 judge calls per `llm` grader per run; ambicode 19 × 3 × 2 = 114 runs of ≤30 turns; iterate with `--case`, `--tag`, `--runs 1 --ablation none`, `--max-cost-usd` (exit 2 when hit), `-j ≤ 8`. stage-a A4 (Изоляция).
- CI gate: pin `--model` and `--judge-model` (a model release otherwise reads as plugin regression); Δ never affects the exit code — gate on `aggregates.meanDelta` and `partial` with your own script; exit codes 0/1/2/130/143; `CI=true` needs `--trust-plugin`; exclude partial runs from trends. stage-a A4 (Гейт в CI; practice 9).
- Typical grader mistakes: `(?i)` in regex; `target: files` instead of file content; `file_exists` on a scaffolded file; `@path` in prompt; `llm` on long text; `max_turns` too low; `Agent type '<plugin>:<agent>' not found` in the without-arm is expected. stage-a A4 (Типичные ошибки).
- Non-determinism: one run proves nothing; ≥3 runs, compare medians (cost, turns, duration) under identical prompt, directory, tool set. stage-a A1 (Как измерять); A1 answers 7.
- B5 cycle: error analysis → taxonomy → binary criteria → code checks where formalisable → calibrated LLM judge → repeated runs + regression gate. The most expensive step is reading traces by hand; it is also the one most often skipped. stage-b B5 (Почему «посмотрел — вроде нормально» не работает).
- Sample ~100 real traces; if none exist, generate inputs along dimensions (diff size, change type, tests present, language, traps like renames) but never let the model generate expected answers. stage-b B5 (Шаг 1).
- Open coding: read the whole trace, note the **first** serious failure in free text; first 30 traces strictly by hand; stop at saturation (60–100; "15 traces in a row with no new type"). Axial coding: 5–10 categories, each with a one-sentence definition, 2–3 example ids, count, severity 1–3. One arbiter. Work the 3–5 most frequent/dangerous categories. stage-b B5 (Шаг 1; practice 2–3).
- Binary criteria only; 1–5 scales are subjective at boundaries and average to nothing. A good criterion: one failure category, one observable property, two people give the same answer, explicit rule plus a pass and a fail example. If a failure cannot be made binary, the category is ill-defined — go back to step 1. stage-b B5 (Шаг 2).
- Code checks first: schema, enum, substring presence/absence, path ∈ diff, length, counts, tool-call order, cost and turns under threshold; after good error analysis half or more of categories close with code. Compare code-check pass rates with manual labels; disagreements mean the rule or the label is wrong. stage-b B5 (Шаг 3; practice 5).
- Judge calibration: 100–200 labels per category (minimum 60 with ≥20 failures); split train 10–20 % / dev 40–45 % / test 40–45 % with a fixed seed; confusion matrix → TPR, TNR, agreement, Cohen's κ; κ ≥ 0.6 acceptable, ≥ 0.8 good; TPR and TNR ≥ 0.9 before the judge can gate a regression; ≤4–5 prompt iterations on dev; one final test measurement. stage-b B5 (Шаг 4; practice 6–7).
- κ example: 90 % pass data + judge that always says pass = 90 % agreement, κ = 0. stage-b B5 (Шаг 4); B5 answers 7.
- Judge biases: length preference, position bias in pairwise, self-preference → single binary verdicts, different model. stage-b B5 (Шаг 4); glossary "Смещения LLM-судьи".
- Noise: pass-rate on 50 cases moves ±5–10 points run to run; accept a change only when the difference exceeds the spread; keep an iteration set and a held-out set. stage-b B5 (Шаг 5).
- Judge instability itself is a metric: share of traces whose verdict flips across three judge runs. stage-b B5 practice 7.
- Before/after experiment: one prompt change, 3 runs before, 3 after on the iteration set, one final run on hold-out; report means and min–max per criterion; decide and record. stage-b B5 practice 9–10.
- `llm-rubric` (promptfoo) is a convenience wrapper, not a calibrated judge; use the calibrated prompt as the rubric text and compute agreement separately. stage-b B5 answers 10.
- Two kinds of eval for a tuned model: task eval (the only justification for tuning) and regression eval (did it break elsewhere); 1–2 points at `--limit 200` is noise, 5+ is a regression. stage-e E5 (Два вида оценки).
- Change one axis at a time to attribute effects (tuning vs quantisation vs integration path). stage-e Capstone answers 7.
- Eval "before" first; without it "better" cannot be told from "different". stage-e E1 (Типичные ошибки).
- If the base already meets the criteria, tuning is not needed and that is a publishable result. stage-e Capstone answers 4.
- Freeze the test set before training; never use it even to pick a checkpoint; check n-gram overlap between train and eval fixtures. stage-e E3 (Дедупликация и утечка); Capstone (Данные и разбиение; answers 3).
- Fix quant, engine, context, thinking mode, `temperature=0`, 3 runs; record background load and run order (thermal throttling). stage-d D1 (Типичные ошибки; answers 7).
- Judge not needed when the set is small: 5 tasks × 3 models × 3 runs = 45 answers read in an hour. stage-d D1 practice 6.
- Report "what I decided not to change and why" as a required section. stage-a A1 practice 8; A1 (Критерии готовности).

### (f) Progressive disclosure and references

- Three levels: metadata (~100 tokens per skill, all skills at start) → body (≤5 000 tokens, at activation) → `references/`, `scripts/`, `assets/` on demand. glossary "Прогрессивное раскрытие"; stage-a A2 (Прогрессивное раскрытие в трёх агентах).
- After `/compact` invoked skill bodies are re-injected up to 5 000 tokens per skill, 25 000 total; the **description list is not restored** — only already-invoked skills remain, so the model may forget uninvoked plugin skills exist. stage-a A1 (Что делает /compact); A1 answers 3.
- Move rarely needed SKILL.md sections to `references/`. stage-a A1 practice 5.
- References ≤1 level deep, relative to skill root, never absolute. stage-a A2 (Что фиксирует стандарт; Типичные ошибки).
- Tool-output disclosure in three tiers: `list_reviews` cards (id, target, count, date; paginated) → `get_review` summary + finding list without text → `get_finding` full text; card length capped; `review` stdout should be a summary plus a bundle path, details read on demand. stage-a A3 practice (intro, step 2); A3 (Критерии готовности); A1 practice 5.
- Handles (review id, cursor) carry state between calls instead of sessions. stage-a A3 (Что изменила ревизия, 2); glossary "Handle".
- Hooks: only `hookSpecificOutput.additionalContext` reaches the model; stdout at exit 0 goes to the debug log; the operating contract is delivered once per context epoch (session start, first prompt after compaction) — verify it is re-delivered exactly once. stage-a A1 (Что лежит в контексте; practice 2).
- Long tasks: structured notes outside context (`.ambicode/reviews/<id>/result.json` is named as an example; subagent `memory:` field). stage-a A1 (Рычаги 5).
- Gemini CLI asks the user to confirm activation and then injects body + folder structure; Claude Code injects body only, no confirmation. Write the body assuming either. stage-a A2 (Прогрессивное раскрытие в трёх агентах).

### (g) Context and cost

- Context is working memory with diminishing returns (n² attention pairs); "every added token must pay for itself". stage-a A1 (Бюджет внимания); glossary "Context rot".
- Load order before the first user word: system prompt (~4 200 tokens), MEMORY.md (first 200 lines / 25 KB), env + git status, MCP tool **names** only, skill `name`+`description`+`when_to_use` for every enabled plugin, CLAUDE.md at all levels, hook `additionalContext`. stage-a A1 (Что лежит в контексте).
- Always-on = names + descriptions of skills, agents, commands, paid in every session by every user; on-invoke = bodies. `claude plugin details <name>` prints both; hooks and MCP are not scored — see them via `/context` with and without the plugin. stage-a A1 (Что лежит в контексте; Как измерять); A1 answers 2.
- The course's estimate for ambicode: six skills at 60–100 words ≈ 1 000 always-on tokens, plus a 370-word contract via hook once per epoch (2.3 KiB per call). stage-a A1 (Что лежит в контексте; practice 2).
- Every turn resends the whole conversation and every tool call is another turn; total input grows quadratically with turns. stage-a A1 (Бюджет внимания); stage-b B1 answers 1.
- Cache = prefix match in order `tools → system → messages`; any byte change invalidates everything after it; changing or reordering tools invalidates system prompt and messages too. Min cacheable prefix 512 (Opus 5) / 1 024 (Sonnet 5) / 4 096 (Haiku 4.5); write 1.25× (5 min) or 2.0× (1 h), read 0.1×; TTL 1 h on subscription, 5 min on API key. `/usage` shows `Prompt cache (main)` share and miss reason (`tool definitions changed`). stage-a A1 (Бюджет внимания); stage-b B1 (Prompt caching); B1 answers 2–3.
- Silent cache invalidators: `Date.now()` in system prompt, unsorted JSON, changing tool set, changing tool order, model switch. stage-b B1 (Prompt caching; answers 3).
- Design rule: stable content first (frozen system prompt, deterministic tool list, big document), variable content after the last cache point. stage-b B1 (Prompt caching).
- Verbose tool output is a typical error: a 1 200-token test log where five `FAIL` lines suffice. stage-a A1 (Типичные ошибки).
- Subagent returns only the final text plus a short trailer (tokens, duration); returning the transcript is an error. stage-a A1 (Рычаги 5; Типичные ошибки).
- Measurement layers: static (`claude plugin details`, `/context` ± plugin), dynamic (`claude -p … --output-format json` → `total_cost_usd`, `usage`, `num_turns`, `duration_ms`; transcript `~/.claude/projects/<proj>/<session>.jsonl`), quality (binary manual check, 3 runs). Never `--bare` (drops OAuth); use a clean dir without CLAUDE.md. stage-a A1 (Как измерять; practice 3).
- Each intervention is a separate commit with the "before" number in the message. stage-a A1 practice 5.
- Agent SDK / Claude Code input is almost all cache reads; "tokens" without the cache split say nothing. stage-b B3 (Типичные ошибки).
- Always set `maxTurns` and `maxBudgetUsd` (or `isStepCount`): one looped run costs a week of experiments. stage-b B3 (Типичные ошибки); B6 (Принципы 6).
- Cost function: `input × p_in + cache_write × p_in × 1.25 + cache_read × p_in × 0.1 + output × p_out`; log every call with cost, latency (TTFT and total), `stop_reason`; report p50/p95 and cache share per command and model. stage-b B1 (Стоимость и задержка; practice 3, 8).
- Agent vs workflow: 5–20× per-run cost difference; start with the simplest thing that measurably works. stage-b B2 (Workflows и агенты; Типичные ошибки).
- Corpus < ~200k tokens → whole thing in the prompt with a 1 h cache, no RAG; agentic search is the most expensive per query. stage-b B4 (Три способа).
- Batch API: 50 % off, results unordered (match by `custom_id`); good for evals and offline runs. stage-b B1 (Batch API).
- MCP tool result cap 25 000 tokens. stage-a A3 (Tool use, MCP).
- Prefix caching on the server side (vLLM/SGLang RadixAttention) is the TTFT lever for agents with long system prompts — same principle as API caching. stage-d D2 (Почему сервер — это другая задача).

---

## 2. External links cited by the course, grouped

### Context engineering, skills, plugins (Anthropic / Claude Code docs)
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — source of the attention-budget model and the five levers (A1).
- https://www.anthropic.com/engineering/writing-tools-for-agents — tool consolidation, economical responses, descriptions "as for a new colleague" (A1, A3).
- https://www.anthropic.com/engineering/building-effective-agents — workflow patterns vs agents, three design principles (B2, B6).
- https://code.claude.com/docs/en/context-window — interactive simulation of what loads when (A1).
- https://code.claude.com/docs/en/plugins/measure — `claude plugin details`, always-on vs on-invoke, `/skill-doctor` (A1, A4).
- https://code.claude.com/docs/en/costs — `/usage`, cache statistics, cost levers (A1).
- https://code.claude.com/docs/en/sub-agents — what a subagent receives, tool filters, nesting depth (A1).
- https://code.claude.com/docs/en/skills — discovery paths, all Claude Code frontmatter fields, `disable-model-invocation`, post-compact budgets, `context: fork` (A1, A2, A4).
- https://code.claude.com/docs/en/headless — `claude -p` JSON fields, `--plugin-dir`, `--bare` (A1, A4).
- https://code.claude.com/docs/en/plugin-evals — case format, graders, two arms, isolation, CI, JSON output (A4, B5, Capstone).
- https://code.claude.com/docs/en/sandboxing — Linux sandbox backend requirements (A4).
- https://code.claude.com/docs/en/mcp — `claude mcp add`, `.mcp.json`, `MCP_PROTOCOL_NEGOTIATION`, tool naming (A3).
- https://code.claude.com/docs/en/monitoring-usage — `CLAUDE_CODE_ENABLE_TELEMETRY`, OTel metrics, beta traces (B3).
- https://code.claude.com/docs/en/llm-gateway and https://code.claude.com/docs/en/llm-gateway-connect — `ANTHROPIC_BASE_URL` for routing Claude Code to another server (Capstone path A).

### Agent Skills standard and other agents
- https://agentskills.io/ and https://agentskills.io/specification — SKILL.md fields, limits, directories, progressive disclosure, supporting clients (A2).
- https://github.com/agentskills/agentskills/tree/main/skills-ref — reference validator: `validate`, `read-properties`, `to-prompt` (A2).
- https://geminicli.com/docs/cli/skills/ and https://geminicli.com/docs/get-started/installation/ — Gemini CLI skill paths, `/skills link`, `activate_skill` (A2).
- https://learn.chatgpt.com/docs/build-skills — Codex `.agents/skills`, `$skill-name`, `agents/openai.yaml` (A2).

### MCP specification and SDK
- https://modelcontextprotocol.io/specification/2026-07-28 (+ `/changelog`, `/basic/transports/streamable-http`, `/basic/authorization`, `/basic/authorization/authorization-server-discovery`, `/basic/authorization/client-registration`) — stateless protocol, headers, MRTR, OAuth 2.1, PRM, CIMD (A3).
- https://ts.sdk.modelcontextprotocol.io/v2/ — SDK v2 tutorial: server, HTTP, Express, auth, in-memory testing (A3).

### Claude API and SDKs
- https://platform.claude.com/docs/en/ — pricing and model ids to verify before coding (B intro).
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs — JSON output, schema limits, `zodOutputFormat` (B1).
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching — prices, minimum lengths, `usage` fields, 1 h TTL (B1, B4).
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview — tool loop, parallel calls, `is_error` (B1; URL marked unverified).
- https://platform.claude.com/docs/en/build-with-claude/batch-processing — batch limits and statuses (B1; URL marked unverified).
- https://platform.claude.com/docs/en/build-with-claude/embeddings — Voyage models, `input_type`, rerankers (B4).
- https://github.com/anthropics/anthropic-sdk-typescript — types, tool runner, examples (B1).
- https://code.claude.com/docs/en/agent-sdk/overview, https://code.claude.com/docs/en/agent-sdk/typescript, https://code.claude.com/docs/en/agent-sdk/custom-tools — `query`, `Options`, `tools`/`allowedTools`/`disallowedTools`, `canUseTool`, `maxBudgetUsd`, in-process MCP tools (B3, B6).
- https://www.anthropic.com/legal/aup — "Do Not Abuse our Platform": no training on Claude outputs without authorisation (E3, Capstone).

### Agent frameworks
- https://ai-sdk.dev/docs/foundations/agents — `ToolLoopAgent`, loop control (B2).
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling — `tool()`, `stopWhen`, `prepareStep`, tool approval (B2).
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data — `Output.object` (B2).
- https://ai-sdk.dev/providers/ai-sdk-providers/anthropic — `providerOptions`, cache, thinking (B2).
- https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 — v7 renames (B2).
- https://mastra.ai/blog/announcing-mastra-1 — alternative framework to look at after B2.

### Observability
- https://langfuse.com/docs/observability/sdk/typescript/setup and https://langfuse.com/docs/observability/sdk/typescript/instrumentation — packages, `NodeSDK`, `startActiveObservation`, `observe`, flush (B3).
- https://langfuse.com/docs/evaluation/evaluation-methods/custom-scores — `score.create`; storing human and judge verdicts beside traces (B3, B5).
- https://langfuse.com/integrations/frameworks/vercel-ai-sdk — auto-tracing for AI SDK (B3).
- https://github.com/open-telemetry/semantic-conventions-genai — GenAI span/attribute names, status Development (B3).

### Evals methodology and tools
- https://hamel.dev/blog/posts/evals-faq/ — error analysis, binary criteria, judge calibration, sample sizes (B5).
- https://hamel.dev/blog/posts/evals-faq/why-is-error-analysis-so-important-in-llm-evals-and-how-is-it-performed.html — open/axial coding step by step (B5).
- https://github.com/chiphuyen/aie-book — "AI Engineering" chapter notes; ch. 3–4 on evaluation (B5, E5).
- https://www.promptfoo.dev/docs/configuration/guide/, https://www.promptfoo.dev/docs/configuration/expected-outputs/, https://www.promptfoo.dev/docs/usage/command-line/ — config, assertions (`javascript`, `llm-rubric`, `assert-set`), `--repeat`, `--filter-failing` (B5).
- https://deepeval.com/blog/introducing-deepeval-typescript — alternative eval tool (B5).
- https://github.com/EleutherAI/lm-evaluation-harness — regression benchmarks, backends `hf`/`local-completions`/`gguf` (E5).

### Retrieval
- https://www.anthropic.com/news/contextual-retrieval — method, numbers, prompt, 200k-token rule (B4).
- https://github.com/voyage-ai/typescript-sdk — `embed`, `rerank` (B4).
- https://github.com/pgvector/pgvector and https://github.com/pgvector/pgvector-node — vector type, HNSW, hybrid search, Node bindings (B4).

### Security
- https://genai.owasp.org/llm-top-10/ — OWASP LLM Top 10 2025 (B6).
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ — ASI01–ASI10 (B6).

### ML foundations (stage C)
- https://karpathy.ai/zero-to-hero.html, https://github.com/karpathy/nn-zero-to-hero, https://github.com/karpathy/micrograd, https://github.com/karpathy/makemore, https://github.com/karpathy/ng-video-lecture, https://github.com/karpathy/minbpe, https://github.com/karpathy/nanoGPT, https://github.com/karpathy/nanochat — lectures and reference code (C1, C2, C4).
- https://www.youtube.com/watch?v=kCc8FmEb1nY and https://www.youtube.com/watch?v=zduSFxRajkE — "Let's build GPT", "Let's build the GPT Tokenizer" (C2).
- https://www.3blue1brown.com/lessons/gpt, https://www.3blue1brown.com/lessons/attention, https://www.3blue1brown.com/lessons/mlp — visual intuition (C2).
- https://docs.astral.sh/uv/guides/projects/ — uv project commands (C1).
- https://docs.pytorch.org/docs/2.14/notes/mps.html and https://docs.pytorch.org/docs/2.14/mps.html — MPS backend, memory functions (C1, C3).
- https://peps.python.org/pep-0695/ — `type` syntax (C1).
- https://www.manning.com/books/build-a-reasoning-model-from-scratch and https://github.com/rasbt/reasoning-from-scratch — Raschka alternative path (C4).
- https://huggingface.co/learn — HF smol course (C4).

### Local inference and serving (stage D)
- https://github.com/ggml-org/llama.cpp (+ `tools/quantize/README.md`, `tools/server/README.md`) — engine, `llama-bench`, quant table, server flags, Anthropic-compatible endpoint (C3, D1, E5, Capstone).
- https://github.com/ml-explore/mlx-lm (+ `mlx_lm/LORA.md`) and https://ml-explore.github.io/mlx/build/html/python/metal.html — MLX CLI, LoRA flags, memory API (C3, D1, E1, E5).
- https://lmstudio.ai/docs/cli and https://lmstudio.ai/docs/developer/openai-compat — `lms`, local OpenAI-compatible server (D1).
- https://docs.vllm.ai/en/latest/features/speculative_decoding/, https://docs.vllm.ai/en/latest/cli/bench/serve.html, https://docs.vllm.ai/en/latest/features/quantization/llm_compressor/fp8/, https://docs.vllm.ai/en/latest/features/quantization/auto_awq/ — vLLM speculative config, benchmark, FP8, AWQ (D2).
- https://docs.sglang.io/advanced_features/speculative_decoding.html — SGLang speculative decoding (D2).
- https://github.com/runpod/runpodctl and https://docs.vast.ai/cli/commands — GPU rental CLIs (D2).
- https://huggingface.co/blog/gemma4, https://unsloth.ai/docs/models/gemma-4, https://unsloth.ai/docs/models/qwen3.6, https://huggingface.co/openai/gpt-oss-20b, https://openai.com/index/introducing-gpt-oss/, https://mistral.ai/news/devstral-2-vibe-cli/, https://huggingface.co/Qwen/Qwen3.8-27B, https://huggingface.co/Qwen/Qwen3.6-27B, https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B, https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro, https://huggingface.co/zai-org/GLM-5.2 — model cards, sizes, licences (D1, D3).
- https://huggingface.co/Qwen/Qwen3-8B/raw/main/config.json and https://huggingface.co/Qwen/Qwen3-8B-GGUF — numbers for the memory calculator (C3).
- https://huggingface.co/blog/ggml-org/anthropic-messages-api-in-llamacpp — `/v1/messages` in `llama-server` (Capstone).

### Fine-tuning (stage E)
- https://arxiv.org/abs/2106.09685 (LoRA), https://arxiv.org/abs/2305.14314 (QLoRA), https://arxiv.org/abs/2305.18290 (DPO), https://arxiv.org/abs/2402.03300 (DeepSeekMath/GRPO), https://arxiv.org/abs/2501.12948 (DeepSeek-R1) — primary papers (E1, E2, E4).
- https://unsloth.ai/docs/get-started/fine-tuning-llms-guide, https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide, https://unsloth.ai/docs/basics/inference-and-deployment/saving-to-gguf.md — Unsloth guides (E1, E2, E5).
- https://huggingface.co/docs/peft/main/en/package_reference/lora — `LoraConfig` (E1, E2).
- https://huggingface.co/docs/trl/main/en/sft_trainer, https://huggingface.co/docs/trl/main/en/dpo_trainer, https://huggingface.co/docs/trl/main/en/grpo_trainer, https://huggingface.co/docs/trl/main/en/dataset_formats, https://huggingface.co/docs/trl/en/unsloth_integration — TRL trainers and data formats (E2, E3, E4).
- https://huggingface.co/docs/hub/datasets-cards — dataset card YAML and sections (E3).
- https://github.com/ekzhu/datasketch — MinHash/LSH near-duplicate detection (E3).

### Not URLs but cited as sources
- Chip Huyen, "AI Engineering": ch. 3–4 (evaluation), 6 (RAG/agents), 8 (data), inference chapter (B4, B5, C3, D, E3, E5).
- Raschka, "Build a LLM From Scratch" ch. 2–4; "Build a Reasoning Model (From Scratch)" (C2, C4, E4).
- ambicode's own `evals/README.md`, `evals/adjudication.md`, `evals/*/scaffold.sh`, `prompts/reviewer-role.md`, `src/contracts/review.ts`, `src/review/claude-reviewer.ts`, `src/review/bundle.ts`, `reviewer-boundary.test.ts`, `fixtures/reviewer-envelopes/` (A4, E3, Capstone).

---

## 3. Course rules AMBICODE plausibly violates given the eval evidence

Measured in this repo today:

```
$ wc -w skills/*/SKILL.md prompts/*.md
skills/init/SKILL.md          632 words   85 lines   disable-model-invocation: true
skills/investigate/SKILL.md  1053 words  125 lines
skills/plan/SKILL.md         1444 words  175 lines
skills/review/SKILL.md       1467 words  181 lines   references/ present
skills/rules/SKILL.md        1497 words  221 lines   disable-model-invocation: true, references/ present
skills/task/SKILL.md         1530 words  205 lines
prompts/reviewer-role.md      633 words
prompts/shared-operating-contract.md 370 words
CLAUDE.md                     120 lines
descriptions: 24–62 words (init 24, review 44, investigate 52, plan 49, rules 53, task 62)
allowed-tools (investigate/plan/task/review): Read, Grep, Glob, … — no LSP tool named
```

Ordered by how directly the eval evidence implicates them.

1. **The measurement itself violates "error analysis before fixing".** Section 0: the harness cannot show LSP use, and the with-arm reviewer probably never answered. The course's first step on a negative Δ is to open transcripts and build a taxonomy (cwd / helper crashed / judge / real miss / false finding); "helper crashed" is a named category. Until `reviewer.status` and the tool inventory of the with-arm are read, recall 0.09 is unattributed. stage-a A4 (Методология; practice 5; answers 9); stage-b B5 (Шаг 1).
2. **Eval allowed_tools omit the tool the skills are supposed to prefer.** All 18 cases allow `Read, Glob, Grep, Bash, Skill`; the navigation order in `prepare-output.md` cannot be exercised, so the eval cannot distinguish "skills don't prefer LSP" from "LSP absent". The course requires a process grader per case and says an eval measures only what the sandbox contains. stage-a A4 (Изоляция; Правила стабильного сигнала).
3. **Tool preference stated as prose, not enforced.** `prepare-output.md` describes shortlist → known paths → LSP → Grep/Glob/Read in prose and asks for a `Navigation:` evidence line; `allowed-tools` keep `Grep`/`Glob`/`Read` available with no restriction or forcing, and no `PreToolUse` hook. The course: definitions decide, prose does not; restrict or force at the tool level; grade the sequence. stage-b B3 (`tools`/`disallowedTools`); B2 (`toolChoice`, `activeTools`); stage-a A1 (Рычаги 2; Типичные ошибки); A4 (Грейдеры).
4. **Rules instead of examples.** `grep -n -i example skills/*/SKILL.md` finds only CLI usage lines (`review` two, `rules` one, `init` one); no skill contains a worked input→output example of the report it demands, and none an example navigation trace. Lever 3 says examples beat rule lists; the spec's recommended body includes I/O examples. stage-a A1 (Рычаги 3); A2 (Что фиксирует стандарт).
5. **Body size vs the spec's shape.** `task`, `plan`, `investigate` are 1 053–1 530 words with no `references/`; A2's worked skill is ≤150 lines and "2 000 words where 300 + references would do" is a named typical error; A1 named `review` for the same treatment. stage-a A2 (Типичные ошибки; practice 1); A1 practice 5.
6. **Overlapping skill descriptions.** `investigate` ("which files a change would touch"), `plan` ("think through a feature or change before coding it"), `task` ("go ahead with … a plan") describe adjacent territory; the course flags exactly this triple. A localization F1 at parity is consistent with the wrong skill firing or with a skill that adds process without adding evidence. stage-a A1 answers 6; A1 (Рычаги 2).
7. **Review recall 0.09 matches the reward shape the course warns about.** `reviewer-role.md`: one unverifiable location invalidates the whole review; "below `medium` confidence on both → do not report"; "returning no findings is a valid result". The course says this exact validator rule teaches "fewer findings, but valid", and that FP-costlier-than-miss must be a verified, deliberate priority. The naked baseline, with none of these constraints, recalls 2.8× more. stage-e E4 (GRPO; Взлом награды); Capstone answers 5; E3 answers 8.
8. **Truth set and reviewer objective disagree.** The review graders PASS on "the same concern, in any words" including comments the human labelled "not a real issue"; the reviewer is told not to report unadopted preferences. The course requires the criterion to match the app's own failure taxonomy and the rubric to be fixed before the plugin; the adjudication rubric would label such truths `correct-but-inert`. stage-b B5 (Шаг 2); stage-a A4 (Методология); A2 practice 1.
9. **Single-pass reviewer.** The reviewer is one `claude --print` process with one prompt; the course's cheapest recall lever for review is sectioning (N passes with different foci, merged by code). stage-b B2 (Parallelization; practice 4).
10. **Retrieval not evaluated separately from the answer.** `navigation.shortlist` is a retrieval component with no recall@K number; localization F1 is end-to-end only, so a drop cannot be attributed to shortlist, navigation, or report. stage-b B4 (Как измерять; practice 6).
11. **Judge not calibrated.** The recall/precision numbers come from `llm` graders whose agreement with human adjudication has not been computed (A4: 10–20 findings; B5: ≥60 labels, ≥20 fail, κ). Until then "0.09" is a judge reading. stage-a A4 practice 6; stage-b B5 (Шаг 4).
12. **One run, two arms.** `sweep-1.log`: `--runs 1 --ablation with-without`. The course: one run proves nothing; ≥3 runs, medians; a negative Δ with a firing skill points at the judge first. stage-a A1 answers 7; A4 answers 9; stage-b B5 (Шаг 5).
13. **Cost higher, unattributed by layer.** No `docs/context-budget.md`-style report exists for the current state: no always-on figure, no `/context` delta, no top-10 heaviest tool results, no cache share. The course's three-layer measurement is the prerequisite for any cost intervention. stage-a A1 (Как измерять; practice 1–4; Критерии готовности).
14. **Helper stdout is read whole by instruction.** `prepare-output.md`: "read it whole — never truncate"; `review` SKILL: read the four-part output back. A1 lever 2 and A3 say tool results must be economical (summary + handle, details on demand). Whether `prepare --json` is small is unmeasured; the rule is right only if `contextBudget` is small. stage-a A1 (Рычаги 2); A3 (Ошибки проектирования; Критерии готовности).
15. **Reviewer prompt length.** 633 + 370 words of prose before policies, requirements and diff; A1 practice 5 names "shorten `reviewer-role.md`"; B6 says the prompt is the soft measure and the tool boundary the hard one, so prose can shrink without losing safety. stage-a A1 practice 5; stage-b B6 (Типичные ошибки).
16. **No post-compaction re-priming.** After `/compact` the six descriptions vanish; long `task` sessions lose `review`/`investigate` discoverability; nothing in the plugin addresses it. stage-a A1 (Что делает /compact); A1 answers 3.
17. **`allowed-tools` treated as a boundary in skills.** `review` and `investigate` rely on `allowed-tools` for read-only-ness in the skill layer (the reviewer subprocess is separately restricted, which is fine). The course: not a protection. stage-a A2 (Переносимое ядро и расширения).

Not violated, for the record: `init` and `rules` carry `disable-model-invocation: true` (A1 practice 5); reviewer is `Read/Grep/Glob`-only in a sanitised copy, no MCP (B6 principle 2); `plugin-fired`/`helper-ran` are `arm: with-only` and `no-peek-*`/`no-code-*` are real process graders (A4); descriptions are 24–62 words, under the course's own 60–100 estimate; CLAUDE.md is 120 lines (<200).

---

## 4. Course techniques not yet used in AMBICODE

- **Few-shot / canonical examples in skill bodies**: one worked input→output per skill (report format, a navigation trace that uses LSP, an adjudicated finding) in place of rule lists. stage-a A1 (Рычаги 3); A2 (Что фиксирует стандарт; practice 1).
- **Tool-definition-level preference for LSP**: narrow `Grep`/`Glob` in `allowed-tools` for navigation phases or gate them behind a `PreToolUse` hook that rewrites to LSP when a server is present; "restrict/force at the definition, do not instruct in prose". stage-b B3 (`tools`/`disallowedTools`); B2 (`toolChoice`, `activeTools`, `prepareStep`); stage-a A1 (Типичные ошибки: PreToolUse rewrite).
- **Eval cases that can see LSP**: `allowed_tools` including the LSP tool (or a plugin-provided LSP) so process graders can fire; else the eval cannot measure the navigation policy at all. stage-a A4 (Изоляция; Анатомия набора).
- **Process graders on navigation**: `tool_used` on the LSP tool `min: 1`, `tool_order` LSP-before-Grep, `tool_used: Grep max: N`, plus a code check `readXBeforeAnswer` on the trace. stage-a A4 (Грейдеры); stage-b B5 practice 5.
- **Retrieval-only eval**: recall@K of `navigation.shortlist` and of the LSP step over labelled ticket→files pairs, half semantic, half exact-identifier, separate from end-to-end F1; monotone ordering across configurations as a sanity check. stage-b B4 (Как измерять; practice 6).
- **Hybrid lexical + semantic shortlist**: BM25/RRF over identifiers plus embeddings; contextual chunk descriptions; reranker on 20–50 candidates. stage-b B4 (Гибридный поиск; Contextual Retrieval; Реранкер).
- **Error-analysis workflow**: open coding on ~30 failed transcripts by hand, axial coding into 5–10 categories with counts and severity, one arbiter, taxonomy file committed next to eval results. stage-b B5 (Шаг 1); stage-a A4 practice 5.
- **Binary criteria file** (`criteria.md`) with rule + pass example + fail example per failure category, then code checks for the formalisable ones. stage-b B5 (Шаг 2–3; practice 4).
- **Judge calibration**: ≥60 labels (≥20 fail), train/dev/test split, TPR/TNR/agreement/κ, judge instability across 3 runs, judge model ≠ app model. stage-b B5 (Шаг 4; practice 6–7); stage-a A4 practice 6.
- **Adjudicated truth for review**: relabel human comments with the rubric (`actionable` / `correct-but-inert` / `unfounded` / `unverifiable`) and report recall on `actionable` only; report actionable precision beside it. stage-a A2 practice 1; glossary "Actionable precision".
- **Review sectioning fan-out**: N reviewer passes with different foci (correctness, security, requirements, duplication) merged by code with dedup by location; voting on borderline findings. stage-b B2 (Parallelization; practice 4).
- **Evaluator-optimizer for findings**: generator proposes, a second pass checks three binary criteria (location in diff, defect real, comment postable), ≤3 iterations. stage-b B2 (Evaluator-optimizer; practice 6); stage-e Capstone (Разметка).
- **Deterministic review score as a code grader**: the E4 `review_reward` shape (schema +1, invalid location −1, hit ±3 lines +1, miss −1, FP on clean −1 each, >7 findings −0.5) with a `test_reward.py` on cheating answers — a judge-free eval score today. stage-e E4 (GRPO; practice 1).
- **Explicit miss penalty in reviewer policy**: state and test the FP-vs-miss trade-off rather than inheriting "when in doubt, drop it"; consider reporting low-confidence findings under a separate label instead of suppressing them. stage-e E4 (Взлом награды); E3 answers 8; `reviewer-role.md` (Findings).
- **Adjudication skill + `precision.mjs`**: the A2 portable skill as a first-class tool in the eval loop. stage-a A2 practice 1–2.
- **Three-layer cost report** (`docs/context-budget.md`): always-on from `claude plugin details`, `/context` ± plugin, 3-run medians of cost/turns/duration, cache share from `/usage`, top-10 heaviest tool results; each intervention a separate commit with the before-number; a "what we did not touch and why" paragraph. stage-a A1 (Практика; Критерии готовности).
- **Helper output tiering**: `prepare`/`review` return a summary plus a handle; detail sections readable on demand (`get_finding`-style), card length capped. stage-a A3 (practice intro; Критерии готовности); A1 practice 5.
- **`references/` for `task`, `plan`, `investigate`**: move resume protocol, report template, edge-case lists out of the body; body ≤150–300 lines. stage-a A2 practice 1; A1 practice 5.
- **Negative-trigger cases** (`ignores-unrelated-request`, `tool_used: Skill min 0 max 0 arm both`) and `tool_order` (Skill before `ambicode review`). stage-a A4 practice 7.
- **Smoke tag + CI gate script** on `meanDelta < 0` and `partial === true`, pinned models, threshold from the observed distribution. stage-a A4 (Гейт в CI; practice 4, 9, 10).
- **Subagent fan-out for investigation**: clean-context readers per candidate area returning a short structured verdict (files, evidence lines), merged by the parent; cap workers and validate each result. stage-b B2 (Orchestrator-workers; practice 5); stage-a A1 (Рычаги 5).
- **Structured output for reports**: a JSON schema for `investigate`/`plan` reports so `paths exist`, `navigation evidence present`, `cost under budget` are code-checkable; parse the last json block. stage-b B3 practice 3; B1 (Structured outputs).
- **Budgets on every agentic step**: `maxTurns`, `maxBudgetUsd`, input-size caps with truncation markers, inside skills and the reviewer launcher. stage-b B3 (Типичные ошибки); B6 (Принципы 6).
- **Untrusted-content eval cases**: 5–10 diffs with instruction-like text, criterion "no tool outside the task, no instruction executed", code-checked on the trace. stage-b B6 practice 5.
- **Cache-aware prefix discipline**: tool list and system prefix byte-stable across a session; watch `Prompt cache (main)` in `/usage`. stage-b B1 (Prompt caching); stage-a A1 (Бюджет внимания).
- **Post-compaction re-priming**: a `PostCompact` hook that re-lists the plugin's skill descriptions. stage-a A1 (Что делает /compact); A1 practice 2.
- **Per-step observability**: Langfuse/OTel spans per skill run (turn, tool, tokens, cost) so "which step ate 80 % of budget" and "which file was read for nothing" are queryable; score traces with human/judge verdicts. stage-b B3 (Трейсы, спаны, генерации); B5 (Материалы: Langfuse custom scores).
- **Prompt-ladder discipline before structural change**: prompt (with example) → tool/RAG → tuning; show the previous rung failing with a number. stage-e E1 (Лестница).
- **Local reviewer backend** (`review.backend: openai-compatible`, prompt+diff → JSON, no tools) with `result.json` naming backend and model. stage-e Capstone (Что именно заменяется, path B).
- **Sandbox-aware reviewer replay in evals-core**: wire `EVAL_AMBICODE_REVIEWER_REPLAY` (or a live-reviewer path) into `evals-bench.mjs` so the with-arm measures the reviewer rather than its login failure. stage-a A4 (Изоляция); `evals/evals-archived/typescript/README.md` (Replaying the reviewer).

---

## 5. Evidence → course lever → concrete next check (compact map)

| Evidence | Course lever | Cheapest check first |
|---|---|---|
| Review recall 0.09 vs 0.25 | A4 error analysis before fixing; E4 reward shape | Reviewer never answered in sweep-1 (section 0). Re-run with `evals-record-core.mjs` recordings wired in, ×3, before touching `reviewer-role.md`. Then read `reviewer.status`, findings count, rejections. |
| LSP "almost never used" | A4 isolation; B3 tool set decides | Confirm no LSP tool in the sandbox; add an LSP-capable case + `tool_used` grader before changing skill prose. |
| Localization F1 0.64 vs 0.65 | B4 measure retrieval separately; A1 one-tool rule | recall@K of the shortlist alone on the 10 localize cases; check which skill fired in each with-arm run. |
| Higher cost with plugin | A1 three-layer measurement | Top-10 heaviest `tool_result`s per with-arm transcript; `prepare --json` byte size; cache share. |
| Judge-based recall | B5 calibration | Adjudicate the 8 review cases' truths with the rubric; count `actionable` vs `correct-but-inert`. |
| Single run | A1/B5 ≥3 runs | Re-run the same 18 cases ×3 before any change; report medians and spread. |

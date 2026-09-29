# Anthropic / Claude Code Documentation Reference

## 1. Skills (SKILL.md)

**Source**: https://code.claude.com/docs/en/skills.md

### Frontmatter Fields (All Optional)

- `name`: command name, defaults to directory name
- `description`: critical for Claude's decision-making; drives invocation triggering. *"Combined description + when_to_use text is truncated at 1,536 characters in the skill listing."*
- `when_to_use`: additional trigger phrases and example requests
- `argument-hint`: hint for autocomplete (e.g., `[issue-number]`)
- `arguments`: named positional arguments for `$name` substitution
- `disable-model-invocation`: set `true` to prevent Claude from auto-invoking (manual-only skills)
- `user-invocable`: set `false` to hide from `/` menu (Claude-only)
- `allowed-tools`: pre-approve tools for this turn (e.g., `Read Grep Bash(git *)`)
- `disallowed-tools`: remove tools while skill is active
- `context: fork`: run in isolated subagent
- `agent`: subagent type (Explore, Plan, general-purpose)
- `background`: `false` to wait for forked skill result
- `model`: override session model
- `effort`: override effort level (low, medium, high, xhigh, max)
- `paths`: glob patterns to limit skill activation
- `shell`: `bash` (default) or `powershell`
- `hooks`: register hooks when skill invokes
- `metadata`: free-form YAML for custom data

### Description Best Practices

*"Consider the context that you might implicitly bring—specialized query formats, definitions of niche terminology, relationships between underlying resources—and make it explicit."* Good descriptions state the use case first:

✅ *"Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff."*

❌ Avoid: *"Summarizes changes"*

### Content Size Guidance

- Keep `SKILL.md` under 500 lines for performance
- Move detailed reference material to separate files in the skill directory
- Every line is a recurring token cost across turns
- Apply conciseness test: "Would removing this cause Claude to make mistakes?"

### Supporting Files Pattern

Reference files from SKILL.md; they load on demand:
```
skill-dir/
├── SKILL.md (overview)
├── reference.md (detailed docs)
├── examples.md (usage examples)
└── scripts/ (utility scripts)
```

**Source**: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (UNVERIFIED - docs map suggests this is not published yet)

### Agent Skills Architecture (Broader Context)

- Only metadata (name + description) pre-loads into system prompt at startup (~dozens of tokens)
- Full body loads only when skill is triggered
- Additional resources (scripts, reference docs) load on demand via subdirectories

---

## 2. LSP in Claude Code

**Source**: https://code.claude.com/docs/en/plugins/code-intelligence.md

### LSP Tools & Capabilities

- Claude gains **diagnostics after edits**: each time Claude edits/writes a file, the server reports errors, warnings, syntax errors, missing imports
- Claude gains **code navigation**: an `LSP` tool that looks up symbols through the server (read-only)
- Tools that LSP provides: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, etc.

### LSP Plugin Configuration

- Language server plugins installed from official marketplace; installed plugins listed: typescript-lsp, pyright-lsp, rust-analyzer-lsp, etc.
- Plugin config: `lspServers` in `plugin.json` (marketplace LSP plugins for typescript/python, and community plugins via GitHub repos)
- Custom LSP: write a plugin with `.lsp.json` file naming server command and file extensions

### LSP & Eval Sandbox

- The eval sandbox (claude plugin eval) **does not load LSP servers**: *"In cloud sessions, Claude Code doesn't start plugin language servers, so Claude gets no diagnostics or code navigation there."*
- Skills **cannot require LSP tools**: eval cases run without LSP in the sandbox
- The `LSP` tool name **does not appear in allowed-tools** (read-only tool, auto-available if server running)
- Cloud sessions get no LSP diagnostics or navigation

### Auto-Use vs. Steering

- *"Code intelligence plugins work in terminal sessions"* only; LSP doesn't auto-activate
- Claude Code prompt must steer agents to use `LSP` tool; no auto-invocation
- In cloud sessions: LSP unavailable regardless

---

## 3. Plugin Evals (claude plugin eval)

**Source**: https://code.claude.com/docs/en/plugin-evals.md

### Case Format

- Cases live under `evals/` (configurable via `plugin.json: experimental.evals` or `--eval-dir`)
- Each case: `evals/<case>/prompt.md` (frontmatter + body) + `evals/<case>/graders/<name>.md` (frontmatter + rubric)
- Optional `case.yaml` for context fields: `scaffold_script`, `history_file`, `add_dirs`
- **Required frontmatter in prompt.md**: none (all optional; schema_version auto-set)
- **Case frontmatter fields**:
  - `name`: case name (defaults to directory)
  - `runs`: 3 (default); `max_turns`: 10; `timeout_seconds`: 300; `model`: inherit from session
  - `allowed_tools`: read-only by default; grant others with `--allow-tools`
  - `tags`: filter with `--tag`
  - `env`: EVAL_* variables only
  - `expected_outcome`, `description`: for humans, not runtime

### Grader Types (6 Types)

| Type | Options | Passes When | Cost |
|------|---------|------------|------|
| `regex` | `pattern`, `flags`, `match`, `target` | Regex found in target | Free |
| `tool_used` | `tool`, `input_match`, `min`, `max` | Tool called N times matching input | Free |
| `tool_order` | `before`, `after` | First `before` call precedes first `after` | Free |
| `file_exists` | `path`, `exists` | File created matches glob (or none with `exists: false`) | Free |
| `llm` | `criteria`, `focus` | Judge votes PASS 2-of-3 on rubric | Paid |
| `baseline` | `baseline_file`, `criteria` | Judge finds run satisfies criteria ≥ baseline | Paid |

### What Graders Can Look At (`target` / `focus`)

- `last_message`: Claude's final response (default)
- `trace`: session as JSON, one message per line
- `files`: list of paths Claude created (not contents)
- `{ source: file, path: <path> }`: file contents (PNG/JPEG/GIF/WebP shown to llm judge as images)
- `mock_calls`: calls to mocked MCP tools with inputs and answers

### Ablation & Baseline

- Default: `with-without` mode (runs each case with plugin, then without)
- `--ablation none`: single arm only (no baseline)
- *"The no-plugin baseline"*: *"A high score on its own doesn't tell you the plugin helped"*
- Graders excluded from scoring in two-arm mode: `tool_used: Skill`, mocked tool graders, graders marked `arm: with-only`
- To score in both arms: mark `arm: both`

### JSON Output (aggregate-result.json)

- `schemaVersion: "1"`
- Top-level fields: `partial`, `partialReason`, `aggregates`, `cases`, `costUsd`, `durationSeconds`, `claudeVersion`
- `aggregates.overallScore`: mean case score
- `aggregates.casesPassed`, `aggregates.casesTotal`: cases >= threshold
- `aggregates.meanDelta`: mean Δ across cases
- `cases[].name`, `cases[].aggregates.score`, `cases[].aggregates.delta`
- `cases[].arms.with[]` / `cases[].arms.without[]`: per-run grader results with explanations
- `cases[].arms.with[].error`: null or error reason (timeout, etc.)
- `cases[].arms.with[].aborted`: when mock `expect:` or `abort_when` stopped run

### Mocks

- Location: `evals/mocks/<server>/<tool>.md` (suite-wide) or `<case>/mocks/` (case-specific)
- Body: tool result with `{{input.field}}` and `{{file:fixtures/...}}` substitution
- Frontmatter: `expect:` (input validation), `error: true`, `type: agent` (model-as-server)
- Agent mocks saved under `mock-recordings/` with `ADOPT.txt`; copy `.replay/` to reuse deterministically

### Running & CI

- `claude plugin eval .` from plugin root
- `claude plugin eval init` writes cases interactively
- CI: `claude plugin eval . --json results.json --threshold 0.8 --trust-plugin --no-publish --max-cost-usd 20`
- Exit codes: 0 (all passed), 1 (failed/not found), 2 (partial: cost ceiling or auth fail), 130 (interrupted), 143 (terminated)

### Grader Design Rules

- For long output: use `regex` grader (deterministic), keep `llm` for short outputs with concrete PASS/FAIL rubrics
- One grader on result, one on steps taken (e.g., `tool_used`)
- Small judge model can mark correct answer wrong if format differs; re-run with `--judge-model sonnet`
- For build/test: have prompt write outcome to file, grade file, assert command ran with `tool_used`

---

## 4. Anthropic Engineering Guidance: Tools & Agents

**Source**: https://www.anthropic.com/engineering/writing-tools-for-agents

### Tool Design: Naming Conventions

*"Namespacing tools by service (e.g., asana_search, jira_search) and by resource (e.g., asana_projects_search, asana_users_search) can significantly impact evaluation performance."*

### Tool Descriptions

*"Consider the context that you might implicitly bring—specialized query formats, definitions of niche terminology, relationships between underlying resources—and make it explicit."*

Key practices:
- Use unambiguous parameter names (`user_id` vs. `user`)
- Clarify expected inputs/outputs explicitly
- Descriptions loaded into agent context steer tool-calling behavior

### Tool Error Responses

Error responses should be instructional: *"clearly communicate specific and actionable improvements"* instead of opaque error codes. Truncated responses can steer agents toward token-efficient strategies (e.g., targeted search recommendations vs. broad searches).

### Tool Response Formats

Multiple strategies optimize context usage:
- Flexible formats: `response_format` enum parameters (e.g., "concise" vs. "detailed")
- Structure options: XML, JSON, or Markdown; *"the optimal response structure will vary widely by task and agent"*
- Content prioritization: return "only high signal information" focusing on contextual relevance

### Token Efficiency in Tools

*"Implement some combination"* of: pagination, range selection, filtering, truncation with sensible defaults. Guidance on response truncation: *"truncated responses steering agents toward token-efficient strategies like making many small and targeted searches instead of a single, broad search"*

### Steering Tool Choice

Several mechanisms guide agent behavior:
- Clear namespacing reduces confusion
- Descriptive documentation loaded into context influences selection
- Response truncation with helpful instructions
- Semantic naming over cryptic identifiers improves precision

**Source**: https://www.anthropic.com/engineering/building-effective-agents

### Workflow Patterns (5 Core Patterns)

1. **Prompt Chaining**: *"Decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."*
2. **Routing**: Classifies inputs and directs to specialized handlers
3. **Parallelization**: Runs subtasks concurrently (sectioning) or identical tasks multiple times (voting)
4. **Orchestrator-Workers**: Central LLM dynamically breaks tasks into unpredictable subtasks; best when steps can't be predetermined
5. **Evaluator-Optimizer**: One LLM generates, another provides iterative feedback in loop

### Agent Patterns & Complexity

*"Agents begin their work with either a command from, or interactive discussion with, the human user."* Function *"based on environmental feedback"* and tool results. Key characteristics: include stopping conditions, checkpoints for control, require substantial testing in sandboxed environments.

**Foundational principle**: *"Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."* *"Only increasing complexity when needed"* and adding components *"only when it demonstrably improves outcomes."*

**Source**: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

### Context as Finite Resource

*"Treat context as a finite resource with diminishing marginal returns"*. LLMs experience "context rot"—performance degradation as tokens increase due to transformer n² pairwise relationships. Models have an *"attention budget"* requiring careful curation.

**Optimal Strategy**: Find *"the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome."*

### Context Design Patterns

**System Prompts**: 
- Strike balance between over-specification and vague guidance
- Organize into distinct sections (XML tags or Markdown headers)
- Start minimal on capable models; add examples based on failure modes

**Tools**:
- Minimize functionality overlap and ambiguity
- Self-contained, robust tools with clear intended use
- Descriptive, unambiguous parameters
- Curate minimal viable sets

**Examples & Few-Shot**: Provide *"diverse, canonical examples"* rather than exhaustive edge-case lists. Examples communicate expected behavior efficiently.

### Just-In-Time Context Retrieval

Replace pre-processed data with lightweight identifiers (file paths, URLs, queries) that agents load via tools. Mirrors human cognition, reduces context bloat, enables progressive discovery.

### Long-Horizon Task Techniques

**Compaction**: Summarize conversations approaching context limits, preserve architectural decisions and unresolved issues, discard redundant outputs. Tune for recall first, then precision.

**Structured Note-Taking**: Agents maintain external memory (files, databases) pulled back as needed; enables multi-hour coherence.

**Sub-Agent Architectures**: Specialized agents handle focused tasks with clean contexts, return condensed summaries (1,000-2,000 tokens) to coordinating agent, isolate detailed search context.

---

## 5. Code Review Agents

**Source**: https://code.claude.com/docs/en/code-review.md

### Multi-Agent Review Approach

*"When a review runs, multiple agents analyze the diff and surrounding code in parallel on Anthropic infrastructure. Each agent looks for a different class of issue, then a verification step checks candidates against actual code behavior to filter out false positives."*

### Findings Filtering & Confidence

Results are *"deduplicated, ranked by severity, and posted as inline comments"*. Confidence filtering: default threshold is 80. *"A fleet of specialized agents examine the code changes in the context of your full codebase."*

### Severity Levels

- 🔴 **Important**: bug should be fixed before merging
- 🟡 **Nit**: minor issue, worth fixing but not blocking
- 🟣 **Pre-existing**: bug exists but not introduced by this PR

### Verification Loop

*"Each agent looks for a different class of issue, then a verification step checks candidates against actual code behavior to filter out false positives."* Findings include collapsible extended reasoning.

### Review Customization (REVIEW.md)

Repository root `REVIEW.md` file tailors review behavior. Patterns with high impact:
- **Severity**: redefine what Important means; escalate nits to Important if needed
- **Nit volume**: cap max nits per review (e.g., "report at most five nits")
- **Skip rules**: exclude paths (generated code, lockfiles, vendored deps)
- **Repo-specific checks**: "new API routes must have integration test"
- **Verification bar**: require evidence before posting finding class
- **Re-review convergence**: suppress new nits after first review, Important only
- **Summary shape**: tally format, lead with "no factual issues"

**Source**: https://code.claude.com/docs/en/best-practices.md

### Local Review (/code-review)

- Background subagent context doesn't clutter main conversation
- Reports findings as text (or via `ReportFindings` tool for host apps)
- Follows `CLAUDE.md` like any session; doesn't read `REVIEW.md`
- Effort levels: `low`/`medium` (fewer, high-confidence findings), `high`/`max` (broader coverage, less certain)
- Pass `--fix` to apply findings after review
- Verification subagent pattern: fresh model tries to refute result, preventing bias toward code just written

### Diff-Scoped Reading & Recall

Claude reads: diff itself, surrounding context of changed lines, full codebase for cross-references. Independent reviewers in fresh context reduce recency bias. Multi-pass verification (find candidates → verify against actual behavior) filters false positives before reporting.

---

## 6. Skills / Agent Skills (Broader Architecture)

**Source**: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (metadata only; full spec UNVERIFIED)

### Skills Loading Strategy

- Metadata (name + description) pre-loads at startup, stays in context
- Full SKILL.md body loads only when Claude judges skill might help
- Supporting files (reference docs, scripts, fixtures) load on-demand
- Reduces token cost: only active skill bodies consume context per turn

### Skills as Composable Libraries (Future)

UNVERIFIED: Skills will become first-class libraries, versioned, shareable, composable; agents may author their own skills to capture successful strategies.

---

## Cross-Cutting Principles

### Token Efficiency (All Sources)

- Minimize context at startup; load details on demand
- Truncate responses intelligently; provide helpful summaries
- Use pagination, filtering, range selection in tools
- Prefer lightweight identifiers over full data
- Compact conversation approaching limits
- Prefer structured subagent summaries (1000-2000 tokens) over full context

### Verification & Validation

- Code review: multiple independent agents in parallel, then verification against actual code
- Plugin evals: run both with and without plugin to measure contribution (`Δ`)
- Skills: description drives triggering; test with evals to confirm natural phrasing triggers skill
- Local review: provide deterministic verification (tests, scripts) Claude can run and iterate on

### Tool Design Principles

- High-leverage tools over thin wrappers
- Clear naming and parameter conventions
- Descriptive docs loaded into context
- Instructional error responses
- Flexible response formats (concise/detailed)
- Token-efficient defaults and pagination


# AMBICODE skills: a walkthrough as a new agent would follow them

**Scope.** I read all six `skills/*/SKILL.md` files, the two `skills/shared/*`
procedures, the two `references/*` files, `hooks/hooks.json`, and the code
each step lands in (`src/hook`, `src/cli/commands/{prepare,review}`,
`src/review/bundle`, `src/checks/{run,remote,authorize}`,
`src/requirements/normalize`, `src/review/claude-reviewer`). I executed no
skill and no `ambicode` command. I ran one scratch unit test against
`src/checks/run.ts`, outside the repo, to confirm finding **F1**. I did no
documentation research (`docs/`, `plan/`).

**Notation.**
`$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`.
⛔ = hard exit: the CLI exits 2 with `error [<code>]`, or the skill says "stop".
⏸ = gate: the run waits for a human answer.
↩ = loop.
🪝 = a hook fires here.

---

## 0. The interception layer (hooks)

`hooks/hooks.json` points every event at `$A hook`. `runHook` never throws,
always exits 0, and returns `{}` on any failure (`src/hook/run-hook.ts:34-81`).
**There is no `PreToolUse` hook, so nothing intercepts or blocks a tool call
before it runs.** Enforcement comes only from three places: the skill text,
each skill's `allowed-tools` frontmatter (it grants permission without a
prompt, but does not forbid other tools), and refusals inside the CLI.

| Event | Matcher | What it does | Effect on the agent |
|---|---|---|---|
| `SessionStart` | startup, resume, clear, fork | Resets the epoch and injects the shared operating contract once. | The contract text is in context before any skill runs. |
| `UserPromptSubmit` | all | Injects the contract only if this epoch has not had it yet. | A no-op on every prompt except the first one after a compaction. |
| `PostCompact` | all | Resets the epoch and returns nothing. This event has no `additionalContext` variant. | The next `UserPromptSubmit` delivers the contract again. |
| `PostToolUse` | `Edit\|Write` | Resolves `task` policy for the edited file and emits the rules marked `remindOnEdit` that were not yet delivered for that (path, rule). | Advisory only, and applied on the next model request. **No built-in pack sets `remindOnEdit`** (`grep -l "remindOnEdit: true" policies/*` finds nothing). By default this hook spawns node on every Edit/Write and emits nothing. |
| `SessionEnd` | all | Deletes the per-session marker directory. | None. |

Hook state lives in `<scratchpad>/ambicode-hook-state` or `$TMPDIR`, never in
the repository (`src/hook/markers.ts`).

---

## 1. The skill chain

```
/ambicode:init  ──►  /ambicode:rules  ──►  investigate  ──►  plan  ──►  task ──► ($A review, internal)
 (user only)          (user only)          (model)          (model)    (model)
                                                                            │
                          review ◄───────────────────────────────────────────┘ (standalone too)
                            │  --mr
                            ▼
                       $A view (background) ──► browser page ──► human presses Submit ──► GitLab
```

| Skill | Who can invoke | `allowed-tools` (no prompt) | Writes |
|---|---|---|---|
| init | user only (`disable-model-invocation`) | Read, Grep, Glob, Write/Edit(`.ambicode/config.yaml`), Bash(`node *ambicode.mjs*`) | config.yaml; the CLI also appends to `.gitignore` |
| rules | user only | Read, Grep, Glob, Write(`.ambicode/policies/**`), Edit(config.yaml), Bash(`node *ambicode.mjs*`) | packs and config.yaml |
| investigate | model or user | Read, Grep, Glob, Write(`.ambicode/task/**`), Bash(`node *ambicode.mjs*`) | an investigation note |
| plan | model or user | same as investigate | an accepted plan |
| task | model or user | Read, Grep, Glob, **Edit(\*\*), Write(\*\*)**, Bash(`node *ambicode.mjs*`, `git status*`, `git diff*`) | product code; `review` writes `.ambicode/task/<slug>/reviews/` |
| review | model or user | Read, Grep, Glob, Bash(`node *ambicode.mjs*`) | `.ambicode/reviews/<id>/` and a snapshot directory outside the repo |

No skill lists MCP tools in `allowed-tools`. Every Jira/Confluence read
therefore raises a permission prompt unless the user pre-allowed it. That is
friction, not a block.

---

## 2. Shared sub-chains, used by several skills

### R. Requirement retrieval (`skills/shared/requirements-mcp.md`)

Used by investigate, plan, task and review. `rules` runs R1–R3 only.

**Best path**

| # | Agent does | Tool / command | Why it goes well |
|---|---|---|---|
| R0 | Reads `requirements-mcp.md` once per session. | Read | The procedure lives in one file, so no skill carries a diverging copy. |
| R1 | Checks the binding. | Bash `$A config` → `requirements.mcpServer: "atlassian"` | The server is pinned, so there is no choice to make. |
| R2 | Retrieves every URL. | `mcp__atlassian__getJiraIssue` / `getConfluencePage` (permission prompt) | Reads through the bound server with real content. |
| R3 | Builds the envelope in context: one source per URL, `status: retrieved`, verbatim `content`, the real `sourceVersion`/`updatedAt` or `null`, `retrievedVia`, and `conflicts` if two documents disagree. | none (in context) | It matches the strict zod schema (`src/contracts/requirements.ts:7-19`), so it validates on the first try. |
| R4 | Pipes the envelope to the command. | Bash `$A <cmd> --requirement <url>… --evidence - <<'EVIDENCE' {…} EVIDENCE` | No temp file. `normalizeRequirements` matches the URLs one-to-one and sets `mode: requirement-based`. |

**Worst path that still completes**

| # | What goes wrong |
|---|---|
| R1 | `mcpServer` is null and two servers are connected. The agent picks one instead of asking. The CLI only adds a notice (`normalize.ts:247-253`), so nothing blocks. |
| R2 | The ticket is thin ("fix orders"). The agent retrieves it correctly, but the content holds no testable requirement. |
| R3 | The agent paraphrases the ticket into `content`. The CLI cannot detect paraphrase. It also leaves `conflicts` empty although the page and the ticket disagree, because only the agent can see prose conflicts. The run continues against a contract that is silently wrong. |
| R4 | Accepted. All later evidence is cited against a paraphrase. |

**Exits and blocks**

| Where | Code / reason | Cause |
|---|---|---|
| R1 ⛔ | skill says stop | The configured server is not connected. **This is the state of this session right now: "claude.ai Atlassian Rovo" needs authentication.** |
| R1 ⏸ | skill says ask | `mcpServer` is null and more than one server is connected. |
| R2 ⛔ | skill says stop | Any URL is unreadable. The only allowed continuation is a source-free run that the user explicitly chooses. |
| R4 ⛔ | `requirements-not-retrieved` | A URL was passed without `--evidence`, or the envelope lacks it. |
| R4 ⛔ | `requirements-unavailable` | The envelope `status` is not `retrieved`. |
| R4 ⛔ | `requirements-conflicting` | The session or the helper reported a conflict. |
| R4 ⛔ | `requirements-server-mismatch` / **`requirements-server-unrecorded`** | The envelope server differs from the configured one, or the envelope has `mcpServer: null` while config binds one. |
| R4 ⛔ | `requirements-invalid` / `-unparsable` / `-unreadable` | A schema slip (for example a missing `retrievedVia`), bad JSON, or empty stdin. |
| R4 ⛔ | `requirements-undeclared` / `-duplicated` / `-ambiguous` / `-empty` / `-invalid-url` | The envelope and the flags do not match one-to-one, or the content is empty. |

The last three rows are **not documented anywhere in `skills/`** (see F3). The
error text is self-explanatory, so an agent can usually recover.

### P. Preparation (`$A prepare`, read per `skills/shared/prepare-output.md`)

Used by investigate, plan and task.

**Best path**

| # | Agent does | Tool / command | Why it goes well |
|---|---|---|---|
| P0 | Reads `prepare-output.md` once. | Read | It learns the compact shape, how to rebuild qualified ids, and that it must not truncate. |
| P1 | Runs prepare with its best guess at paths and explicit terms. | Bash `$A prepare --activity <a> --json <paths> [--project id] [--requirement u --evidence -] --term order --term cancel` | Requirements are checked first (`prepare.ts:75-82`). Then the project, the policy, the shared-contract hash and a git-only shortlist. |
| P2 | Reads the whole payload. | none | `contextBudget` fits under `review.maxContextBytes` (512 KiB). |
| P3 | Applies the `before-work` prompt now and keeps `before-report` for later. | none | Prompts arrive hash-verified, so there are no path lookups. |
| P4 | Treats `navigation.shortlist` as a hypothesis. | none | The shortlist ranks candidates with reasons; the agent confirms or rejects each one. |

**Worst path that still completes.** P1 runs with no paths and no `--term`,
so there is no shortlist and only activity-level policy applies. P2 pipes the
output through `head -c`, which the skill forbids, and loses `navigation`.
P3 folds `before-report` into the start and never re-reads it. P4 skips.
Nothing in the CLI detects any of this.

**Exits**

| Code | Cause | Skill says |
|---|---|---|
| ⛔ `config-missing` | No `.ambicode/config.yaml`. | Ask the user to run `/ambicode:init`. |
| ⏸ `ambiguous-project` | A monorepo, and the paths did not settle the project. | Ask which project, or narrow the paths. Never guess. |
| ⛔ `preparation-blocked` | An applicable prompt is unreadable, too large, or changed its hash between resolve and read. | Stop. |
| ⛔ `preparation-too-large` | The payload is over 512 KiB, usually a large Confluence page. | Not covered by any skill (F3). |
| ⛔ `bad-argument` | Missing or unknown `--activity`, or an unknown flag. | none |
| ⛔ `shared-contract-unreadable`, `plugin-root-unresolved`, `not-a-repository` | A packaging or environment defect. | none |

---

## 3. `/ambicode:init`

Trigger: the user types `/ambicode:init`, or another skill told them to after
`config-missing`.

### Best path

| # | Agent does | Tool / command | Hook | Why it goes well |
|---|---|---|---|---|
| 1 | Previews the proposal, if the user asked to see it first. | Bash `$A init --dry-run` | — | Nothing is written. |
| 2 | Writes the config. | Bash `$A init` | — | Detects TS/Python projects from manifests. Checks point at `./node_modules/.bin/<tool>` or `.venv`. Enables the Angular/Express packs. Appends `.ambicode/reviews/`, `.ambicode/notes/` and `.ambicode/task/` to `.gitignore`. |
| 3 | Reports the projects, checks, gaps and the LSP recommendation, and quotes each missing-check notice verbatim. | none | — | The user learns exactly which checks will be skipped and why. |
| 4 | Handles `requirements.mcpServer`: exactly one Atlassian server is connected, the agent offers it, the user agrees, and it writes the name. | Edit(`.ambicode/config.yaml`) | 🪝 PostToolUse → no remind rules → `{}` | Later requirement runs are pinned to that server. |
| 5 | Mentions the rule sources it detected and offers `/ambicode:rules`. | none | — | Rules written in Markdown are not in effect until migrated. |
| 6 | Stops. It may quote `$A config` for limits. | Bash `$A config` | — | Prints effective values, not remembered ones. |

**Result:** a working config with real, scoped commands for lint and unit,
e2e left as `propose`, and a bound MCP server.

### Worst path that completes

1. `$A init` runs straight away without `--dry-run`, which is allowed. **Nothing was detected**, so one root project is written with every command null.
2. The report is compressed, and the notices are paraphrased instead of quoted.
3. pytest or Playwright is present, so the check stays null. The agent offers a `mapping`, guesses a layout, and nobody verifies it.
4. No MCP server is connected (as in this session), so the value stays null. The skill correctly says requirement review is unavailable.
5. The agent edits `config.yaml` beyond what the user asked, against step 4. `allowed-tools` permits it without a prompt, and no hook prevents it.

**Result:** a syntactically valid config where every check is skipped. Every
later `review` reports `partial`: "checks did not pass or could not establish
what they covered".

### Exits and blocks

- ⛔ `not-a-repository`, `git-unavailable`: no git.
- ⛔ `config-unparsable`, `config-invalid`, `config-schema-too-new`: an existing broken or newer config.
- ⏸ More than one MCP server is connected: the agent must ask which one.
- ⏸ Step 4: the skill stops. Any further edit needs a specific request from the user.

---

## 4. `/ambicode:rules`

Trigger: the user types it, usually after init lists rule sources.

### Best path

| # | Agent does | Tool / command | Hook | Why it goes well |
|---|---|---|---|---|
| 1 | Takes sources from `$ARGUMENTS`, or finds them. | Glob `CLAUDE.md`, `**/CLAUDE.md`, `CONTRIBUTING.md`, `docs/**/*.md`, `.cursor/rules/**`, `.github/…` | — | It lists only files that exist. |
| 1a ⏸ | Asks which files state rules the team wants enforced. | AskUserQuestion or text | — | Presence is not a mandate. |
| 1b | For a Confluence URL, follows R1–R3 only: no envelope, no `--requirement`. | `$A config`, then MCP read | — | Same honesty rules as R. |
| 2 | Reads the configuration. | Bash `$A config --json` | — | Gets project ids, roots, ecosystems and enabled built-ins. |
| 2a | Inspects the built-ins' actual rules. | Bash `$A policy --project web --activity review src/x.ts --json` | — | Duplicates are found from real rules, not guessed from ids. |
| 3 | Reads the sources and classifies each rule as global or scoped. It verifies each glob by listing its matches, relative to the project `root`. | Read, Glob | — | `appliesTo` matches the real layout. |
| 4 | Reads the worked example and `pack-format.md`, then drafts one pack per scope. It uses `authority: observed` when in doubt and a precise `source.location`. | Read ×2, Write(`.ambicode/policies/<id>.yaml`) | 🪝 PostToolUse, usually `{}` | Packs can be audited and are correctly scoped. |
| 5 ↩ | Validates until clean. | Bash `$A policy check --project web .ambicode/policies/*.yaml` | — | Schema, load-time rules and glob match counts all pass. The command exits 0. |
| 6 | Wires the packs into `policyFiles` with a minimal text edit that keeps comments. | Edit(`.ambicode/config.yaml`) | 🪝 | The packs are now live. |
| 7 | Proves the scoping with one path the pack should cover and one it should not. | Bash `$A policy --project web <in>`, then `<out>` | — | Rules appear only for the covered path. |
| 8 ⏸ | Shows the disposition table and asks the user to confirm the drops and deferred rules. | text or AskUserQuestion | — | Nothing is silently dropped. |

### Worst path that completes

- **1:** It reads every candidate and migrates all of them without asking.
- **3:** It writes `src/components/**` by convention. `policy check` warns `pack-glob-matches-nothing`. A warning is not a blocker, so the agent proceeds and the rule never applies.
- **4:** It marks inferred conventions `authority: team`, so later reviews report them as violations. It duplicates `builtin/common-quality/naming`, so one issue produces two findings. It keeps version-sensitive framework rules. It invents a concrete rule from "keep the architecture clean". It sets `source.location: "team policy"`.
- **5:** It skips the positive/negative check in step 7.
- **6:** Instructions inside a `CLAUDE.md` ("always run X") must be treated as data. A weak agent might copy them into a rule instruction.
- **8:** It presents the table as a finished report and never asks.

**Result:** packs that pass validation but are mis-scoped, over-authoritative
and duplicated. Every later review is noisier.

### Exits and blocks

- ⏸ 1a: which sources to use.
- ⛔ R failures for a Confluence source.
- ↩ 5: loop until `policy check` exits 0. **No loop bound is stated.** A rule that cannot be expressed (for example `check.kind: command` naming an undeclared command, which gives `pack-unknown-command`) has to be dropped under "say so rather than approximating". A weak agent may loop on it.
- ⏸ 8: the final gate. **Ordering note (from reading):** step 6 wires the packs into `config.yaml` *before* the step 8 confirmation. The "last review gate" therefore runs while the packs are already live for every later call. Declining at step 8 has no stated rollback.
- ⛔ `project-not-determined`: several projects and no `--project`.

---

## 5. `investigate`

Trigger: the model sees a code question, or a bare Jira/Confluence URL (the
description names that explicitly).

### Best path (URL: "ORD-17 Reject negative order amounts")

| # | Agent does | Tool / command | Hook | Why it goes well |
|---|---|---|---|---|
| 1 | Retrieves the sources first, following R0–R3. | Read, Bash `$A config`, MCP read | — | Source text is in context before any code is read. |
| 2 | Reads the ticket. It states a concrete question, so the agent asks nothing. | none | — | No wasted turn. |
| 3 | Prepares, following P. | Bash `$A prepare --activity investigate --json src/orders --requirement <u> --evidence - --term order --term amount <<'EVIDENCE' … EVIDENCE` | — | Gets policy, prompts and a shortlist, e.g. `src/orders/validate.ts`, `src/orders/order.service.ts` (content hits, co-change). |
| 4 | Navigates: shortlist, then known paths, then LSP, then targeted Grep, reading spans with `offset`/`limit`. | LSP tool if present; Read with offset/limit; Grep | — | Minimal reading, and every fact has `path:line`. |
| 5 | Forms two or more explanations (validation in the DTO or in the service?) and checks each. | Grep, Read | — | It does not stop at the first match. |
| 6 | Applies the `before-report` prompt, then reports: Confirmed facts / Assumptions / Unresolved / Recommendation / Navigation line / What would change this. | none | — | Each claim is labelled with its evidence class. |
| 7 | Saves the note without asking. | Write(`.ambicode/task/ORD-17/investigation_2026-09-30T10-15.md`) | 🪝 PostToolUse → `{}` | `/ambicode:plan` can reuse it, and it is gitignored. |

### Worst path that completes

- **1:** It starts grepping code before retrieval, or asks "what do you want to know?" before reading the ticket.
- **2:** The ticket is vague. The agent asks three questions at once, where the skill says one.
- **3:** No `--term`, and the requirement text is thin, so the shortlist is derived by word frequency and ranks noise. The payload is piped through `head`.
- **4:** It reads whole files and treats shortlist candidates as confirmed. It writes `Navigation: LSP — …` although no LSP tool exists in the session. Nothing in the CLI can check that line.
- **5:** It stops at the first plausible match.
- **6:** It wants to reproduce with `node -e …`. It proposes this, the user authorizes, but `ambicode policy` shows the command is undeclared, so it cannot run. The answer stays inconclusive and must say so.
- **7:** It saves the note under a kebab slug with a timestamp (`order-validation_2026-09-30T10-15`). A source-free `plan` later creates its own timestamped slug, so the two land in **different directories** (F4).

**Result:** a note labelled "investigation note" whose "confirmed facts" are
partly unverified, with a navigation line nobody can audit.

### Exits and blocks

- ⛔ Any failure from R (retrieval, envelope, server).
- ⏸ Step 2: one clarifying question.
- ⛔/⏸ Any exit from P.
- ⏸ A diagnostic command: needs explicit authorization from the user **and** `run` or `propose` in policy. `forbid` or undeclared blocks it, with no bypass.
- No exit at step 7. The note is always written.

---

## 6. `plan`

Trigger: "plan / roadmap / approach", or a URL with a planning intent.

### Best path

| # | Agent does | Tool / command | Hook | Why it goes well |
|---|---|---|---|---|
| 1 | Parses `$ARGUMENTS`: the whole span before the first `--requirement` is the request. Retrieves sources (R) and reads them before asking anything. | R | — | The request is kept intact, with sources in context. |
| 2 | Prepares (P) with `--activity plan`. Applies `before-work` now and holds `before-report`. | Bash `$A prepare --activity plan --json …` | — | Plan-scoped rules, such as the Angular architecture pack. |
| 3 | Reuses an investigation note if one is pointed at. Reads callers, boundaries, tests and existing helpers. Keeps facts, requirement facts, assumptions and unknowns separate. | Read (spans), LSP, Grep | — | The design reuses existing code. |
| 4 ⏸ | For each material decision only, asks **one** question with options, costs and a recommendation. | AskUserQuestion, one per decision | — | Real choices only, resolved by the human. |
| 5 | Presents the full step 5 structure, with iterations as briefs (Goal / Changes `path:line` / Tests / Accept / Checks / Leaves out). | text | — | `task` can start each iteration without re-deriving anything. |
| 6 ⏸ | Gates acceptance: `ExitPlanMode` in plan mode, otherwise AskUserQuestion with *Accept and save* / *Revise* / *Reject*. | ExitPlanMode or AskUserQuestion | — | Acceptance is one click, and declining is possible. |
| 7 | On Accept, saves the plan. | Write(`.ambicode/task/ORD-17/plan_2026-09-30T10-40.md`), labelled "**plan** — accepted" | 🪝 `{}` | Sits in the same directory `task` will open. |

### Worst path that completes

- **1:** It uses only the first token as the request.
- **3:** It proposes a new validator although `src/orders/validate.ts` already has one. A defect under the skill's own rule.
- **4:** It manufactures a choice ("enum or string union?") and asks four questions in a batch.
- **5:** Iterations are one-line titles with "Checks: run the suite".
- **6:** The session is non-interactive, or the user never answers. The plan stays draft and, correctly, is **not saved**. It exists only in the chat.
- **6′:** A worse agent writes "accepted" and saves it anyway. Nothing mechanical stops that: `Write(.ambicode/task/**)` is pre-allowed and there is no hook check.

**Result:** a draft or low-grade roadmap. If it was saved, `task` treats it
only as supporting evidence, which limits the damage.

### Exits and blocks

- ⛔ R.
- ⛔/⏸ P.
- ⏸ Each material decision.
- ⏸ Acceptance gate. ↩ *Revise* returns to steps 3–5. *Reject* means nothing is saved.
- No reviewer and no checks. The skill forbids both.

---

## 7. `task` (with the internal `review` sub-chain)

Trigger: implement, add, fix, "go ahead with the plan", or a URL to implement.

### Best path (implement iteration 1 of the accepted ORD-17 plan)

| # | Agent does | Tool / command | Hook | Why it goes well |
|---|---|---|---|---|
| 1 | Reads the plan; the user's "go ahead" is the authorization. Retrieves ORD-17 (R) and keeps the envelope for reuse. | Read, R | — | The plan is evidence, not permission. |
| 2 | Prepares with the likely paths. | Bash `$A prepare --activity task --json src/orders/validate.ts src/orders/validate.spec.ts --requirement <u> --evidence - --term amount` | — | Gets the `before-work`, `before-checks` and `before-report` prompts, plus `commandDecisions` (lint run, unit run, e2e propose). |
| 3 | Checks git state. The tree is clean. | Bash `git status` (plus `git diff` if dirty) | — | Only this task will be reviewed. |
| 4 | Reuses the existing validator. Writes the regression test first and states that it fails without the fix, then implements the smallest change. | Grep, Read spans, Edit ×2 | 🪝 PostToolUse per file: `{}`, or remind rules if a team pack opts in | TDD at the fix point, with no new abstraction. |
| 4a | If an edit reaches a path it did not prepare for, re-runs prepare with the real paths. | Bash `$A prepare …` | — | Catches rules that apply only to specific paths. |
| 5 | Formats what it wrote, then asks whether to run the independent review (it costs minutes). The user says yes. | text | ⏸ | Spending the review is the user's choice. |
| 6 | Runs the review. | Bash `$A review --requirement <u> --evidence - --task ORD-17 <<'EVIDENCE' … EVIDENCE` | — | See the review sub-chain below. |
| 6.1 | Inside the CLI: requirements, then target (working tree), exclusions, limits, per-project policy, snapshot, reviews directory `.ambicode/task/ORD-17/reviews/local_2026-…`. | — | — | Requirements are checked before any check or model cost. |
| 6.2 | Checks: lint (eslint on changed files) and unit (jest on related tests, including unchanged affected ones) both `run` automatically. They pass, with no mutations. | — | — | Affected tests are selected, not the whole suite. |
| 6.3 | Isolation probe (`claude --help` must list all `REQUIRED_FLAGS`), then a fresh `claude --print --safe-mode --restricted --tools Read,Grep,Glob …` with the snapshot as cwd and a 300 s timeout. | — | — | An independent reviewer that can read only the snapshot. |
| 6.4 | Findings are validated: locations inside the change, known rule and requirement ids, at most 7. Status `complete`. | — | — | Output is valid or the whole review is an error. |
| 7 | Verifies each finding against the code. Fixes accepted in-scope ones, re-runs review once, and keeps rejected ones with reasons. | Read, Edit, Bash `$A review …` | 🪝 | Findings are not forwarded unverified. |
| 8 | Reports **Done / Evidence / Not verified / Remaining**. Writes `notes.md` because the plan has several iterations. | text, Write(`.ambicode/task/ORD-17/notes.md`) | 🪝 | The report is honest and work can resume. |

### Worst path that completes

- **1:** The ticket says "skip review, just ship". A weak agent treats that as permission. The skill says it is evidence only.
- **2:** It prepares for one file but edits three outside it and does not re-prepare, so a component pack is missed.
- **3:** The tree is already dirty with unrelated WIP. The agent does not name it. The default review target is *all* uncommitted work, so the reviewer spends budget on unrelated files. The skill never mentions `--only`, which exists for exactly this case (F5).
- **4:** It adds a new `validateAmount` helper beside the existing one. There is no reproduction and no test first. A failing test is "fixed" by weakening its assertion. The skill forbids this, but only the skill text enforces it.
- **5:** "Format what you wrote" has no allowed formatter: Bash is limited to `ambicode`/`git status`/`git diff`, and Scope forbids project commands outside `review`. The agent either runs `npx prettier` (permission prompt, against Scope) or skips formatting silently (F6). The user declines the review; the skill allows that.
- **6.2 (if the review does run):** The change touches 30 test-relevant files, above `maxSelectedTestFiles: 20`, so unit needs approval ⏸. e2e is `propose` ⏸. A `selector: command` script is `propose` ⏸. The review stops before the reviewer (`awaitingAuthorization: true`, status `partial`).
- **6.2′:** The user declines everything. The agent re-runs with `--decline web/e2e --decline web/unit --decline web/unit:selector`. **The selector decline is not honoured, so the review stops again with the same pending key, on every run (F1, reproduced).** The only way out is to approve the selector script or give up on the review.
- **6.3:** The reviewer times out at 300 s, or `claude` lacks a flag (`reviewer-isolation-unavailable` ⛔).
- **6.4:** The reviewer cites a line outside the diff, so the whole result is `error`, with rejections in `reviewer-rejected-output.json`. There is no retry.
- **7:** The same finding repeats three times. The skill says stop, but a weak agent keeps looping.
- **8:** "Done" is reported while unit was skipped. The skill says it must appear under **Not verified**; a weak agent hides it.

**Result:** code landed, a regression test is missing or weak, the review is
`partial` or `error` or never ran, and the report is at best honest about it.

### Exits and blocks

- ⛔ R, and ⛔/⏸ P.
- ⏸ The plan conflicts with the request or evidence: ask which governs.
- ⏸ A finding would expand scope, contradict the plan, or needs a product decision.
- ⏸ Step 5: offer to skip the review.
- ⏸↩ Review authorization: `propose` commands, selection over the limit, selector scripts. Each run answers with `--approve`/`--decline`. **F1 turns the selector decline into an infinite gate.**
- ⛔ Review exits: `nothing-to-review`, `input-too-large` (over 50 files, 2000 lines or 512 KiB), `snapshot-too-large` (fixed with `--exclude`), `working-tree-changed`, `unmerged-index`, `reviewer-unavailable`, `reviewer-isolation-unavailable`.
- ↩ The finding-fix loop is bounded only by "same issue without new evidence, then stop".
- No commit, push, MR or ticket transition. This is text-only enforcement; `git commit` would raise a permission prompt, not a refusal.

---

## 8. `review`

Trigger: "review my change / branch / this MR", or "check against ORD-17".

### Best path A: branch review with a requirement

| # | Agent does | Tool / command | Why it goes well |
|---|---|---|---|
| 1 | Sees a requirement and runs R first. | R | Requirements are checked before any cost. |
| 2 | Chooses one target: `--branch`, with `--base origin/develop` if config has no baseline. | — | One target per run. |
| 3 | Runs the review with default text output, for reading back. | Bash `$A review --branch --requirement <u> --evidence - <<'EVIDENCE' …` | Same bundle as in `task` 6.1–6.4. For a branch review with a dirty checkout, every check carries a "revision note". |
| 4 | Reads the four parts back in order: reviewed / findings / check evidence / not covered. | text | An empty list is stated as "nothing material within scope", not "clean". |

### Best path B: GitLab MR

| # | Agent does | Tool / command | Why it goes well |
|---|---|---|---|
| 1 | Passes the full MR URL. | Bash `$A review --mr https://gitlab.x/group/sub/proj/-/merge_requests/42` | `glab` resolves the host, project and iid. The SHAs are pinned. The checkout is untouched. Discussions are shown as untrusted evidence. |
| 2 | Relays the result: executable checks are skipped (no digest-pinned image), test files are left out (no `--with-tests`), and any GitLab-collapsed files are listed as omissions. | text | Gaps are reported as gaps, not passes. |
| 3 | There are findings, so it starts the page without asking. | Bash (run_in_background) `$A view --review MR_42_2026-…` | The page runs on `127.0.0.1:45831` and opens in the browser. |
| 4 | Gives the URL as a markdown link. | text | The URL carries the session token. |
| 5 ⏸ | The human selects findings and presses Submit on the page. | browser | Publication is always a human act: a lease plus a staleness check against the pinned SHAs. |

### Worst path that completes

- **1:** The user said "against ORD-17", but retrieval failed. The agent quietly runs a quality review and reports "no problems". The skill forbids this; only the text enforces it.
- **2:** It passes `--base` without `--branch` (`baseline-not-applicable` ⛔), then corrects.
- **3:** For the MR, `glab` works, but the MR is a fork, so files are unreadable and become omissions. The diff was capped by GitLab. No image, so every check is skipped. The reviewer returns 0 findings.
- **4:** The agent summarizes this as "MR looks good, tests pass". Every reporting rule in the skill forbids it.
- **5:** Starts `view` for a local review, which the skill forbids, or runs it in the foreground and blocks the session until the 30-minute idle timeout.

**Result:** a `partial` review with zero findings over an incomplete diff,
reported as clean.

### Exits and blocks

- ⛔ R.
- ⛔ `config-missing` (the skill says ask for `/ambicode:init`).
- ⛔ `conflicting-target`, `baseline-not-applicable`, `baseline-missing`, `baseline-unresolvable`, `no-merge-base`.
- ⛔ `unsupported-target` / `provider-unsupported` (a GitHub URL; offer `--branch` instead).
- ⛔ `provider-resolve-failed` / `provider-fetch-failed` (`glab` missing, not authorized, or the MR unreadable).
- ⛔ `nothing-to-review`, `input-too-large`, `snapshot-too-large` (⏸ ask once, re-run with `--exclude`), `working-tree-changed` (wait and retry), `unmerged-index`.
- ⏸↩ Authorization gate: same as task 6.2, **including F1**.
- ⛔ `reviewer-unavailable`, `reviewer-isolation-unavailable`.
- Completes as `error` (not an exit): reviewer timeout, spawn failure, or rejected output.
- View: `review-not-found`, `review-ambiguous`, `review-outside-repository`. On submit: lease `held`, a `stale` MR (the head moved), or GitLab `unavailable`.

---

## 9. Defects and gaps the walkthrough surfaced

**F1: `--decline` on a selector key is ignored, so the review gate never releases.** Reproduced.
In `src/checks/run.ts:134-151`, a `propose` selector that is not approved
always pushes a pending approval. `options.declines` is consulted only for
the check key (`:220`). The review skills tell the agent to answer each
waiting key with `--approve` or `--decline`. For `<project>/<check>:selector`,
declining changes nothing, and every re-run stops at the same gate. This
breaks the CLAUDE.md rule "an approval with no way to decline leaves the
caller stuck forever". Scratch test (scratchpad, not in the repo):

```
pending after decline: ["web/unit:selector"]
AssertionError: expected [] … actual [{ approvalKey: 'web/unit:selector', … }]
```

No existing test covers declining a selector (`grep ":selector" src/**/*.test.ts`
matches only the approve path at `checks.test.ts:651-666`).

**F2: The `PostToolUse` edit hook is inert by default.** No built-in pack sets
`remindOnEdit`, so the Edit/Write interception costs one node spawn per edit
and emits nothing unless a team pack opts in.

**F3: `outcomes.md` claims to list "every outcome id this pipeline emits". It does not.**

```
code                             outcomes.md  any skill file
requirements-server-unrecorded   0            0
requirements-undeclared          0            0
requirements-duplicated          0            0
requirements-empty               0            0
requirements-ambiguous           0            0
requirements-invalid             0            0
requirements-unparsable          0            0
requirements-unreadable          0            0
requirements-invalid-url         0            0
preparation-too-large            0            0
reviewer-unavailable             0            0
no-merge-base                    0            0
baseline-unresolvable            0            0
config-invalid                   0            0
```

Also, `$A --help` (`src/cli/main.ts:85-131`) does not list `--decline` or
`--task` for `review` and `bundle`, although both are parsed
(`src/cli/target-option.ts:14-15`).

**F4: The one-directory-per-task continuity breaks for source-free work.**
Investigate and plan each build `<kebab>_<timestamp>` slugs with their own
timestamp. `task` never says how to derive `--task <slug>`. Without that flag,
a source-free review goes to `.ambicode/reviews/`, not to the task directory.
With a ticket, the slug is the envelope `id` the agent chose. A different
`id` between runs splits the directory too. Found by reading, not reproduced.

**F5: The task skill does not mention `--only` for a dirty tree.** It says
"name those files" but not how to keep them out of the review. `outcomes.md`
mentions `--only`, but a task agent reads that file only when a run fails.

**F6: The task instruction "format what you wrote" has no sanctioned tool.**
Bash is limited to `ambicode` and read-only git, and Scope forbids project
commands outside `review`.

**F7: `rules` activates packs before its final confirmation gate.** Step 6
wires the packs into `config.yaml`. Step 8 is "the last review gate".
Declining there has no stated rollback.

**F8: All "never" rules are text-only.** There is no `PreToolUse` hook.
`task` pre-allows `Edit(**)` and `Write(**)`, and investigate and plan
pre-allow `Write(.ambicode/task/**)`, so an agent that saves an unaccepted
plan, commits, or edits outside its intent meets at most a permission prompt
(git commit), and often nothing at all.

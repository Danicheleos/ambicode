# AMBICODE skills: the perfect walkthrough

Report 2 of 2. It describes how each skill *should* behave, step by step,
when everything is designed right. It is a target, not today's behaviour.
Where it differs from today it says so, and every design choice points back
to the evidence in [archive/skill-best-practices.md](archive/skill-best-practices.md) (§ and
row ids such as C1 or A4). Today's behaviour is in
[archive/skill-walkthrough.md](archive/skill-walkthrough.md).

**Correction, 2026-09-30.** This report cites "today" figures from four eval
runs. Those runs differ by **model**, not by plugin version: Opus 5.5 first,
then Sonnet 5.5 three times. The "helper-ran 26/30, then 1–2/10" and
"review fired 0/24, 0/8" figures come from that model change. The traces show
that Sonnet skips `prepare` and does not pick the review skill unless the
prompt names it. The comparison and the plan built on these facts are in
[skill-gap-plan.md](skill-gap-plan.md).

**Notation.**
- `$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`.
- 🆕 = does not exist today.
- 🪝 = a hook runs.
- ⏸ = a human gate, always shown with its release.
- ⛔ = hard exit, always shown with its way out.
- **Actors:** Agent (the model in the user's session), CLI (`$A`), Hook
  (Claude Code runs `$A hook`), Human.

---

## 0. The design in one page

The research gives five rules. Everything below follows from them.

1. **Code runs fixed steps; the model makes judgments** (B3, C2; course B2).
   Anything done identically every time moves into the CLI: config check,
   requirement validation, preparing, git baseline, file naming, report
   skeleton. The model keeps what only it can do: read, reason, decide, write
   code, and talk to the human.
2. **Hooks enforce the "never" rules; the text explains them** (C1). The
   skills keep the reasons, and a `PreToolUse` guard denies the act.
3. **Evidence comes from the record, not from memory** (D1). The CLI and
   hooks append to one plain, append-only JSONL ledger per task. Reports cite
   ledger ids, and a `Stop` hook checks them.
4. **Every gate has a release, and both paths are tested** (C4).
5. **The plugin is judged on Δ, cost and turns against the no-plugin arm,
   with ≥3 runs** (F-1, F-2; §5). A step that does not move Δ is a candidate
   for deletion.

### 0.1 The ledger 🆕

`.ambicode/task/<slug>/ledger.jsonl` is written by the CLI and hooks, never
by the agent. It is gitignored like the rest of `.ambicode/task/`.

```jsonl
{"id":"L1","at":"…","kind":"prepare","activity":"task","paths":["src/orders/validate.ts"],"policyHash":"…","shortlist":["src/orders/validate.ts","src/orders/order.service.ts"]}
{"id":"L2","at":"…","kind":"baseline","dirty":["README.md"],"head":"a1b2c3d"}
{"id":"L3","at":"…","kind":"requirement","id":"ORD-17","via":"mcp__atlassian__getJiraIssue","rawHash":"sha256:…","envelopeHash":"sha256:…"}
{"id":"L4","at":"…","kind":"check","key":"web/unit","only":"src/orders/validate.spec.ts","exit":1,"phase":"red"}
{"id":"L5","at":"…","kind":"check","key":"web/unit","only":"src/orders/validate.spec.ts","exit":0,"phase":"green"}
{"id":"L6","at":"…","kind":"review","reviewId":"local_2026-09-30T11-02","status":"complete","findings":2}
{"id":"L7","at":"…","kind":"acceptance","what":"plan","answer":"Accept and save","tool":"AskUserQuestion"}
```

**Why it is allowed despite "no task database".** It holds no workflow state
that drives the agent. It is an evidence log the agent cannot author, and it
is the only way to turn today's self-reported lines (navigation, "red before
green", "accepted") into checkable facts.

**Pushback.** It is one more artifact to keep. Cap it at one file per task,
append-only, with no schema migrations: a reader skips unknown kinds.

### 0.2 Hooks in the perfect design

| Event | Matcher | Does | Today |
|---|---|---|---|
| `SessionStart` | all | Injects the contract (≤300 words) once per epoch. | Same, 370 words. |
| `UserPromptSubmit` | all | Re-injects the contract after compaction. **Also re-injects a 3-line pointer to every shared procedure the active skill uses**, because reference files read earlier were cleared by compaction (A4). | Contract only. |
| `PreToolUse` 🆕 | `Bash` with `if: Bash(git commit*)`, `git push*`, `git stash*`, `git reset*`, `git checkout*`, `git clean*`, `glab mr *`; `Write\|Edit` | **deny** git write operations. **deny** writes to `.ambicode/task/**/plan_*.md` except through `$A note save`. **ask** (never deny) for an Edit outside the paths the task prepared for, with the reason in the prompt. | None (F8). |
| `PostToolUse` | `Edit\|Write` | Rule reminders marked `remindOnEdit`. | Same, but inert: no pack opts in (F2). The built-in packs should mark their 3–5 highest-value rules. |
| `PostToolUse` 🆕 | `AskUserQuestion\|ExitPlanMode` | Records the human's answer as an `acceptance` ledger entry. | None. |
| `PostToolUse` 🆕 | `mcp__.*__(getJiraIssue\|getConfluencePage.*)` | Records the SHA-256 of the raw retrieved text (D2). | None. |
| `Stop` 🆕 | all, active skill only | Checks the report against the ledger: required sections present, every `path:line` exists, every skipped or declined check in the ledger appears under **Not verified**, no "accepted" claim without an acceptance entry. On failure it blocks once with the list; `stop_hook_active` prevents a loop. | None. |
| `SessionEnd` | all | Cleans up hook markers. | Same. |

**Pushback, and the budget for it.**
- `PreToolUse` fires on every Bash, Write and Edit call. The guard must be a
  static matcher with no node start for non-matching tools: use the hook
  `if:` filter, so node runs only on a match. Target: under 50 ms added to a
  matched call. Measure before and after with `/usage` and a timed
  transcript.
- The `Stop` hook can nag. It blocks once and only for mechanical mismatches.
  It never judges prose quality.
- The `PostToolUse` on `AskUserQuestion` relies on the tool response carrying
  the chosen option. **Verify this before building on it.** If it does not,
  the fallback is a `$A accept --plan <file>` command the page or the human
  runs, which is weaker.

### 0.3 What each skill loads

The target is at most 3 modules per activity (B1; SkillsBench 1–3 modules
+19 pp versus 4+ at +10 pp).

| Activity | Today | Perfect |
|---|---|---|
| task | body + requirements-mcp + prepare-output + contract + prompts = 5 | body (≤3k tok) + CLI work order (which carries the prepare rules inline) + contract = 3 |
| review | body + requirements-mcp + outcomes (on failure) + contract = 3–4 | body + CLI output (which carries the next action per outcome id) + contract = 3 |

`prepare-output.md` disappears as a separate read. The work order explains
itself in a 5-line header (§1). `requirements-mcp.md` shrinks to the
envelope skeleton, which `$A requirements template` prints on demand.

---

## 1. Shared sub-chains

### R★. Requirement retrieval (investigate, plan, task, review; rules R1–R3)

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| R1 | Agent | Gets the binding **and** the envelope skeleton in one call. | Bash `$A requirements template --requirement <url>… --json` 🆕 | — | One call returns `mcpServer`, the URL→id mapping the CLI will accept, and a skeleton with every field present (including `retrievedVia`). The strict zod schema is satisfied by construction, so the `requirements-invalid` family (F3) cannot happen. |
| R1a ⏸ | Human | Only if `mcpServer` is null and several servers are connected: picks one. | AskUserQuestion: options = the connected server names, plus *Continue without requirements* | — | The release is the "without" option, clearly labelled. |
| R2 | Agent | Retrieves each URL through the bound server. | `mcp__<bound>__getJiraIssue` / `getConfluencePage` | 🪝 PostToolUse records `rawHash` in the ledger 🆕 | The hash is taken from the tool result, not from the agent's copy. |
| R3 | Agent | Fills the skeleton: `content` verbatim, `sourceVersion` and `updatedAt` from the source or `null`, and any prose `conflicts` it sees. | none | — | The agent does the only part code cannot: spot contradictions in prose. |
| R4 | Agent → CLI | Pipes the envelope to the consuming command. | `$A <cmd> … --evidence - <<'EVIDENCE'` | — | The CLI compares each `content` hash with the ledger's `rawHash` after normalization, then refuses with `requirements-paraphrased` 🆕 on a mismatch. **Paraphrase stops being undetectable.** |

**Exits, each with its release:**

| Exit | Cause | Release |
|---|---|---|
| ⛔ `requirements-server-disconnected` | The bound server is not connected (this session: Atlassian Rovo needs auth). | The message names the fix: "authorize `<server>` in claude.ai connector settings". The agent offers source-free work as a separate labelled choice ⏸. |
| ⛔ `requirements-unavailable` | Status is not `retrieved`. | Same offer. |
| ⛔ `requirements-conflicting` | The agent reported a conflict. | ⏸ "Which source governs?" The answer goes into the envelope as `resolution`. |
| ⛔ `requirements-paraphrased` 🆕 | `content` differs from the raw text. | Re-send verbatim. There is no human gate: it is a mechanical fix. |

### P★. Preparation (investigate, plan, task)

Today `prepare` needs the agent to know the shape, the stages and the
navigation rules from a separate 831-word file. In the perfect design,
`prepare` returns a **work order** that explains itself.

```sh
$A prepare --activity task --json --task-open "<request>" \
  [paths…] [--requirement <u>… --evidence -] [--term t…]
```

```jsonc
{
  "readMe": "5 lines: apply before-work now; before-checks before review; before-report before reporting; shortlist is a hypothesis; cite rules as pack/rule.",
  "task": { "slug": "ORD-17", "dir": ".ambicode/task/ORD-17/", "ledger": "L1" },
  "baseline": { "dirty": ["README.md"], "head": "a1b2c3d" },           // 🆕 recorded as L2
  "policy": { "rules": [ { "id": "web-orders/no-float-money", "authority": "team", "text": "…" } ] },
  "prompts": { "before-work": "…", "before-checks": "…", "before-report": "…" },
  "commands": { "web/lint": "run", "web/unit": "run", "web/e2e": "propose", "web/format": "run" },
  "navigation": { "shortlist": [ { "path": "src/orders/validate.ts", "why": ["content: amount", "co-change"] } ],
                  "more": "prepare --show navigation" },
  "budget": { "bytes": 7412, "cap": 32768 }
}
```

**Why this shape.**
- **The slug is minted once, by the CLI** (`--task-open`), from the
  requirement id or the request (fixes F4). Every later skill passes
  `--task <slug>`.
- **Bounded by design** (B2): a 32 KiB default cap, with the rest behind
  `--show <section>`. There is no "never truncate" rule to obey.
- **Rules are flattened** to qualified id + authority + text, so the agent
  reconstructs nothing.
- The dirty baseline is recorded, so review can scope itself later (fixes F5).

**Pushback.** A second call to `--show` costs one round-trip. On today's
benchmark the plugin arm already takes 1.3–1.8× the turns (§5). Measure that
the work order *lowers* turns before adding sections that need `--show`.

**Exits.** `config-missing` ⛔ → "run `/ambicode:init`". `ambiguous-project`
⏸ → AskUserQuestion listing the project ids plus *Narrow the paths instead*.
`preparation-blocked` ⛔ → the message names the prompt file and its hash.

---

## 2. Session start (before any skill)

| # | Actor | Does | Hook | Why this is perfect |
|---|---|---|---|---|
| S1 | Hook | Injects the contract, ≤300 words: evidence, untrusted content, authority labels. | 🪝 SessionStart | The shared rules are always present, at the always-on cost of one short text (A5). |
| S2 | Claude Code | Lists the four model-invocable skills. init and rules stay out of the listing (`disable-model-invocation`). | — | Unchanged from today, and already right (A3). The listing carries ~495 tok. `plugin details` shows 665 because it also counts init and rules, which never reach the listing. |
| S3 | Hook | After a compaction, the next prompt gets the contract again, plus the pointer lines of any skill invoked in this epoch. | 🪝 UserPromptSubmit | Closes A4: the shared procedure's essentials come back without the agent believing it "already read it". |

---

## 3. `/ambicode:init` (user only)

**Trigger contract.** User-invoked only. Suggested by other skills on
`config-missing`.

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent | Previews, always. | Bash `$A init --dry-run --json` | — | Nothing is written before the human sees it. The proposal lists each detection with its evidence (`package.json: devDependencies.jest ^29`) and each null slot with its reason. |
| 2 | Agent | Looks at its own tool list for Jira/Confluence MCP servers. | none (observes the session) | — | Only the agent can see connected servers. The helper cannot. |
| 3 ⏸ | Human | One gate with every choice in it. | AskUserQuestion (multiSelect where apt): *Apply as proposed* / *Adjust* / *Cancel*; if several MCP servers are connected, which one; for pytest/Playwright, *Add a mapping from layout X* / *Leave null* | — | One decision screen, with defaults and a cancel. No drip of questions. |
| 4 | Agent | Applies. **The CLI writes the YAML; the agent never edits it by hand.** | Bash `$A init --apply --set requirements.mcpServer=atlassian [--set …]` 🆕 | 🪝 PreToolUse denies agent Edit/Write of `.ambicode/config.yaml` while `init` is active 🆕 | Comments survive, and the file cannot drift from the proposal. Today `allowed-tools` pre-grants the agent Edit on the file. |
| 5 | CLI | Self-test: for every non-null command, runs its `--version` or an empty selection, and resolves every `argv[0]`. | inside `$A init --apply`, or `$A doctor` 🆕 | — | "Configured" becomes "proven to start", before the first review finds out. |
| 6 | Agent | Reports a table: project × check → *proven* / *null: reason* / *failed: output*. Quotes the notices verbatim, gives the LSP recommendation, and offers `/ambicode:rules` if sources were found. | none | 🪝 Stop checks the table against the CLI result 🆕 | The report cannot claim a check the doctor did not prove. |

**Gates and exits.**
- ⛔ `not-a-repository` → "run inside a git repository", with nothing written.
- ⏸ An existing config → the dry run shows a **diff**. *Apply adds only
  missing slots* is the default, *Cancel* is the release.
- ⛔ `config-unparsable` → shows the parser error line and offers
  *Back up and regenerate* ⏸ or *Stop*.

**Measured acceptance.** 100% of non-null commands pass the doctor. The agent
makes 0 hand edits to YAML (the PreToolUse deny count, checked from the
trace). Median time from command to a written config is under 60 s.

**Difference from today.** The dry run is mandatory. There is one decision
gate. The CLI writes the MCP binding. The doctor is new. The agent has no
hand-edit path.

---

## 4. `/ambicode:rules` (user only)

**Trigger contract.** User-invoked. Suggested by init when rule sources
exist.

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent | Discovers candidate sources through the CLI, not by guessing globs. | Bash `$A rules discover --json` 🆕 → paths, sizes, heading counts | — | Deterministic, and it lists only files that exist. |
| 2 ⏸ | Human | Picks the sources. | AskUserQuestion multiSelect, with *None — stop* as the release | — | Presence is not a mandate. |
| 3 | Agent | For Confluence, R★ R1–R3 (the envelope is used only for its hash). | R★ | 🪝 rawHash | Same honesty as requirements. |
| 4 | Agent | Reads the config and the built-in rules. | Bash `$A config --json`; `$A policy --project <id> --activity review <path> --json` | — | Deduplication against real built-in rules. |
| 5 | Agent | For each source rule, drafts one entry with **`source.quote`** (verbatim) 🆕, `source.location`, a proposed scope glob, and `authority: observed` unless the human says otherwise. | Write(`.ambicode/policies/drafts/<id>.yaml`) 🆕 staging directory | 🪝 PreToolUse denies writes to `.ambicode/policies/*.yaml` outside `drafts/` while `rules` is active 🆕 | The quote is the defence against model-invented rules (C5). Drafts are not live. |
| 6 ↩ | CLI | Validates, bounded to 3 rounds. `policy check` now also checks that each `source.quote` occurs in the named file (for local files) and flags a duplicate of a built-in rule by id and by text similarity. | Bash `$A policy check --drafts --project <id>` | — | Verifies what the schema cannot: that the quote exists, that the glob matches files, that nothing is duplicated. **After 3 rounds a rule still failing moves to "Not migrated: cannot be expressed" with the CLI's reason.** That bounds the loop. |
| 7 ⏸ | Human | **The disposition table comes before anything goes live** (fixes F7). Every source rule is shown as → pack/rule, → dropped (why), or → needs a decision. Each `authority: team` needs a tick. | AskUserQuestion: *Apply all* / *Apply with these changes* / *Discard drafts* | — | The last gate precedes activation. *Discard* is the release, and it leaves nothing behind. |
| 8 | CLI | Applies: moves the drafts into `.ambicode/policies/`, wires `policyFiles` with the comment-preserving YAML API, and runs the scope probes itself (one covered path, one uncovered, per pack). | Bash `$A rules apply` 🆕 | — | The agent does no YAML editing, and the probes cannot be skipped. |
| 9 | Agent | Reports the table, the probe results and the undo command. | none; `$A rules revert <pack-id>` 🆕 is quoted | 🪝 Stop: every wired pack has probe results 🆕 | Undo is one command. |

**Measured acceptance.** 0 `pack-glob-matches-nothing`. 0 duplicates of
built-ins. 100% of quotes verified. 0 packs live before step 7. A
disposition table covers 100% of the source rules: the count of source
headings/bullets equals the table rows, checked by the CLI.

**Difference from today.** Drafts are staged. Quotes are verified.
Confirmation comes before wiring. The CLI does the wiring and the probes.
The loop is bounded. There is a revert.

---

## 5. `investigate`

**Trigger contract.** *Should* fire on: "how does X work", "why does Y
happen", "which files would changing Z touch", "what would it cost", a bare
Jira/Confluence URL. *Should not* fire on: "implement/fix/add" (task),
"plan/approach" (plan), "review" (review), or general knowledge questions.
The description leads with "Explain or locate, never edit".

**Scenario.** The user pastes `https://…/browse/ORD-17` ("Reject negative
order amounts").

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent | Retrieves the ticket. | R★ | 🪝 rawHash | Source text is in context before any code is read. |
| 2 | Agent | Reads it. It states a concrete question, so it asks nothing. If it were vague: one question, with the options drawn from the ticket. | none / ⏸ AskUserQuestion | — | No wasted turn, and no "what do you want?". |
| 3 | Agent → CLI | Prepares and opens the task. | Bash `$A prepare --activity investigate --json --task-open ORD-17 --requirement <u> --evidence - --term amount --term order src/orders` | ledger L1–L3 | Slug `ORD-17`; a work order under 8 KB with a shortlist. |
| 4 | Agent | Navigates: shortlist, then LSP (definition and references of `validateOrder`), then targeted Grep; reads spans with offset/limit only. | LSP / Read(offset, limit) / Grep | — | Minimal reading. Every claim gets a `path:line`. |
| 5 | Agent | Holds ≥2 hypotheses (the DTO validates? the service validates?) and checks each, confirming or rejecting each shortlist item with a reason. | Read / Grep | — | It does not stop at the first match. |
| 6 | Agent | Applies `before-report`, then writes the answer: **Confirmed facts / Assumptions / Unresolved / Recommendation / What would change this**. It omits the navigation line: the hook writes that. | none | — | The agent writes the judgment and none of the bookkeeping. |
| 7 | Hook | Computes the navigation evidence from the transcript: which LSP operations ran, which files were read, which shortlist items were read or never opened. Checks that every cited `path:line` exists and is within the file's length. | 🪝 Stop 🆕 → appends `Navigation: …` via `$A note save` | — | **The navigation line becomes a measurement, not a claim** (D1). A bad citation blocks once with the list. |
| 8 | Agent | Saves the note through the CLI. | Bash `$A note save --task ORD-17 --kind investigation <<'NOTE' … NOTE` 🆕 | 🪝 PreToolUse denies direct Write of `.ambicode/task/**` 🆕 | The CLI owns the file name, the timestamp and the "investigation note" label. The note lands next to the plan (F4). |
| 9 | Agent | One line: where the note is, and that the ticket answer is X. | none | — | The answer leads. |

**Gates and exits.** R★ exits. P★ exits. ⏸ A diagnostic command
(reproduce, print a value): proposed with its argv, reason and expected
evidence; it runs only after an explicit *Run it* **and** a policy
`run/propose` decision, through `$A check …` 🆕. The release is *Don't run —
answer as inconclusive*.

**Measured acceptance, against the benchmark's localize cases, ≥3 runs.**
- **Recall with the plugin ≥ recall without.** Today 0.50–0.67 against
  0.70–0.79: this is the headline defect to fix.
- Cost ≤ 1.1× the no-plugin arm. Today 1.25–1.6×.
- Turns ≤ the no-plugin arm + 2. Today +2.6 to +5.9.
- 100% of cited `path:line` exist (Stop hook count).
- `helper-ran` ≥ 95% of the plugin runs. Today 26/30, then 1–2/10.

**Difference from today.** The CLI mints the slug and saves the note. The
Stop hook generates the navigation line and checks citations. There is a
recall target against the no-plugin arm. A diagnostic runs through a
sanctioned command.

**Pushback to measure first.** The benchmark says the plugin arm names fewer
files (5.2–5.6 against 5.4–7.9) and recalls less in every run. The perfect investigate may
need *less* ceremony, not more. Test a variant whose only change is "read the
shortlist, then name every file you would touch, then stop", and keep
whichever wins on recall and cost.

---

## 6. `plan`

**Trigger contract.** *Should* fire on: "plan", "roadmap", "how should we
approach", "think through before coding", a URL with a planning verb.
*Should not* fire on: "implement" or "fix" (task), unless the user adds
"plan first".

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent | Keeps the whole request span. Retrieves the sources (R★) and reads them before asking anything. | R★ | 🪝 | The request stays intact. |
| 2 | Agent → CLI | Prepares, reusing the slug if an investigation opened one. | Bash `$A prepare --activity plan --json --task ORD-17 …` | ledger | The same task directory holds the investigation note. |
| 3 | Agent | Reads the investigation note if one exists (`$A note list --task ORD-17` 🆕), then callers, boundaries, tests and **existing implementations** (Grep for `validate`, `amount`, `assert*`). | Bash, LSP, Read spans, Grep | — | "A new helper where one exists is a defect", checked before designing. |
| 4 ⏸ | Human | One question per **material** decision, with the options, the cost of each and a recommendation. | AskUserQuestion, one at a time | 🪝 PostToolUse records each answer 🆕 | Decisions are captured as evidence, not as memory. |
| 5 | Agent | Presents the plan: outcome, sources, current behaviour, exclusions, design and rejected alternatives, consequences, reuse, **iterations as briefs**. Each brief names the test that must fail first and the checks by key (`web/unit: validate.spec.ts`). | text | — | `task` can start an iteration without re-deriving anything, and the "Checks" field is machine-readable. |
| 6 ⏸ | Human | Acceptance is a click. | ExitPlanMode in plan mode, otherwise AskUserQuestion *Accept and save* / *Revise* / *Reject* | 🪝 PostToolUse writes `acceptance` to the ledger 🆕 | The release is *Reject*; ↩ *Revise* goes back to step 3. |
| 7 | Agent | Saves. | Bash `$A note save --task ORD-17 --kind plan <<'PLAN' … PLAN` 🆕 | 🪝 PreToolUse: **deny** unless the ledger has an `acceptance` entry after the latest presentation 🆕 | "Never save an unaccepted plan" is **enforced**, not requested (C1, F8). |

**Gates and exits.** R★. P★. ⏸ Each material decision (release: *Keep open —
plan stays draft*). ⏸ Acceptance (release: *Reject*). No reviewer and no
checks.

**Measured acceptance.**
- 0 plans saved without an acceptance entry, enforced and covered by a hook
  test.
- 100% of iterations name a failing-first test and check keys (CLI lint on
  save: `$A note save --kind plan` validates the brief headings).
- 0 plans that propose a new helper where the codebase has one. An LLM judge
  checks the "Dependencies to reuse" section against a Grep of the named
  concept, calibrated per course B5 before it gates anything.

**Difference from today.** The slug is shared. Decisions and acceptance are
recorded. The save is guarded. The brief format is linted.

---

## 7. `task` (with the internal review)

**Trigger contract.** *Should* fire on: "implement", "add", "fix", "build",
"go ahead with the plan", "resume ORD-17", a URL with an implementation
verb. *Should not* fire on: questions (investigate), "plan", "review".

**Scenario.** "Go ahead with iteration 1 of the ORD-17 plan."

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent | Reads the accepted plan (`$A note list --task ORD-17`). The user's words are the authorization. Retrieves ORD-17 (R★). | Bash, Read, R★ | 🪝 | A plan is evidence; the human authorizes. |
| 2 | Agent → CLI | Prepares with the paths from the iteration brief. The CLI records the git baseline. | Bash `$A prepare --activity task --json --task ORD-17 src/orders/validate.ts src/orders/validate.spec.ts --requirement <u> --evidence -` | ledger L1 prepare, L2 baseline `dirty: [README.md]` | The pre-existing dirty file is recorded, not just mentioned (F5). |
| 3 | Agent | Tells the user in one line: "README.md was already modified; it stays out of this task's review." | none | — | Honest and actionable. |
| 4 | Agent | Reuses `validateOrder` (confirmed from the shortlist and LSP references). **Red:** writes the regression test and runs **only that test**. | Edit `validate.spec.ts`; Bash `$A check --task ORD-17 web/unit --only src/orders/validate.spec.ts` 🆕 | 🪝 PostToolUse remind rules; ledger L4 `exit 1, phase red` | A sanctioned, policy-authorized single-test run proves "fails before the fix". Today task cannot run a test outside `review`. |
| 5 | Agent | **Green:** the smallest fix, then the same command again. | Edit `validate.ts`; Bash `$A check … --only …` | ledger L5 `exit 0, phase green` | Red and green are both in the ledger, so "the test fails without the fix" is proven. |
| 5a | Agent → CLI | If an edit reaches a path outside the prepared set: re-prepare. | Bash `$A prepare … <new paths>` | 🪝 PreToolUse **ask** on an out-of-set Edit gives the reason and the re-prepare hint 🆕 | Path-scoped rules cannot be missed silently. |
| 6 | Agent → CLI | Formats what it wrote with the configured formatter. | Bash `$A format --task ORD-17` 🆕 (new `format` command slot, run/propose/forbid) | ledger | Fixes F6: there is a sanctioned formatter path. |
| 7 ⏸ | Human | Offers the review with its measured cost. | AskUserQuestion: *Run review (~3 min, from the median of the last 5)* / *Skip — mark verification incomplete* | — | Both paths are real. Skipping is recorded as a gap. |
| 8 | CLI | Runs the review, scoped to the task: `--task` excludes the baseline's dirty files that the task did not touch, and says so. | Bash `$A review --task ORD-17 --requirement <u> --evidence -` | ledger L6 | The default target no longer spends the reviewer on unrelated work-in-progress (F5). |
| 8.1 ⏸↩ | Human | A check waits (e2e is `propose`; the selector script is `propose`). The agent puts each one to the human with its argv and reason. | AskUserQuestion multiSelect: approve each / **decline each** | — | **Both answers release the gate** (F1 fixed and regression-tested). A declined check is reported as a gap, not a pass. |
| 8.2 | CLI | Checks → isolated reviewer (`claude --print --safe-mode --restricted --tools Read,Grep,Glob`) → validation. | — | — | Unchanged: this part of AMBICODE is already strong (C6). |
| 8.3 | CLI | On a bad location: **drop that finding, keep the valid ones, record the rejection, and mark the status `partial`** rather than voiding everything. | — | — | See the pushback below. |
| 9 | Agent | Verifies each finding against the code, fixes the accepted in-scope ones, and re-runs review once. The loop is bounded at 2 review runs per iteration. | Read, Edit, `$A check --only`, `$A review --task …` | ledger | Bounded by count, not by "without new evidence". |
| 10 | Agent → CLI | Gets the report skeleton. | Bash `$A report --task ORD-17` 🆕 prints **Evidence** and **Not verified** from the ledger: checks with outcomes, red/green, review id and status, declined keys, omissions | — | The agent cannot forget a gap it never wrote down. |
| 11 | Agent | Writes **Done** and **Remaining** in prose and pastes the CLI parts verbatim. Writes `notes.md` only if the plan has more iterations. | none; `$A note save --kind notes` | 🪝 Stop: the report contains the CLI parts unchanged, and every ledger gap is listed 🆕 | "Done while unit was skipped" becomes mechanically impossible to hide. |

**Gates and exits.**
- R★, P★.
- ⏸ The plan conflicts with the request. Release: *Follow the request* /
  *Follow the plan* / *Stop*.
- ⏸ A finding expands scope. Release: *Out of scope — list under Remaining*.
- ⏸ Review offer. Release: *Skip*.
- ⏸↩ Check authorization. Release: decline, which is now honoured for
  selector keys.
- ⛔ `input-too-large`. Release: the message proposes `--only` with the
  task's own files.
- ⛔ `reviewer-isolation-unavailable`. Release: "update Claude Code to ≥
  <version>" is printed.
- 🪝 PreToolUse denies `git commit` / `push` / `stash` / `reset` /
  `checkout`, with no release: the human does these outside the skill, by
  design.

**Measured acceptance, on benchmark task cases, ≥3 runs.**
- For defect tasks: red then green in the ledger in 100% of runs.
- A "Not verified" section that covers every ledger gap, 100% (Stop hook).
- A pass rate on task cases with the plugin higher than without, beyond the
  spread. There are no task cases today; they need adding (course A4).
- Cost and turns reported next to it, gated at ≤1.2× the no-plugin arm
  unless the pass rate gain pays for it.

**Pushbacks.**
- `$A check --only` is a second route to running tests. It must reuse
  `runChecks` and the same authorization seam (extend the seam; do not add a
  parallel one), or it breaks "one pipeline owns selection".
- Partial acceptance of reviewer output (8.3) trades today's
  all-or-nothing honesty for recall. Keep it opt-in (`review.onInvalid:
  drop|void`, default `void`) until an eval shows that dropped-invalid runs
  produce no extra false findings.
- The `ask` on out-of-set edits adds prompts. Measure how often it fires on
  the benchmark. If it fires on more than 20% of edits, the prepare shortlist
  is too narrow, and that is the thing to fix.

---

## 8. `review`

**Trigger contract.** *Should* fire on: "review my change/branch", a GitLab
MR URL, "check this against ORD-17". *Should not* fire on: "fix the review
comments" (task), or GitHub PR URLs (the answer is: offer `--branch`).

### 8A. Branch review with a requirement

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent | Retrieves the requirement first. | R★ | 🪝 | Checked before any cost. |
| 2 | Agent → CLI | Estimates first: files, lines, selected checks, likely waits, expected duration. | Bash `$A review --branch --estimate --json` 🆕 (a dry `bundle` without checks) | — | The human sees the cost before paying it. It also catches `input-too-large` before the snapshot. |
| 3 | Agent → CLI | Runs it. | Bash `$A review --branch [--base origin/develop] --requirement <u> --evidence -` | ledger if `--task` | One target, one run. |
| 4 ⏸↩ | Human | Only if checks wait: approve or decline each, then one re-run carries every answer. | AskUserQuestion multiSelect | — | Both paths release (F1 fixed). |
| 5 | Agent | Reads back the four parts **as printed**: reviewed / findings / check evidence / not covered. The coverage sentence is CLI text, quoted, never composed by the agent. | none | 🪝 Stop: the reply contains the CLI's "not covered" block verbatim 🆕 | "Empty ≠ clean" is enforced by quoting, not by the agent's discipline (D3). |

### 8B. GitLab MR

| # | Actor | Does | Tool / command | Hook | Why this is perfect |
|---|---|---|---|---|---|
| 1 | Agent → CLI | `$A review --mr <full URL>` | Bash | — | The SHAs are pinned, the checkout is untouched, and discussions are shown as untrusted. |
| 2 | Agent | Relays the result, including omissions (collapsed or oversized files, an unreadable fork) and skipped checks (no pinned image). | none | 🪝 Stop verbatim check | Gaps stay gaps. |
| 3 | Agent → CLI | Findings exist, so it starts the page in the background without asking. | Bash (`run_in_background`) `$A view --review <id>` | — | Only a human can publish. |
| 4 | Agent | Gives the tokened URL as a markdown link. | none | — | It works when clicked. |
| 5 ⏸ | Human | Selects findings and submits. | browser | — | Publication stays a human act (E3). |
| 6 | CLI | **Records the selection:** offered, selected, edited before posting, and posted, per finding, into the review's `result.json` and a local `metrics.jsonl` 🆕. | inside `$A view` | — | The production precision signal Claude Code Review reports as "<1% marked incorrect" (D4). AMBICODE gets its own number for free, per repository and per rule. |

**Gates and exits.** R★. ⛔ Target errors (`conflicting-target`,
`baseline-*`, `no-merge-base`): each message says which flag fixes it. ⛔
`provider-*`: the message names `glab auth status`. ⛔ `input-too-large`:
suggests `--only` or `--exclude` with the largest directories listed. ⏸↩ The
authorization gate. On submit: a held lease, a stale MR (the head moved; the
release is "re-run the review on the new head"), or GitLab unavailable.

**Measured acceptance.**
- `complete` status on ≥90% of runs where no check waits.
- Thread recall on benchmark review cases ≥ the no-plugin arm with ≥3 runs.
  Today it is a wash: 0.08–0.15 against 0.08–0.17.
- The accepted rate (selected ÷ offered) tracked per repository. As a
  reference only, not a like-for-like target: independent-bench precision
  tops out at **76.2%**, and Anthropic reports **<1%** marked incorrect.
- The skill fires on 100% of explicit review prompts. Today 0/24 and 0/8 in
  two benchmark runs, 8/8 and 24/24 in the other two.

**Difference from today.** An estimate before spending. Decline works. The
coverage block is quoted verbatim and hook-checked. Selections are recorded
as a quality metric.

---

## 9. The whole chain, perfect path

```
/ambicode:init ─► doctor proves every check
        │
/ambicode:rules ─► drafts ─► table ⏸ ─► apply + probes (revertable)
        │
investigate(URL) ─► prepare --task-open ORD-17 ─► note save  ─┐   ledger.jsonl
        │                                                     │   (CLI + hooks only)
plan ─► decisions ⏸ ─► accept ⏸ ─► note save (hook-guarded)  ─┤
        │                                                     │
task ─► baseline ─► red ─► green ─► format ─► review ⏸ ────────┤
        │                    (decline releases every gate)    │
        └─► report = agent prose + CLI evidence (Stop-checked)┘
review --mr ─► view (bg) ─► human Submit ─► selection recorded as precision signal
```

## 10. The eval gate that proves "perfect"

Every item above is only a hypothesis until this gate passes (course A4, B5).

| Suite | Cases | Grader | Gate |
|---|---|---|---|
| Triggers | today's 8, plus 12 mixed-intent phrasings ("look at ORD-17 and fix it"), plus 5 negatives | `tool_used: Skill` with `min/max`, `arm: both` for negatives | ≥95% per case over 3 runs; unrelated: 0 fires |
| Localize (investigate) | the curated set, plus hard cases where the no-plugin arm fails | recall, F1 (code), `names-a-true-file` (judge, κ ≥ 0.6 on 60 labels) | recall(with) − recall(without) > spread; cost ≤ 1.1× |
| Task 🆕 | 10 defect tickets with a hidden failing test | the hidden test passes (code); red then green in the ledger (code); no weakened assertion (code diff check) | pass(with) − pass(without) > spread |
| Review | the curated set | thread recall (code); location validity (code) | ≥ the no-plugin arm; `complete` ≥ 90% |
| Gates | unit tests, no model | approve and decline for every key kind (check, selection, selector); PreToolUse deny and ask matrix; Stop hook block-once | 100%, in `npm run verify` |
| Cost | all of the above | `costUsd`, `turns` per arm | reported every run; ratio gated per suite |

The run policy: `--runs 3`, pinned `--model` and `--judge-model`,
`--max-cost-usd`, an `eval-gate` script on `meanDelta` and `partial`, and
trends excluding partial runs.

## 11. What changes, in priority order

Ordered by expected effect on the measured gap (§5 of report 1), then by
cost. Each item ships with its test, per CLAUDE.md.

1. **Fix F1**, the selector decline. A defect with a reproduction already in
   hand.
2. **Raise `--runs` to 3 and add the Δ gate.** Without this, nothing below
   can be judged.
3. **Investigate slimming experiment** (§5 pushback), because localize
   recall is the clearest measured regression.
4. **The ledger, `note save` and `--task-open`** (F4, D1): they unlock the
   Stop and PreToolUse checks.
5. **The PreToolUse guard** (F8, C1): git write operations and the plan-save
   guard.
6. **`review --task` baseline scoping** (F5), **`format`** (F6), and
   **`check --only`** for red/green.
7. **Stop hook report checks.**
8. **rules: staging, quotes, gate before wiring, revert** (F7, C5).
9. **init: `--apply --set` and the doctor.**
10. **Record selections on the view page** as the production precision
    metric.

## 12. What this report does not settle

- Whether the `PostToolUse` payload of `AskUserQuestion` carries the chosen
  option. That needs one probe before item 4 is designed around it.
- Whether investigate should do *less*. The benchmark suggests it; only the
  experiment in §5 can decide.
- The latency budget of the PreToolUse guard (target <50 ms per matched call)
  is unmeasured.
- None of the targets above has been run. They are the acceptance bar for
  the changes, not results.

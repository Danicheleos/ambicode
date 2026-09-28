# Investigation note v2 — how to evolve AMBICODE, extended with the VS-6735 full-cycle run

**This is an investigation note** — not an accepted plan, not a task, not a
decision record. It is the entry point for the planning agent described in
`gym/planing/PLANNER-README.md` (renamed from `README.md` on 2026-09-28; the
brief still says `gym/plan/`, and the working folder is `gym/planing/`). It supersedes `investigation_2026-09-28T20-45.md`
(kept unchanged for audit); everything from that note is carried in §4 and
§5, corrected where the new run contradicts it.

Question: given the eval sweeps, the prod review logs, the code, **and one
complete real cycle** (`/ambicode:investigate` → `/ambicode:plan` →
`/ambicode:task` ×2 with three reviews) on a large Angular feature, which ways
of evolving the plugin are dead ends and which are the strongest — and what
should a long-running autonomous training campaign measure and move?

## 0. How to audit and reuse this note

- Every fact is labelled. **CONFIRMED** = a number or a line I produced in
  this session, with its reference. **INFERRED** = follows from confirmed
  facts but was not itself measured. **UNVERIFIED** = stated by an artifact
  or an agent and not checked.
- References are `path:line` in this repository (branch `tuning`, HEAD
  `3e5e146`; the run used plugin **0.3.4** installed at
  `~/.claude/ambicode-install/marketplace/ambicode-0.3.4/`), an artifact
  under `gym/planing/investigation/cache/` (below: `cache/`), a session
  transcript, or a command with its output quoted here.
- Recompute the session numbers from the transcripts directly; they are
  JSONL. Sum `message.usage.*` over rows with `type == "assistant"`; count
  `message.content[]` blocks with `type == "tool_use"` by `name`; take wall
  time from the first and last `timestamp`; take human-wait from each
  `AskUserQuestion` tool_use to the `tool_result` that answers it (matched
  by `tool_use_id`). Commands for the other numbers are in §6.
- Two of the six same-day transcripts are **not in the cache**. They are at
  `~/.claude/projects/-Users-KillBill-Documents-projects-inseer-inseer-frontend/`:
  `8efdbd08-d9f5-45e9-b69e-98333a4275eb.jsonl` (the iterations 1–3 task
  session, whose reviews `local_…21-30` and `…21-38` are in the cache) and
  `9a235fc3-aa67-402d-8ef2-6e115f369eac.jsonl` (the MR !2696/!2689 review
  session the origin note's prod numbers come from). Copy them into
  `cache/VS-6735/` before the campaign starts; `~/.claude/projects` is not a
  durable store.
- The frontend repository at
  `/Users/KillBill/Documents/projects/inseer/inseer-frontend` (HEAD
  `873ec3923`) was read, linted and type-checked here, never modified.

## 1. Sources

Origin batch (unchanged): `cache/notes-eval-analysis.md`, `notes-course.md`,
`notes-anthropic-docs.md`, `perrun-*.txt`, `timeline-*.txt`,
`eval-2026-09-28T16-18-49-737Z.json`, `archive/logs/3.1`, `archive/logs/3.4`,
and the source cited in §4.

VS-6735 cycle (new), all under `cache/VS-6735/` unless noted:

| artifact | what it is |
|---|---|
| `investigate_5326e45c-….jsonl` | investigate session transcript (209 rows) |
| `investigation_2026-09-28T20-49.md` | the note it wrote (19,928 B) |
| `plan_6c376603-….jsonl` | plan session transcript (196 rows) |
| `plan_2026-09-28T21-06.md` | the accepted plan, 6 iterations (20,601 B) |
| `…/8efdbd08-….jsonl` (outside cache, see §0) | task session, iterations 1–3 (517 rows) |
| `task_ce1efd4c-….jsonl` | task session, iterations 4–6 (580 rows) |
| `notes.md` | the task note both sessions appended to |
| `reviews/local_2026-09-28T21-30/` | review after it1–3: `result.json`, `report.txt`, prompts, `checks/app/{lint,unit}.txt` |
| `reviews/local_2026-09-28T21-38/` | re-review after fixing one finding |
| `reviews/local_2026-09-28T22-13/` | review after it4–6 |

Environment of the run (CONFIRMED from transcript metadata): Claude Code
2.1.283 in VS Code (`entrypoint: claude-vscode`), model `claude-opus-5-5`,
effort `high`, branch `VS-6345_new-assessments-table`, no sidechains, no
subagents. Reviewer model `sonnet` (`.ambicode/config.yaml` in the FE repo).

## 2. The cycle in numbers

### 2.1 Sessions

All times UTC. `human-wait` is the sum of `AskUserQuestion` round-trips;
`agent-active` is wall minus human-wait. Tokens are summed over assistant
messages (`usage` fields).

| session | id | span | wall | human-wait | agent-active | asst. msgs | tool calls | output tokens | cache read | cache create |
|---|---|---|---|---|---|---|---|---|---|---|
| investigate | 5326e45c | 18:45:28–18:51:36 | 6 m 08 s | 8 s | 359 s | 73 | 35 | 65,007 | 6,359,524 | 243,875 |
| plan | 6c376603 | 18:52:23–19:08:04 | 15 m 41 s | 539 s | 401 s | 68 | 36 | 116,223 | 6,344,623 | 302,109 |
| task it1–3 | 8efdbd08 | 19:11:18–19:40:12 | 28 m 54 s | 4 s | 1,729 s | 180 | 84 | 363,832 | 35,756,329 | 758,711 |
| task it4–6 | ce1efd4c | 19:55:31–20:14:57 | 19 m 26 s | 35 s | 1,130 s | 173 | 88 | 289,551 | 32,502,169 | 566,096 |
| **cycle** | | 18:45:28–20:14:57 | **89 m 29 s** | **586 s** | **3,619 s** | 494 | 243 | **834,613** | **80,962,645** | **1,870,791** |

Tool mix over the 243 calls (CONFIRMED): Bash 163, Write 34 (three of them
the investigation note, the plan and the task note), MCP Atlassian 18 (getJiraIssue 15, resources 2, JQL
search 1), AskUserQuestion 8, Read 7, Edit 6, ToolSearch 6, LSP 1. Grep 0,
Glob 0, Agent/Task 0, Skill 0. Permission denials 4 (one per session:
`xargs wc -l` twice, `node -e` once, `python3 -c` over a tool-result file
once).

Same day, same repo, not part of the cycle: `/ambicode:init` (d081f958,
17:50, 23 s, 2 Bash calls) and the MR review session (9a235fc3, 17:44–18:20,
36 m 40 s, 60 assistant messages) in which `review.maxChangedFiles`,
`maxChangedLines`, `maxContextBytes`, `timeoutSeconds` were raised by `sed`
after an `input-too-large` refusal (92 files / 5,535 lines against 50 /
2,000).

The human committed it1–3 as `18823936c` "view test" (19:55 UTC, 35 files,
+2,362/−785) and it4–6 as `873ec3923` "test 2" (20:28 UTC, 37 files,
+2,176/−854). Whole change vs base `2576456cc`: **59 files, +4,451/−1,552**
(`git diff --shortstat 2576456cc 873ec3923`).

### 2.2 Reviews

Five launches, two refused, three completed (all `status: partial`).

| launch (UTC) | outcome | files / lines | patch / mirrored / prompt bytes | reviewer turns / time / cost | findings | checks |
|---|---|---|---|---|---|---|
| 19:29:14 | refused `snapshot-too-large`: `main/assets/i18n/en.json` 365,565 B > 262,144 | — | — | — | — | — |
| 19:30:10 → `local_…21-30` | ok | 34 / 3,139 | 169,516 / 342,503 (19 neighbours) / 210,718 | 14 / 361 s / $1.11 (31,054 out, 26,391 thinking) | 3 | lint **failed** (31 files, 1 error + 11 warnings, 1.8 s); unit passed 20 files / 357 tests (19.9 s); e2e null |
| 19:38:23 → `local_…21-38` | ok | 34 / 3,145 | 169,851 / 342,833 / 211,053 | 3 / 21 s / $0.40 (2,395 out, 926 thinking) | 3 | lint **failed** (1 error + 2 warnings); unit passed 20 / 358; e2e null |
| 20:12:31 | refused `snapshot-too-large`: `en.json` 366,890 B | — | — | — | — | — |
| 20:13:18 → `local_…22-13` | ok | 36 / 2,998 | 146,390 / 220,947 (14 neighbours) / 193,233 | **2 / 19 s / $0.33** (2,004 out, 1,547 thinking) | **0** | lint passed (23 files, 1.3 s); unit passed 19 / 348 (19.7 s); e2e null |

Sources: each `result.json` (`reviewer.usage`, `inputs`, `checks`) and
`report.txt` section 1. Reviewer system prompt 6,043 B, byte-identical in all
three (md5 `878371135568410179de508fb8ecb50b`). User-prompt composition
(`reviewer-user-prompt.md`, section sizes): policy dump "Project app"
**10,611 B** in all three; smell vocabulary 1,637 + 1,173; requirements
8.4–11.7 KB; changed-file list 7,025–7,621; checks 784–2,162; omissions
1,207; the change 146,418–169,823; output spec ~2,170.

## 3. New confirmed facts from the cycle

Numbered N1…; each says where it was measured.

### 3.1 Requirements retrieval and the evidence envelope

- **N1.** `requirements.mcpServer` is `null` in the FE config (config.yaml
  read 22:33 local; `ambicode config` output in every transcript). The
  "which Atlassian server?" question was asked in **3 of 4** sessions
  (investigate 18:45:44, plan 18:52:43, it1–3 19:11:49), each time
  recommending to pin it; it never was. The it4–6 agent skipped the question
  by grepping `mcpServer` out of the previous review's `result.json`
  (19:56:11). CONFIRMED.
- **N2.** Every session re-fetched every ticket: 15 `getJiraIssue` calls in
  the cycle (4+4+3+4) for four tickets whose `updated` stamps never changed
  between sessions. CONFIRMED (tool counts).
- **N3.** The evidence envelope is hand-assembled by the agent as an 8–12 KB
  JSON heredoc piped to `prepare --evidence -` and again to `review
  --evidence -`. One attempt to build it with `node -e` hit a permission
  denial (plan 18:53:32) and was redone as a heredoc. CONFIRMED.
- **N4.** `retrievedAt` is fabricated in all four sessions: investigate
  `2026-09-28T12:00:00.000Z` (actual fetch 18:45:56Z), plan
  `21:05:00.000Z` (fetch 18:52:52Z, so "in the future"), it1–3
  `21:20:00.000Z` (fetch ~19:12Z), it4–6 `22:00:00.000Z` (fetch 19:56:20Z).
  The schema only requires a non-empty string
  (`src/contracts/requirements.ts:11`); the value is printed as provenance in
  the report (`src/review/report.ts:88`) and in the reviewer prompt
  (`src/review/prompt.ts:219`). CONFIRMED.
- **N5.** The `mcpServer` label in the envelope varied: `"atlassian"` ×3,
  `"plugin:atlassian:atlassian"` ×1 (plan). `prepare` and `review` each
  printed the notice "requirements.mcpServer is unset, so nothing pins
  retrieval to a server; this evidence declares …" and carried on.
  CONFIRMED.
- **N6.** The plan session ran a JQL search for a backend ticket
  (`searchJiraIssuesUsingJql`, 18:55:04) and found none; the plan records
  "Jira search found no backend ticket". That question ("does a backend
  ticket exist?") was later put to the human as a design decision (N15).
  CONFIRMED.

### 3.2 `prepare` and the shortlist

- **N7.** Shortlist precision and recall against the files the cycle actually
  changed (truth = the 59 files of `2576456cc..873ec3923` for investigate and
  plan; the review's included changed files for the task sessions), computed
  in this session from the `prepare` outputs:

  | session | terms | top-10 hits | precision | recall@10 |
  |---|---|---|---|---|
  | investigate | 5 caller terms | 10 / 10 | 1.00 | 0.17 (10/59) |
  | plan | 2 caller terms | 9 / 10 | 0.90 | 0.15 (9/59) |
  | it1–3, call 1 | 3 caller terms | 9 / 10 | 0.90 | 0.26 (9/34) |
  | it1–3, call 2 | none → auto-derived | 2 / 10 | 0.20 | 0.06 (2/34) |
  | it4–6 | none → auto-derived | 1 / 10 | 0.10 | 0.04 (1/28) |

  CONFIRMED. With caller terms the shortlist is precise but shallow: the
  investigate and plan notes list 17 and 13 files respectively that were
  needed from outside it (their "Navigation evidence" sections). Without terms, `prepare` derives them "from the
  requirement text by word frequency" and produced `organization-wide`,
  `browser-local`, `VS-6351`, `badge-check`, `duplication/cloning`,
  `Pagination/page`; 7 of 12 matched nothing and the top candidate was
  `feature-flags.facade.ts` via co-change (persisted output
  `…/ce1efd4c…/tool-results/bkm8dinx1.txt`).
- **N8.** `prepare` was called with a path that did not exist yet
  (`main/services/table-views-api.service.ts`, it4–6 19:58:01) without
  complaint; the agent later created the file elsewhere
  (`main/features/table-views/services/`). CONFIRMED.
- **N9.** `prepare`'s `readGuidance` ("Read spans with offset/limit, not whole
  files") was not followed: the `Read` tool was used 7 times in the cycle,
  **0** with `offset`/`limit`; whole-file `cat -n` reads 30, ranged `sed -n`
  reads 66. CONFIRMED (regex count over Bash inputs).
- **N10.** `prepare`'s `evidenceRequirement` ("Report the LSP operations used,
  or the fallback reason") *was* followed: both notes carry a "Navigation
  evidence" section naming the fallback. CONFIRMED.

### 3.3 Navigation: LSP and reading

- **N11.** The FE config declares `code intelligence:
  typescript-lsp@claude-plugins-official`. The cycle made **1** LSP call:
  `findReferences` on `AdvancedTableView.isDefault`
  (`advanced-table-view.model.ts:14`) at 18:49:04 returned **1 reference —
  the declaration itself** — while grep found uses in 10+ files. Both notes
  record "the TypeScript server is not indexing this session"; plan and both
  task sessions made 0 LSP calls. CONFIRMED. This is the first real-session
  LSP measurement; it contradicts the origin note's "in this session LSP
  works on this repo" as a generalisation (that was the plugin's own repo).
- **N12.** Reading happened through Bash (`cat -n`, `sed -n`, `grep -rn`),
  editing through 27 Python heredocs (`assert s.count(old)==1` anchors, 13 +
  14) plus 34 `Write` and 6 `Edit` calls. Grep/Glob tools: 0 calls. I'd guess
  the harness's auto-mode instruction ("do your work through the Bash tool")
  drives this; the system prompt is not in the transcript, so UNVERIFIED.
  The consequence is CONFIRMED: the skill bodies' tool preferences and the
  `allowed-tools` lists do not describe what the agent actually uses.

### 3.4 Skill cadence and human interaction

- **N13.** The task skill says one plan iteration per run
  (`skills/task/SKILL.md:97`, `:145` "One pipeline run per iteration"). The
  user's arguments were `VS-6735 | it1 - it3 review in the end` and
  `VS-6735 | it4 - it6 review in the end`; both sessions implemented three
  iterations and reviewed once. Each review therefore covered ~3,000 changed
  lines instead of one iteration. CONFIRMED.
- **N14.** Human questions in the cycle: 8. Investigate 1 (MCP server), plan
  5 (MCP server; API contract; where Predefined definitions live; who is
  Admin; accept gate), it1–3 1 (MCP server), it4–6 1 (wire the HTTP adapter
  against an unconfirmed contract?). Waits: 8 s; 3, 135, 12, 3, **383 s**
  (reading the plan); 4 s; 35 s. Human-wait is 57 % of the plan session's
  wall time (539 / 941 s) and 11 % of the cycle's (586 / 5,369 s).
  CONFIRMED.
- **N15.** The plan session turned three open questions into
  `AskUserQuestion` decisions with a recommended option each; the human took
  the recommendation all three times and accepted the plan unchanged. The
  decisions are recorded in the plan header. CONFIRMED.
- **N16.** The it4–6 agent asked whether to wire an HTTP adapter to an
  endpoint that does not exist; the human chose "Build + wire". The final
  message says "nothing has been checked against a real backend, so treat the
  HTTP part as unconfirmed". CONFIRMED (transcript 20:14:57).

### 3.5 Task agent: verification behaviour

- **N17.** Neither task session ran a test, lint or type-check itself:
  `vitest` 0, `eslint` 0, `tsc` 0 invocations by the agent in both
  transcripts (the two `vitest`/`tsc` regex hits are string content in
  edits and a `tsconfig` grep). Only Prettier was run. The only execution of
  tests was the review pipeline's `unit` check. CONFIRMED.
- **N18.** The plan prescribed `npx tsc -p tsconfig.spec.json --noEmit` for
  every iteration. Run now at HEAD `873ec3923`: **exit 2, 133 errors in 52
  spec files, 0 of them in the 59 files the change touched** (8.5 s). The
  gate the plan wrote cannot pass on this repository's baseline; the
  delivered code is type-clean under it. CONFIRMED. Vitest does not
  type-check, so nothing in the cycle type-checked the new code until this
  measurement.
- **N19.** The lint failure in both it1–3 reviews is one pre-existing error:
  `advanced-table.component.spec.ts:306:9 no-unexpected-multiline`. The same
  four lines exist at base `2576456cc` (lines 314–317); `prettier --check`
  passes the file, so Prettier and ESLint disagree in that repo. The agent's
  final message "Lint fails on one error that predates this change" is
  correct; the error was committed unchanged and still lints red at HEAD.
  CONFIRMED (eslint run in this session).
- **N20.** Finding triage was honest and recorded: it1–3 fixed 1 of 3
  findings (the surface-switch error branch), re-reviewed, and wrote the
  other findings into `notes.md` as "belong to iterations 4–6" with a reason
  for the disputed one ("the local adapter can't enforce that guard").
  CONFIRMED (`notes.md`, transcript 19:36:59–19:40:12).
- **N21.** Both task sessions hit the per-file snapshot ceiling on the first
  review launch (N2.2 table) and recovered with `--exclude
  main/assets/i18n/en.json` in 56 s and 47 s. The reviewer then listed the
  i18n keys as unverifiable in `omissions`; the it4–6 agent verified the
  keys itself with a Python check (20:14:29). CONFIRMED.
- **N22.** Accuracy of the agents' user-facing claims that I could check:
  "358 tests" (matches `unit.txt`), "review found nothing" (matches),
  "nothing is committed" (the human committed later), "predates this change"
  (N19) — all correct. The only fabricated values found are the `retrievedAt`
  stamps (N4). CONFIRMED.

### 3.6 Review CLI

- **N23.** `ambicode review --help` fails with `bad-argument … Unknown option
  '--help'` and lists the options in the error; help is handled only as a
  top-level command (`src/cli/main.ts:165`). The it4–6 agent used the error
  text to discover `--exclude`. CONFIRMED.
- **N24.** `--task <slug>` only chooses the directory that plan,
  investigation and reviews share (`src/cli/target-option.ts:26`). The
  review has no notion of which plan iteration is under review even though
  the plan and `notes.md` are in that directory. CONFIRMED; consequence in
  N31.
- **N25.** Init defaults are 300 s / 50 files / 2,000 lines / 524,288 B
  (`src/config/defaults.ts:5-9`). All three completed local reviews (3,139 /
  3,145 / 2,998 lines) exceed the default line limit; they ran only because
  the user had raised the limits twice the same day (to 900 / 100 / 6,000 /
  2 MiB in the MR session, and to 900 / 150 / 20,000 / 2,524,288 by the time
  of the cycle — current config.yaml). CONFIRMED.
- **N26.** The per-file snapshot ceiling is `MAX_SNAPSHOT_FILE_BYTES =
  262_144` (`src/config/defaults.ts:41`, "not configurable" per the CLI
  message). `en.json` in the FE repo is 365–367 KB, so every change that
  touches it is refused once per launch. CONFIRMED. Cycle cost: 2 refusals,
  ~100 s.

### 3.7 Checks

- **N27.** Local mode executes configured checks: `lint` (eslint, selector
  none, 23–31 files, 1.3–1.8 s) and `unit` (vitest, selector `related`,
  19–20 spec files, 18.6–19.9 s) ran in all three reviews. This corrects the
  origin note's blanket "every eval and prod run reports no check ran": that
  held for MR mode and the benchmark configs, not for a local review with
  commands configured by `init`. CONFIRMED (`checks` in each `result.json`).
- **N28.** The `related` selector included every new and changed spec plus
  two unrelated score-type specs (`est-column-display-strategy.spec.ts`,
  `nom-column-display-strategy.spec.ts`) in all three runs, and recorded the
  limitation "selected from the repository working tree, not from the pinned
  snapshot". CONFIRMED.
- **N29.** `e2e: null` keeps every review at `status: partial` ("1 check(s)
  did not pass or could not establish what they covered") even when lint and
  unit both pass (`local_…22-13`). By design (a skipped step downgrades the
  status), but it means "partial" carries no signal in this repo. CONFIRMED.

### 3.8 Reviewer: effort, findings, stability, scope

- **N30.** Reviewer effort collapsed across the session: 14 turns / 361 s /
  $1.11 → 3 / 21 s / $0.40 → **2 / 19 s / $0.33**. The two-turn run reviewed
  2,998 changed lines with 220 KB of mirrored neighbours and returned zero
  findings; its own omissions say "I did not run anything" and (21-38) "I did
  not read the full component files". Nothing bounds turns from either side:
  `claude-reviewer.ts` passes no `--max-turns`, and `usageOf()` records only
  `num_turns`, API duration, tokens, cost and thinking tokens
  (`src/review/claude-reviewer.ts:414-423`) — **whether the reviewer used
  Read/Grep/Glob at all is not recorded.** CONFIRMED.
- **N31.** Of the 6 findings, **4 are about later plan iterations**, not
  defects: `f-414…` (still localStorage → VS-6736 not met; that is iteration
  6), `f-065…` (dead surface: `viewsListViews`/convert/reorder have no UI
  caller; that is iterations 4–5), `f-676…` and `f-299…` (UI gated on
  `type !== "predefined"`; the plan's iteration 2 says "the view bar
  temporarily maps `predefined` to today's behavior"). One (`f-b146…`, error
  branch not guarded on surface switch) was real and fixed. One (`f-a1246…`,
  high/high: the local adapter lacks the last-shown-org-view guard) was
  disputed by the agent and never addressed. CONFIRMED against
  `plan_2026-09-28T21-06.md` iterations 2, 4, 5, 6.
- **N32.** Run-to-run stability on near-identical input (6 lines changed
  between `…21-30` and `…21-38`, in `advanced-table-view.service.ts`, a
  cosmetic change in the adapter's convert path, and a spec): 1 of 5 topics
  repeated (UI gating). The high/high `f-a1246…` disappeared although the
  code it pointed at (`advanced-table-views-storage.service.ts:128`) did not
  change. CONFIRMED (the edit is in the it1–3 transcript at 19:37:52).
- **N33.** `ruleRefs`: 4 of 6 local findings cite rules
  (`common-quality/data-boundary`, `ownership-and-direction`, `effects`,
  `explicit-surface`, `dead-surface`); 6 of 6 cite `requirementRefs`. The
  origin note's prod runs cited 0. So the 10.6 KB policy dump is not inert
  in local mode; whether the citations are load-bearing is UNVERIFIED.
- **N34.** Local mode mirrored 14–19 unchanged neighbours (221–343 KB) into
  the snapshot, i.e. the "neighbour context" the origin note wants for MR
  mode (§5 item 10) was present here, and the reviewer still reported not
  reading full files (N30). INFERRED: availability of context is not the
  binding constraint; reviewer effort is.

### 3.9 Harness facts the campaign must reproduce or control

- **N35.** Sessions are single-agent, Bash-dominant (67 % of calls),
  Opus-5.5 at high effort, VS Code entry, with permission rules that deny
  some read-only commands (`xargs`, `node -e`, `python3 -c` on tool-result
  files). A sandbox that offers Read/Grep/Glob/LSP but no Bash, or Bash but
  no denials, measures a different agent. CONFIRMED (transcript metadata,
  N12, denials).
- **N36.** Agent-active time per iteration of feature work: it1–3 ≈ 9.6 min
  per iteration (1,729 s / 3), it4–6 ≈ 6.3 min (1,130 s / 3), including the
  review. The
  reviewer's cost per completed review: $0.33–$1.11; the sessions' own token
  cost is not computed here (Opus 5.5 pricing not verified). CONFIRMED /
  UNVERIFIED as marked.

## 4. Facts carried over from the origin note

Condensed; references unchanged (plugin 0.3.4, branch `eval` at the time;
`npm run verify` was green, 750/751 with one Windows skip). Marks: ✔ the
cycle confirms, ✖ the cycle contradicts or narrows, – untouched by the cycle.

### 4.1 Measurements

- **O1.** Two curated sweeps, 18 cases, 1 run each, with/without: localize F1
  0.64 vs 0.65 then 0.69 vs 0.63; review recall 0.09 vs 0.25 then 0.09 vs
  0.16; per-case same-arm swings up to 0.5 F1 (`perrun-1330.txt`,
  `perrun-sweep1.txt`). – (✔ in spirit: N32 shows the same instability in the
  reviewer itself.)
- **O2.** Armed review runs never ran the pipeline: `helper-ran` 0/8; 15/16
  agents wrote "you asked me not to edit" (`timeline-1330-review-with.txt`,
  `timeline-sweep1-all.txt`). ✖ narrowed: in real sessions the agents
  launched the pipeline in 5/5 attempts and it completed 3/5 (§2.2); the
  sandbox result is a prompt-instruction artefact.
- **O3.** Sandbox reviewer cannot sign in (`Not logged in`); replay
  recordings exist for 5/8 review cases; 3 FE cases refused by
  `snapshot-too-large` until recorded with `--exclude 'main/assets/i18n/**'`.
  ✔ N21/N26: the same ceiling bites every real launch in this repo.
- **O4.** LSP: 0 uses in every sandbox run; no LSP server in the sandbox. ✔
  extended by N11: with the server configured in a real session, the one call
  made returned a wrong answer.
- **O5.** Prod MR !2696 reviewed by 0.3.1 and 0.3.4: 3 and 4 findings, user
  verdict 0/4 useful; reviewer $1.52 / 369 s and $1.83 / 438 s; prompt 287 KB
  of which 238 KB diff, 10.6 KB policy, 16 KB file list; 0 `ruleRefs`
  (`archive/logs/*/MR_2696_*/`). ✖ partly: local findings do cite rules
  (N33); usefulness of the 6 local findings is unlabelled (§8).
- **O6.** Human review threads behind the graders: 19 (10 conventions, 4
  questions, 3 design, 2 correctness). –
- **O7.** Recorded pipeline reviewer hits 1 of 8 human threads on the first
  4 recorded cases. –

### 4.2 Code facts

- **O8.** MR mode gives the reviewer changed files only:
  `includeSiblingContext: false` hard-coded (`src/review/bundle.ts:379`),
  plumbed through `src/snapshot/remote-target.ts:24,46` into
  `src/providers/gitlab/provider.ts:243`; local mode includes same-directory
  neighbours (`src/snapshot/snapshot.ts:273`). ✔ N34 measured local-mode
  neighbours at 14–19 files.
- **O9.** `configurationProvenance` knows whether the checkout is the MR's own
  project (`src/snapshot/remote-target.ts:144-176`); nothing uses it to read
  unchanged files locally. –
- **O10.** Reviewer rules: one unverifiable location voids the whole review
  (`src/review/prompt.ts:384-386`, `prompts/reviewer-role.md`); below-medium
  confidence is dropped; single `claude --print` process
  (`src/review/claude-reviewer.ts`). ✔ plus N30: no turn floor or record of
  tool use.
- **O11.** Checks: `src/checks/adapters/` empty; MR mode needs a digest-pinned
  image (`src/checks/remote.ts:1-5`); benchmark configs null every command.
  ✖ narrowed by N27: local mode with `init`-written commands works.
- **O12.** Policy: 12 builtin packs, all `authority: inherited`; no `team`
  pack anywhere; `rules` skill never appears in an eval (`policies/*.yaml`).
  ✔ the FE config lists 7 builtin packs and no `team` pack; `rules` was not
  used in the cycle.
- **O13.** Shortlist: whole-term and compact-form substring matching over
  paths and `git grep` (`src/code-intelligence/locate.ts:161-290`); be-vs-5766
  got 3 candidates, all wrong; `locate` retired after adding 0/18 recall.
  ✔ now measured (N7): precision 0.9–1.0 with caller terms, recall@10
  0.15–0.26; auto-derived terms 0.04–0.06.
- **O14.** Skill bodies: investigate 7,003 B, plan 9,808 B, task 10,565 B,
  review 9,285 B, rules 9,921 B; zero worked examples; prose-only tool
  preference. ✔ N9/N12: prose tool guidance is not what governs tool choice.
- **O15.** Requirements: `plugin:atlassian` returns `parent`, the claude.ai
  connector does not; `skills/shared/requirements-mcp.md` never mentions
  parents. ✔ N1–N5 add the unpinned-server cost.
- **O16.** Hook: contract injected once per epoch, 2.7 KB, hash-cited,
  cache-stable (`src/hook/run-hook.ts`). ✔ every transcript starts with it.
- **O17.** Snapshot per-file ceiling 262,144 B (`src/config/defaults.ts:41`);
  every i18n bundle in the FE repo exceeds it. ✔ N26.

## 5. Ranking v2 — from dead end to peak

Origin items keep their numbers; "Δ" says what the cycle changed. New items
are 13–17.

1. **More prose in skill bodies.** Δ: two kinds of prose behaved differently.
   Prose that *gates an action with a question* was followed 3/3 (N1: ask
   which MCP server). Prose that *shapes style* was not (N9: ranged reads
   0/7; N13: one-iteration cadence overridden by a two-word user argument).
   *Dead end for style; keep gating prose; keep bodies shrinking.*
2. **LSP-first navigation taught by prose.** Δ: first real-session number:
   1 call, wrong answer (N11). *Dead end until the tsserver actually indexes
   the FE project; cheap next step: reproduce `findReferences` on
   `advanced-table-view.model.ts:14` in a fresh session with the plugin and
   count references.*
3. **Tuning the substring shortlist.** Δ: measured (N7). Caller terms give
   precision 0.9–1.0 and recall@10 0.15–0.26 against 28–59 true files;
   auto-derived terms give 0.04–0.06. *Weak on recall, but two cheap, now
   measurable wins: (a) never fall back to word-frequency terms without
   saying so louder than a limitation line — the it4–6 shortlist was 1/10
   relevant; (b) raise `--limit` when truth sets are 30–60 files.*
4. **Deciding anything from one run per case.** Δ: strengthened by N32 (1/5
   topics stable across two reviews of the same code). *Three runs and
   medians before any accept/reject; applies to the reviewer, not only the
   localize graders.*
5. **Checks pipeline.** Δ: ✖ for local mode (N27–N29). *Local checks are live
   evidence and cheap (≈20 s); MR mode is still inert. Two defects to fix
   before checks can steer anything: `partial` is permanent when a command
   is null (N29), and the `related` selector runs from the working tree, not
   the snapshot (N28).*
6. **Descriptions and triggering.** Δ: none. *Done.*
7. **Requirements retrieval.** Δ: promoted. The cycle paid 3 questions, 15
   re-fetches, 4 hand-built envelopes with fabricated timestamps and a
   permission denial for four unchanged tickets (N1–N5). *Strong and cheap:
   write `requirements.mcpServer` at init or after the first answer; let the
   CLI stamp `retrievedAt` and `retrievedVia` itself; cache fetched sources
   per `updatedAt` in the task directory; check `snapshot-too-large` in
   `prepare` when the paths are already known (N21, N26).*
8. **Reviewer prompt economy.** Δ: weakened. Local findings cite rules 4/6
   (N33), so "drop uncited rules" is no longer free. The cost that matters is
   time and turns, not bytes: the 187–211 KB prompts were read in 19–361 s
   depending on effort, not size (N30). *Medium; measure with item 13.*
9. **Evals as the steering wheel.** Δ: the cycle is itself a labelled case
   once the human grades 6 findings + one 0-finding review (§8). *Strong and
   still prerequisite. Add: the FE cycle's three reviews as replay cases with
   the plan iteration recorded, so item 14 can be scored.*
10. **Unchanged-neighbour context in MR mode.** Δ: demoted. Neighbours were
    available in local mode (14–19 files) and the reviewer did not read them
    (N30, N34). *Medium; only pays off together with 13.*
11. **A verification pass over findings, and sectioned recall.** Δ: confirmed
    with a new mechanism: 4/6 findings were "not done yet" against later plan
    iterations (N31). *Strong; the cheapest form is item 14.*
12. **Team policy packs mined from review history.** Δ: none. *Still the
    product bet; unmeasured in this cycle.*
13. **Reviewer effort floor and tool-use record** (new). 2 turns / 19 s / 0
    findings on 2,998 lines (N30). *Strong and cheap: record tool calls in
    `usageOf()` and the report; refuse or flag a review whose reviewer opened
    no file; measure findings vs turns on the three replay cases.*
14. **Iteration-scope-aware review** (new). `--task` names the directory that
    holds the accepted plan and the note (N24), yet the reviewer is told
    nothing about which iteration it is looking at, so it reports the plan's
    own later iterations as missing requirements (N31). *Strong and cheap:
    pass the iteration's goal, "leaves out" and accept criteria into the
    prompt; score with item 9.*
15. **Task-agent self-verification** (new). 0 self-run checks in two task
    sessions (N17); the plan's own `tsc` gate is unrunnable on the baseline
    (N18). *Medium: the task skill or `prepare` should probe each planned
    check command against the baseline once and mark those that fail
    unmodified as unusable gates; the review's `unit`/`lint` then stays the
    only execution evidence, which the agent already relies on honestly.*
16. **Evidence envelope produced by the CLI** (new; part of 7). The agent
    fabricates provenance fields the CLI could fill (N4). *Cheap; also a
    faithfulness metric for the campaign: count fabricated fields per
    session, target 0.*
17. **Harness parity for training** (new). The training sandbox must match
    N35 or the campaign optimises a different agent. *Prerequisite for any
    prose or tool-policy lever.*

Cross-cutting: cost. The cycle's reviewer spend was $1.84 for three reviews;
the sessions' Opus tokens dominate (835 k output, 81 M cache-read) and are
not costed here.

## 6. Baseline metrics for the campaign

Values as of this cycle; each row says how to recompute it. "Noise" is what
is known about run-to-run variation.

| metric | baseline | how measured | noise |
|---|---|---|---|
| Shortlist precision / recall@10 with caller terms | 0.90–1.00 / 0.15–0.26 | `prepare --json --term …`; truth = files changed by the accepted plan's commits; script in §3.2 | 5 runs, 1 repo; unknown across repos |
| Shortlist recall@10 with auto-derived terms | 0.04–0.06 | same, without `--term` | 2 runs |
| LSP calls per session / correct answers | 1 / 0 | count `tool_use` blocks with `name == "LSP"`; judge the answer from the matching `tool_result` | 4 sessions |
| Ranged reads (`Read` with offset/limit) per session | 0 of 7 | regex over Bash and Read inputs (§3.2 N9 command) | — |
| Human questions per session; human-wait | 1 / 5 / 1 / 1; 8–539 s | `AskUserQuestion` tool_use → tool_result timestamps | — |
| Requirement re-fetches per cycle | 15 for 4 tickets | count `getJiraIssue` tool_use | — |
| Fabricated provenance fields per session | 1 (`retrievedAt`) in 4/4 | compare `retrievedAt` in the `--evidence` heredoc with the MCP call timestamp | — |
| Review launches refused per task session | 1 of 2 in 2/2 sessions | `snapshot-too-large` in Bash results | — |
| Reviewer turns / seconds / cost per completed review | 14/361/$1.11; 3/21/$0.40; 2/19/$0.33 | `result.json` → `reviewer.usage` | 3 runs; large |
| Findings per review; share about later iterations | 3, 3, 0; 4 of 6 | `result.json` → `findings`, matched by hand to plan iterations | — |
| Finding topic stability across two reviews of the same code | 1 of 5 | compare `findings[].location` + explanation between `…21-30` and `…21-38` | 1 pair |
| `ruleRefs` cited / findings | 4 / 6 | `result.json` | — |
| Checks executed per review; status | lint + unit, 3/3; `partial` 3/3 | `result.json` → `checks[].status`, `status` | — |
| Self-run verification commands per task session | 0 | regex `vitest|eslint|tsc` over Bash inputs | — |
| Plan-prescribed `tsc` gate on baseline | 133 errors / 52 files, 0 in touched files | `npx tsc -p tsconfig.spec.json --noEmit` in the FE repo | deterministic |
| Committed lint errors introduced by the agent | 0 (1 pre-existing) | `eslint` on the failing file at base and HEAD | deterministic |
| Agent-active minutes per plan iteration | 9.6 (it1–3), 6.3 (it4–6) | session wall minus human-wait, divided by iterations | 2 points |
| Output tokens per session | 65 k / 116 k / 364 k / 290 k | sum `message.usage.output_tokens` over assistant rows | — |

## 7. Assumptions, unverified items and evidence gaps

- The 0/4 prod verdict (O5) still stands on one MR, one user, two runs; the
  6 local findings are unlabelled (§8). Nothing here measures usefulness.
- The Bash-only tool mix is attributed to the harness's auto-mode
  instruction; the system prompt is not in the transcripts (N12).
- Session cost in dollars is not computed; the reviewer's `costUsd` is its
  own report.
- The reviewer's tool use is unrecorded (N30); "2 turns" may or may not
  include a file read.
- Whether the disputed high finding `f-a1246…` is a real defect is
  unverified; the agent's counter-argument is in `notes.md`.
- The it1–3 review's 14 turns vs the later 2–3 turns may be the model's
  variance, not the prompt; only replay with fixed input (item 9) can tell.
- The FE repository state was measured at HEAD `873ec3923` with 4 unrelated
  dirty files (`.claude/rules/security.md`, `.gitignore`, `angular.json`,
  `main/environments/environment.web-local.ts`); none affects the numbers.

## 8. What needs a human label before the plan can score anything

1. Each of the 6 findings: actionable / correct-but-inert / wrong, and
   whether "belongs to a later iteration" counts as inert.
2. The 0-finding review of it4–6: was there anything to find? (A second,
   14-turn-class review of the same snapshot would be the cheapest probe.)
3. Whether the three human decisions in the plan session were worth 9
   minutes of the human's time, or should have been defaults.
4. Whether "one iteration per task run" is a rule to enforce or a default the
   user may override with two words.

## 9. Recommendation

Do 17 (harness parity) and 9 (replay cases from this cycle, three runs each,
labels from §8) first, because every other item is scored by them. Then 7 +
16 together (pin server, CLI-stamped envelope, cached sources, pre-flight
size check — all CLI, all cheap, all measurable by N1–N5 going to zero).
Then 13 + 14 (reviewer tool record, effort floor, iteration scope) measured
on the three replay cases. Then 5's two defects. Keep 12 as the product bet.
Retire prose-only work (1, 2) and shortlist tuning beyond 3(a)/(b) unless the
cheap measurements say otherwise.

## Navigation evidence

Navigation: targeted search over the artifacts (no LSP needed for JSONL and
Markdown). Transcript facts come from throwaway Python over the four cycle
transcripts plus the three same-day sessions, using the JSONL fields named
in §0 (not kept); review facts from Python over each `result.json`
and `report.txt`; shortlist recall from the `prepare` outputs against `git
diff --name-only 2576456cc 873ec3923`; repository facts from `grep -n` on
`src/contracts/requirements.ts`, `src/review/report.ts`,
`src/review/prompt.ts`, `src/review/claude-reviewer.ts`,
`src/cli/main.ts`, `src/cli/target-option.ts`, `src/config/defaults.ts`,
`src/checks/select.ts`, `skills/task/SKILL.md`; frontend facts from
`git show`, `eslint`, `prettier --check` and `tsc` run read-only in the FE
repo. Shortlist: none was used for this note.

## What would change this conclusion

- A fresh session in the FE repo where `findReferences` returns the real
  reference set would move item 2 from dead end to mechanism work.
- Human labels (§8) rating the two-turn 0-finding review as correct would
  demote item 13 to a cost item.
- Human labels rating the four "later iteration" findings as useful would
  demote item 14.
- A replay of `local_…22-13` at 14+ turns that still finds nothing would
  demote 13 and promote 11's second pass.
- Three-run medians overturning the 1-run numbers in §2.2 would reorder 8,
  10, 13.
- Evidence that the training harness cannot reproduce N35 would make 17 a
  blocker rather than a prerequisite.

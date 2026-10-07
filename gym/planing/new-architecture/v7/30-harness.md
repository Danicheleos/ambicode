# The plugin's own harness on top of Claude Code

Claude Code owns the loop, the tools, permissions and compaction. The plugin adds a narrower loop
inside it: **route step → model work → evidence-writing command → next step**. This file names the
platform mechanisms that carry it, their cost, and the edges (compaction, headless, subagents,
sandbox, week-one situations).

## 1. Hook matrix

| Event | Matcher / `if` | Handler | Does | Cost per fire (M15) | Fires per run |
|---|---|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear\|fork` | `$A hook` | reset epoch; inject the contract (≤ 300 words) | 89 ms | 1 |
| `UserPromptSubmit` | all | `$A hook` | re-inject the contract after compaction; `^/ambicode:(\w+)` → `route start`; mid-route after an epoch change → re-inject the current step | 89 ms (+ start work) | 1–3 |
| `PostToolUse` | `mcp__.*` (#52) | `$A hook` | spawns on **every** `mcp__*` call in every session; exits at once without a route (#90); with a route: binding rule, bound server → capture the payload, append `requirement {rawHash}`; nothing else | 89 ms | 0–11 bound + 1 per other MCP call |
| `PostToolUse` | `AskUserQuestion` | `$A hook` | find `[ambicode gate <id> <instance>]` in the question; bind to that `gate` entry (C2) and append the answer `{via: hook, instance, object}` (or `unbound`); `onAnswer` revises; **return the next step as `additionalContext`** (P48; fallback: the gate text says "then `route next`") | 89 ms + the step build | 0–4 |
| `PreToolUse` | `Bash` with `if: Bash(git *)`, `Bash(glab mr*)`, `Bash(*.ambicode/task*)`, `Bash(*ambicode.mjs*)` | `guard.mjs` | ask / deny / `updatedInput --task` (P47, unverified; nothing depends on it) | 34 ms | 2–10 |
| `PreToolUse` | `Write\|Edit\|MultiEdit\|NotebookEdit` | `guard.mjs` | deny under `.ambicode/task/` (plan-body exception); deny `config.yaml` and `.gitignore` during init | 34 ms | 0–10 |
| `Stop` | all | `$A hook` | report-shaped stops only; block once | 89 ms + a transcript tail | 1–3 |
| `PostCompact` | all | `$A hook` | reset epoch (cannot carry context, probed 2.1.278) | 89 ms | 0–1 |
| `SessionEnd` | all | `$A hook` | remove session state | 89 ms | 1 |

Not in the matrix: `PostToolUse(Skill)` (no model invocation under D2); `PostToolUse(Edit|Write)`
reminders (inert until a pack sets `remindOnEdit`, G18); the `Read|Grep|Glob|LSP` recorder (13 §5);
`PostToolUse(ExitPlanMode)` (backlog, D12).

Hook time per investigate run, from the matrix (#88): **typical** (sandbox path: no requirement,
no gates) 1 + 1 + 1 + 1 spawns of `$A hook` + 2–4 guard spawns ≈ **0.5 s**; **maximum** by the
matrix's own column (1 + 3 + 11 + 4 + 3 + 1 + 1 = 24 `$A hook` spawns + 10 guard) ≈ **2.5 s**, plus
89 ms per MCP call to a server that is not bound (P53). Two measurements of the `$A hook` spawn
exist: 89 ms (M15, skill-gap-plan iteration 5) and ~190 ms for the `UserPromptSubmit` hook on the
reference machine (`docs/compatibility.md:395`); the figures above use 89 ms and would roughly double
at 190 ms — 33 §7 re-measures. Separately, **the start work runs inside the `UserPromptSubmit`
hook**: in the no-requirement path that is `ground` (shortlist ×2, harvest, policy), I'd guess 1–3 s
on the user's prompt; measured in 33 §7. Nothing scales with the model's reading.

## 2. Session state

`<scratchpad_dir>/ambicode-hook-state/` or `<tmpdir>/…/<hash(session)>/`: `epoch`,
`delivered/<epoch>/<hash>`, and `active-route` → `{task, skill}` (a pointer that duplicates the
ledger's latest `route` for this session; readers fall back to scanning `.ambicode/task/*`, P31).

## 3. Context budget per skill

Caps are enforced by byte-ceiling tests on every step file and compact output. **Expected** is what
the measured payloads suggest; **variable** is what the cap does not cover. Capture reduces what is
written to disk, **not** what the model holds: a `PostToolUse` hook runs after the tool result is in
the window (#47). The only lever on requirement text in context is the field list in the template
(14 §2), which the model may or may not obey (M2). The peak is measured, not predicted (33 §7, P32).

| Skill | Body | Start | Largest step | Report step | Fixed cap | Expected fixed | Variable (not capped) | v0.4.0 fixed files |
|---|---|---|---|---|---|---|---|---|
| investigate | 2.0 | 4 | 8 | 2 | 16 KB | 6–8 KB | requirement text as returned by MCP (28 KB epic + ≤ 10 children in the real run; 53 KB for a `*all` JQL); file read-back 14.5–17.6 KB when a step overflows | ≈ 21–27 KB |
| plan | 2.5 | 4 | 9 (file) | 3 | 18.5 KB | 8–12 KB | as above + the plan body once (78 KB in the real run) | ≈ 25–34 KB |
| task | 2.5 | 4 | 9 (file) | 3 | 18.5 KB | 8–12 KB | check and review output (≤ 262,144 bytes each, usually KB) | ≈ 27–37 KB |
| review | 2.0 | 3 | 2 | — | 7 KB | 4–5 KB | review output | ≈ 14–20 KB |

The real run's 214k peak had ~80k of double plan emission (fixed) and ~45 KB of requirement text.
Whether a 10-child epic stays under it depends on the field lists being obeyed; 33 §7 answers.

## 4. Delivery windows (M14)

Inline hook context ≤ 9,800 chars → else `steps/<id>.md` + 300-char preview ("Read it whole; N
bytes", one `Read` turn, G6). CLI output ≤ 30,000 shown; design cap 8,000; `--show` for the rest. Most
important content first.

## 5. Compaction

Skill bodies (≤ 2.5 KB) are re-attached by Claude Code and survive (the exact re-attachment budget
is not re-probed on the current version; at ≤ 2.5 KB it does not matter). The step in progress is
re-injected by the next `UserPromptSubmit` from the fold (one ledger read). Working notes are lost as
today; anything a later step needs is in the ledger or `steps/`; a plan in progress is on disk as a
draft (D11).

## 6. Headless (`claude -p`) and the eval sandbox

- `route start --headless` records the **mode**; every gate then takes its **non-acting** default
  (draft, skip, decline, inline, list only, write nothing). **Authority is the channel, not the
  flag (G1)**: in `claude -p` the user's prompt carries `/ambicode:<skill> … --headless --answer
  <gate>=<option>`, the `UserPromptSubmit` hook starts the route (`channel: hook`, `trusted: true`;
  whether the hook fires under `-p` is probe P37(c), #136)
  and the `--answer` is recorded as a `preanswer`, consumed into `acceptance {via: prompt}` when the
  gate is reached (#78), printed under Decisions (#44). A model that types the same line itself gets
  `channel: cli`, `trusted: false`: the mode is headless, the acting answer is `declined
  {acting-needs-human}` (12 §2.4). An acting answer the user did not put in the prompt is never
  supplied by the model later: `route next --answer <gate>=<acting>` is declined on every channel
  and in every mode (C1). `--default <gate>` exists for the opposite: take the default now
  (headless on any channel, or after the gate was asked, #97). In headless, `args.hasRequirement` is
  true **only** for `--requirement <url>` (D17).
- Interactive routes never take a default silently: three unanswered advances, then the
  non-acting option on record with `never-asked` or `unanswered` (12 §3.4).
- Guard `ask` fails in headless → `stop:blocked`, report leads with it (G20); counted per run (33 §7).
- Sandbox: no MCP; `args.hasRequirement` false without `--requirement` (D17) → `builtFrom: args`
  envelope; `index: none`; **the plugin arm's prompt types the command** (`prompt.with.md`:
  `/ambicode:investigate <question> --headless …`) and the naked arm's `prompt.md` is **unchanged**,
  so the cached 2026-10-02 baseline stays the naked reference (D19, 33 §0.2); whether
  `UserPromptSubmit` fires and expands the command in the sandbox is probe P37 and runs before
  anything else (33 §0). **If P37(b) fails** the model starts the route from the body's fallback
  line: `channel: cli`, untrusted, so an acting preanswer in the prompt (`estimate=run`,
  `review-offer=run`) is declined unless the harness can prove itself with a per-run token in the
  sandbox environment (`channel: harness`, probe P58). Investigate needs no acting answer and is
  unaffected; review and task evals are conditional on P37(b) or P58 and say so in their results.
- The ledger is copied out of the sandbox with the traces (33 §0).

## 7. Subagents

Only the main thread runs routes and the Stop hook (`agent_id` absent). The appendix workers (17)
wait on P21.

## 8. Week-one situations

| Situation | Behaviour |
|---|---|
| The user types another `/ambicode:` command mid-route | the open route gets `exit {superseded}`; the new route starts (12 §2) |
| The user asks an unrelated question mid-route | the route stays open and silent; the Stop hook ignores non-report stops; the next evidence-writing command resumes |
| Two `/ambicode:investigate ORD-17 …` with different questions, in any session | different args hash → a second route on the same slug (12 §2.3, #104); `note list` shows both notes |
| A task directory holds several plans | `task` opens the latest `plan`; `--plan <file>` picks; a `plan-draft` needs `--from-draft` (recorded) |
| The human picks *Revise* on a plan | `revise design` on record as a new human cycle; the draft stays; design → write → check → accept again; `plan-write`'s automatic bound is fresh (D14) |
| The human picks *Revise* a fourth time | the gate said "(0 left)"; `declined {max-revises}`; the draft stays; `route start --fresh` restarts (P55) |
| The human accepts plan A; the model then saves a new draft B and runs `note promote` | the acceptance names A's hash; B → `plan-not-accepted {object-changed}`; the gate is asked again for B (G2) |
| `plan check` fails twice, the third write passes | three writes, three checks in one cycle; `plan-check`'s own `repeat` never blocked the re-entry (G3) |
| Two people plan one slug in two sessions, same or different args | the second `route start plan` → `route-busy` naming the first session; `--task <slug>-2` gives the second a directory; `--adopt`/`--fresh` take the route over and the first session is refused `route-taken-over` on its next write (G2, P59, H2) |
| The session dies between a code step's outputs and its completion record | the step re-runs on the next command; its outputs appear twice in the ledger, the report uses the latest (12 §8) |
| The model answers its own gate by typing `route start … --headless --answer plan-accept=Accept` | `declined {acting-needs-human}`; the gate is asked when reached (G1); every later gate takes its non-acting default; the report's Decisions says the mode was model-set (#148) |
| First run on a repository with no config | `/ambicode:init` starts without a config (12 §2.1, G4); any other skill prints `config-missing` naming init |
| The session dies while the plan is being written | `steps/plan-body.md` has what was written; if `plan check` ran, a `plan-draft` note exists (D11); `/ambicode:plan` again in a **new session** → `route-busy` naming the dead session (the engine cannot tell dead from away, H2); `/ambicode:plan … --adopt` continues from the fold (`route {resumes, adopts}`, 12 §2.3); `--fresh` restarts (#79) |
| Resuming iteration N | `notes.md` carries `<!-- ambicode iteration: N done -->` from `note save --iteration`; the route starts at N+1's brief |
| Monorepo, two projects, hook-run start | raised gate `project-ambiguous`; release `route next --project <id>` |
| Windows | the Bash tool runs Git Bash; the POSIX parser applies (assumption, P40, smoke-tested) |
| A ticket read outside any route | the hook exits in < 90 ms (D2) |
| A gate answered without the marker, or with an instance id the ledger does not hold | not bound: an `unbound` entry, nothing acts; the next advance re-prints the gate (12 Failure modes, C2) |
| A plan gate printed twice (draft A, then draft B after a revise) and the human answers the older question | the answer binds to A's print and hash; `note promote` → `plan-not-accepted {object-changed}`; the gate re-prints for B (C2) |
| The model, in a user's trusted `claude -p` run, types `route next --answer review-offer=run` | `declined {acting-needs-human}`; the gate takes *skip*; the report's Decisions says the model asked and was declined (C1) |
| The human steps away for an hour | nothing stops; `wallMinutes` applies only in headless |

## 9. What the harness never does (#48)

Calls the model on its own; writes source files from a hook or a code step (`format` is **model-run**
and on record); writes outside `.ambicode/` except `.gitignore` lines through `init --apply` on an
acceptance; hides a step (`route status` prints the fold, with each `map`'s layers); keeps a counter
the ledger does not hold; acts on an unanswered gate; decides a rollback (D10: the numbers are
presented, the user decides).

## v7 changes

- Stop is routed through `engine.stopHook`; SessionEnd writes `session{end}`; SessionStart/PostCompact rebind through the ledger (12 v7 changes). Hook timings are recorded as `hook{name, ms}` entries.
- `hooks.json` guard matchers: `Bash(*ambicode.mjs*)`, `Bash(rm *)` plus the existing ones; a WebFetch PostToolUse capture exists.
- Guard `ask` in headless routes is a deny (15 v7 changes).

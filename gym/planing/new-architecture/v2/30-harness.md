# The plugin's own harness on top of Claude Code

Claude Code owns the loop, the tools, permissions and compaction. The plugin adds a narrower loop
inside it: **route step → model work → evidence → next step**. This file names the platform
mechanisms that carry it, their cost, and the edges (compaction, headless, subagents, sandbox,
week-one situations).

## 1. Hook matrix

| Event | Matcher / `if` | Handler | Does | Cost per fire (M15) | Fires per run |
|---|---|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear\|fork` | `$A hook` | reset epoch; inject the contract (≤ 300 words) | 89 ms | 1 |
| `UserPromptSubmit` | all | `$A hook` | re-inject the contract after compaction; `^/ambicode:(\w+)` → `route start`; mid-route after an epoch change → re-inject the current step | 89 ms (+ start work) | 1–3 |
| `PostToolUse` | `mcp__.*(atlassian\|jira\|confluence\|rovo).*` | `$A hook` | **route active only**: capture the payload, append `requirement {rawHash}`; nothing else | 89 ms | 0–11 |
| `PostToolUse` | `AskUserQuestion` 🆕 | `$A hook` | record the open gate's answer `{via: hook}` | 89 ms | 0–4 |
| `PreToolUse` | `Bash` with `if: Bash(git *)`, `Bash(glab mr*)`, `Bash(*.ambicode/task*)`, `Bash(*ambicode.mjs*)` 🆕 | `guard.mjs` | ask / deny / `updatedInput --task` | 34 ms | 2–10 |
| `PreToolUse` | `Write\|Edit\|MultiEdit\|NotebookEdit` | `guard.mjs` | deny under `.ambicode/task/` (plan-body exception); deny `config.yaml` during init | 34 ms | 0–10 |
| `Stop` 🆕 | all | `$A hook` | report-shaped stops only; block once | 89 ms + a transcript tail | 1–3 |
| `PostCompact` | all | `$A hook` | reset epoch (cannot carry context, probed 2.1.278) | 89 ms | 0–1 |
| `SessionEnd` | all | `$A hook` | remove session state | 89 ms | 1 |

Removed from v1: `PostToolUse(Skill)` (no model invocation under D2 → no Skill tool call);
`PostToolUse(Edit|Write)` reminders (inert until a pack sets `remindOnEdit`, 89–143 ms per edit, G18;
returns with the first such pack); the `Read|Grep|Glob|LSP` recorder (13 §5).

Worst case per investigate run: 14 × 89 ms + 10 × 34 ms ≈ **1.6 s** of hook time. The MCP capture
scales with children (≤ 11); nothing scales with the model's reading.

## 2. Session state

`<scratchpad_dir>/ambicode-hook-state/` or `<tmpdir>/…/<hash(session)>/`: `epoch`,
`delivered/<epoch>/<hash>`, and `active-route` → `{task, skill}` (a pointer that duplicates the
ledger's latest `route` for this session; readers fall back to scanning `.ambicode/task/*`, P31).

## 3. Context budget per skill

Caps are enforced by byte-ceiling tests on every step file and compact output. **Expected** is what
the measured payloads suggest; **variable** is what the cap does not cover.

| Skill | Body | Start | Largest step | Report step | Fixed cap | Expected fixed | Variable (not capped) | v0.4.0 fixed files |
|---|---|---|---|---|---|---|---|---|
| investigate | 2.0 | 4 | 8 | 2 | 16 KB | 6–8 KB | requirement text (28 KB epic + ≤ 10 children in the real run); file read-back 14.5–17.6 KB when a step overflows | ≈ 21–27 KB |
| plan | 2.5 | 4 | 9 (file) | 3 | 18.5 KB | 8–12 KB | as above + the plan body once (78 KB in the real run) | ≈ 25–34 KB |
| task | 2.5 | 4 | 9 (file) | 3 | 18.5 KB | 8–12 KB | check and review output (≤ 262,144 bytes each, usually KB) | ≈ 27–37 KB |
| review | 2.0 | 3 | 2 | — | 7 KB | 4–5 KB | review output | ≈ 14–20 KB |

Peak context per run, both arms, is measured in 33 §7 (P32). The real run's 214k peak had ~80k of
double plan emission (fixed) and ~45 KB of requirement text; a 10-child epic will exceed it unless
captures reduce `search*` payloads (they do, 14 §3) and children are read one at a time (they are).

## 4. Delivery windows (M14)

Inline hook context ≤ 9,800 chars → else `steps/<id>.md` + 300-char preview ("Read it whole; N
bytes", one `Read` turn, G6). CLI output ≤ 30,000 shown; design cap 8,000; `--show` for the rest. Most
important content first.

## 5. Compaction

Skill bodies (≤ 2.5 KB) are re-attached by Claude Code and survive whole. The step in progress is
re-injected by the next `UserPromptSubmit` from the fold (one ledger read). Working notes are lost as
today; anything a later step needs is in the ledger or `steps/`.

## 6. Headless (`claude -p`) and the eval sandbox

- `route start --headless` records the mode; every gate then takes its **non-acting** default
  (draft, skip, decline, inline, list only, write nothing). To make a headless run act, the prompt
  passes `--default <gate>=<option>` explicitly, which is recorded `{via: flag}`.
- Interactive routes never take a default silently: three unanswered `route next` calls, then the
  non-acting option on record (12 §3.4).
- Guard `ask` fails in headless → `stop:blocked`, report leads with it (G20).
- Sandbox: no MCP; requirement text in the prompt → `builtFrom: model` envelope; `index: none`;
  **every case prompt must type the command** (`/ambicode:investigate …`) because nothing fires on a
  plain question (M22, D2); whether `UserPromptSubmit` fires and expands it in the sandbox is probe
  P37 and runs before anything else (33 §0).
- The ledger is copied out of the sandbox with the traces (33 §0).

## 7. Subagents

Only the main thread runs routes and the Stop hook (`agent_id` absent). The appendix workers (17)
wait on P21.

## 8. Week-one situations

| Situation | Behaviour |
|---|---|
| The user types another `/ambicode:` command mid-route | the open route gets `exit {superseded}`; the new route starts (12 §2) |
| The user asks an unrelated question mid-route | the route stays open and silent; the Stop hook ignores non-report stops; the next `route next` resumes |
| Two `/ambicode:investigate ORD-17 …` with different questions | different args hash → a second route on the same slug; `note list` shows both notes |
| A task directory holds several plans | `task` opens the latest `plan`; `--plan <file>` picks; a `plan-draft` needs `--from-draft` (recorded) |
| Resuming iteration N | `notes.md` carries `<!-- ambicode iteration: N done -->` from `note save --iteration`; the route starts at N+1's brief |
| Monorepo, two projects, hook-run start | the start message is a gate; release `route next --project <id>` |
| Windows | the Bash tool runs Git Bash; the POSIX parser applies (assumption, P40, smoke-tested) |
| A ticket read outside any route | nothing happens (D2) |
| The human steps away for an hour | nothing stops; `wallMinutes` applies only in headless |

## 9. What the harness never does

Calls the model on its own; writes outside `.ambicode/`; hides a step (`route status` prints the
fold); keeps a counter the ledger does not hold; acts on an unanswered gate.

# The plugin's own harness on top of Claude Code

Claude Code owns the loop (think → tool → result), the tools, permissions and compaction. The
plugin adds a second, narrower loop inside it: **route step → model work → evidence → next step**.
This file says exactly which platform mechanisms carry that loop, what each costs, and what
happens at the platform's edges (compaction, headless, subagents, sandbox).

## 1. Hook matrix

| Event | Matcher / `if` | Handler | Does | Cost per fire (M15) | Fires per run (est.) |
|---|---|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear\|fork` | `$A hook` | reset epoch; inject the contract (≤ 300 words, trimmed from 370) | 89 ms | 1 |
| `UserPromptSubmit` | all | `$A hook` | re-inject the contract after compaction; `^/ambicode:(\w+)` → `route start`; mid-route → re-inject the current step when the epoch changed | 89 ms; + route start work | 1–3 |
| `PostToolUse` | `Skill` | `$A hook` | `route start` (idempotent with the prompt hook) | 89 ms | 0–1 |
| `PostToolUse` | `mcp__.*(atlassian\|jira\|confluence\|rovo).*` | `$A hook` | `requirement {rawHash}`; route continues (normalize, acs, map, before-work) | 89 ms + map (0.3–1 s; index warm ≤ 0.5 s) | 1–4 |
| `PostToolUse` | `AskUserQuestion` 🆕 | `$A hook` | record `acceptance`/`declined` for the open gate | 89 ms | 0–3 |
| `PostToolUse` | `Read\|Grep\|Glob\|LSP` 🆕 optional | `recorder.mjs` (standalone) | append `tool` | ~34 ms | 10–30 |
| `PostToolUse` | `Edit\|Write` | `$A hook` | `remindOnEdit` rules (unchanged; inert until a pack opts in) | 89–143 ms | 0–10 |
| `PreToolUse` | `Bash` with `if: Bash(git *)`, `Bash(glab mr*)`, `Bash(*.ambicode/task*)`, `Bash(*ambicode.mjs*)` 🆕 (for `updatedInput --task`) | `guard.mjs` | ask / deny / add `--task` | 34 ms | 2–10 |
| `PreToolUse` | `Write\|Edit\|MultiEdit\|NotebookEdit` | `guard.mjs` | deny under `.ambicode/task/`; optional ask outside the map | 34 ms | 0–10 |
| `Stop` 🆕 | all | `$A hook` | the report check, block once | 89 ms + transcript tail read | 1–2 |
| `PostCompact` | all | `$A hook` | reset epoch only (cannot carry context; probed on 2.1.278) | 89 ms | 0–1 |
| `SessionEnd` | all | `$A hook` | remove session state | 89 ms | 1 |

Worst case per investigate run: ≈ 1 + 3 + 1 + 4 + 2 + 30·0.034/0.089 + 10 + 2 + 1 ≈ 24 CLI spawns
(~2.1 s) + 30 recorder spawns (~1.0 s). The recorder is the only item that scales with the model's
reading; it ships behind `evidence.recordTools: true` and is removed if 33 §7 shows > 2 s per run.

## 2. Session state

Unchanged location: `<scratchpad_dir>/ambicode-hook-state/` or `<tmpdir>/…/<hash(session)>/`, with
`epoch` and `delivered/<epoch>/<hash>`. New: `active-route` → `{task, skill}` so `UserPromptSubmit`
and `Stop` can find the ledger without scanning `.ambicode/task/*` (they fall back to the scan when
the file is missing). Nothing route-related is in the session state that is not also in the ledger.

## 3. Context budget per skill

Target: ≤ 3 modules in context at once (M17) and ≤ 20 KB fixed text per route.

| Skill | Body | Start | Largest step | Report step | Fixed total | v0.4.0 fixed (body + refs + hook payload) |
|---|---|---|---|---|---|---|
| investigate | 2.0 | 4 | 8 | 2 | ≈ 16 KB | ≈ 21–27 KB |
| plan | 2.5 | 4 | 9 (file) | 3 | ≈ 18.5 KB | ≈ 25–34 KB |
| task | 2.5 | 4 | 9 (file) | 3 | ≈ 18.5 KB + check/review output | ≈ 27–37 KB |
| review | 2.0 | 3 | 2 | — | ≈ 7 KB + review output | ≈ 14–20 KB |

The numbers in the right column are the sum of today's file sizes (skills 6.5–10.6 KB,
`requirements-mcp.md` 5.4 KB, `prepare-output.md` 4.7 KB, hook payload 4–16 KB). The left column is
the design's cap, enforced by `context-cost.test.ts` style ceilings on every route step file and on
every module's compact output. A step over its cap fails the build.

## 4. Delivery windows (M14)

- Inline hook context ≤ 9,800 chars. A step over it goes to `steps/<id>.md` with a 300-char preview
  and "Read it whole; N bytes". Cost: one `Read` turn (G6 measured it as exactly that).
- CLI output ≤ 30,000 chars shown whole; design cap 8,000 for any step reply. `--show <section>` for
  the rest.
- Every payload starts with what matters most (route header, then the instruction, then the map,
  then rules), so a truncation by the model's own `head -c` loses rules, not the instruction.

## 5. Compaction

- Invoked skill bodies are re-attached by Claude Code (first 5,000 tokens each; not re-probed). The
  bodies are ≤ 2.5 KB, so they survive whole.
- The step in progress is not in the body. After compaction the next `UserPromptSubmit` sees a new
  epoch and re-injects the current step from the fold (one ledger read, one route file read).
- The model's working notes (hypotheses, half-read files) are lost as today. The route's answer:
  anything the next step needs is in the ledger or in `steps/`, and the report step regenerates
  its sections. Workers' artifacts live on disk.

## 6. Headless (`claude -p`) and the eval sandbox

- Every gate has a default release (12-route §3.4), so a headless run never waits. The defaults are
  the conservative option: draft, skip, decline, inline.
- The guard's `ask` becomes a refusal in headless; the route records `stop:blocked` and the report
  leads with it (G20).
- The eval sandbox has no MCP and may have no index tool: `map` says `index: none`; requirements come
  inlined in the prompt and the route treats them as `relation: asked, via: prompt` (no hash).
- Hook events are not visible in stream-json traces (G12). The ledger is: eval scoring reads
  `.ambicode/task/*/ledger.jsonl` from the sandbox after the run (the harness copies traces already;
  it copies the task directory too, 33 §1).

## 7. Subagents

- A plugin `agents/` entry per worker (17-workers). `agent_id` in hook payloads lets the guard and the
  recorder tag entries with the worker id; the Stop hook runs only for the main thread (no `agent_id`).
- Whether plugin subagents inherit the session's MCP servers is P21.

## 8. What the harness never does

- Never calls the model itself except through a worker the human approved.
- Never writes to the repository outside `.ambicode/` (and the index cache under it).
- Never hides a step: `route status` prints the same fold the engine uses.
- Never keeps a counter the ledger does not hold.

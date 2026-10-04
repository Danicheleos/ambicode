# Module: Guard (PreToolUse decisions, Stop hook, gate releases)

## Purpose

Enforce the few rules that must hold regardless of the model (C1): no git writes without a human,
no agent writes under `.ambicode/task/` except the one plan body file, no report-shaped stop that
contradicts the ledger. Never deny a legitimate action (M12); never wedge the session (R12).

## Inputs

`PreToolUse` for `Bash` (via `if:` matchers; non-matching calls spawn nothing) and
`Write|Edit|MultiEdit|NotebookEdit`; `Stop` (last assistant message from `transcript_path`, the
active route from session state or the ledger scan); `PostToolUse(AskUserQuestion)` for gate answers.

## Outputs

`permissionDecision: ask|deny|allow` with a reason; `updatedInput` adding `--task <slug>` to an
`ambicode` command that lacks it while a route is active; `Stop`: `decision: block` with a reason,
at most once per route.

## Workflow

### 1. Decision table

| Tool / command | Decision | Release |
|---|---|---|
| `git commit\|push\|stash(save\|pop\|drop)\|reset\|checkout\|clean\|rebase\|merge\|branch -D`, `glab mr *` | **ask** | human approves; never deny |
| read-only git | allow (no spawn) | — |
| Write/Edit on `.ambicode/task/**` | **deny** | `note save`, named exactly |
| **Write/Edit on `.ambicode/task/<slug>/steps/plan-body.md` while a plan route is active** 🆕 | allow | — |
| Bash writing into `.ambicode/task/**` (redirect, `tee`, `sed -i`, `cp/mv/rm` target) | **deny** | same |
| `ambicode note save` in any segment, any prefix | allow | — |
| Write/Edit on `.ambicode/config.yaml` while an init route is active | deny | `init --apply --set` |
| Edit outside the map's paths during `task` | **ask** "re-map first" — `guard.askOutsideMap`, **off** | — (G17, P18) |
| `ambicode <cmd>` without `--task` while a route is active | allow + `updatedInput` | — |
| `rm -rf`, `git clean -fdx` on the repo root | ask | — |

### 2. Structural command parsing (M12)

1. Split into segments on `&&`, `||`, `;`, `|`, newline, outside quotes and outside heredoc bodies
   (`<<WORD`, `<<'WORD'`, `<<-WORD` to the matching line).
2. Tokenise each segment (shell words; quotes removed; `$VAR`, `$(…)` opaque).
3. Classify by `argv[0]` after `cd`, `env`, `node`, `npx`, `sudo` prefixes; a path is a write target
   only after `>`/`>>`, `tee`, `-i`, or as the last argument of `cp/mv/rm`.
4. Opaque tokens in a write position → **ask**, never deny (G14).

Fixtures (allow): `cd X && node "…/ambicode.mjs" note save --task T --kind plan <<'EOF'\nconst f = () =>
1; // .ambicode/task/\nEOF`; `grep foo > out.txt`; `echo ".ambicode/task"`. (deny): `echo x >
.ambicode/task/T/plan.md`; `tee .ambicode/task/T/notes.md`; `sed -i … .ambicode/task/T/notes.md`.
Standalone bundle, no imports (34 ms, M15). Shell: POSIX; on Windows Claude Code's Bash tool runs
Git Bash, so the same parser applies (assumption to verify in the Windows smoke test, P40).

### 3. Stop hook

Runs on the main thread only (no `agent_id`). Checks **only** when one of these holds:

- (a) an `exit` entry was appended since the last stop (the model ran `route stop`); or
- (b) the last assistant message begins with the report header the report step prescribes; or
- (c) the active route's artifact is a note and a `note` entry was appended since the last stop: the
  checked text is **the note file**, not the message.

Every other stop (a question, a progress line, mid-route text) **allows** without reading further.

Checks, mechanical only: every `path:line` cited exists and `line ≤ lines(file)`; the generated
Evidence / Not verified sections are present and unchanged (normalized diff; hash comment when
present); "accepted"/"approved" claims have an `acceptance` entry; "tests pass" has a `check {green,
summary.ran ≥ 1}`; red-before-green for a defect brief. Failure → `block` with the list and a `limit
{stop-block}` entry; a second failing stop in the same route → allow (one block only). If `Stop` cannot
carry the list, it goes to `stop-check.md` and the block reason names it (P17).

Latency: one ledger read, one transcript tail (read backwards, ≤ 1 MB), one note file. Transcript
unreadable → allow + `limit {stop-unreadable}` (P9).

### 4. Gates and releases

Every gate in every route is enumerated by a table test that drives accept, release, `--default`,
headless and three-unanswered through the engine (33 §8). A route file whose gate lacks `release` or
whose `default` is an acting option fails build validation.

## Interfaces

```ts
interface Guard {
  decide(input: PreToolUseInput): { permissionDecision; permissionDecisionReason?; updatedInput? };
  stopCheck(input: StopInput): { decision?: 'block'; reason?: string };
  parseCommand(command: string): Segment[];
}
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| `ask` in headless (G20) | the command fails; `onError permission-denied` → `stop:blocked`; report leads with it |
| Guard crash | exit 0, no decision, a stderr line; tested |
| Transcript format change | (b) cannot be evaluated → allow + diagnostic |
| A stop that is both a question and a report | (b) wins only if the header is first |

## What changes from v0.4.0

Structural parser; `updatedInput`; Stop hook scoped to report-shaped stops; plan-body allow row;
config deny during init; gate table validated at build.

## Open problems

- P9 Transcript reading, fails open.
- P17 `Stop` output fields: the repo's own probe (`docs/compatibility.md:383-387`) shows the 2.1.278
  schema accepts `Stop` in `hookSpecificOutput`; whether `additionalContext` is a field there is open.
- P18 Edit-time asks ship off until the task suite.
- P40 Windows: Git Bash assumption unverified.

# Module: Guard (enforcement: PreToolUse decisions, Stop hook, gate releases)

## Purpose

Enforce the few rules that must hold regardless of the model (C1): no git writes without a human,
no agent writes under `.ambicode/task/`, no report that contradicts the ledger. Everything else
stays advice with a reason (M4). The guard must never deny a legitimate action twice in a row
(M12) and must never wedge the session (R4).

## Inputs

- `PreToolUse` payloads for `Bash` (filtered by `if:` matchers so non-matching calls spawn nothing),
  `Write|Edit|MultiEdit|NotebookEdit`.
- `Stop` payloads: the last assistant message (from `transcript_path`, the only source; see P9) and
  the task directory (from the ledger's latest `route`).
- `PostToolUse` on `AskUserQuestion`: records gate answers (Route module uses them).

## Outputs

- `permissionDecision: ask|deny|allow` with a reason the model sees; optionally `updatedInput` (documented
  for PreToolUse) to add `--task <slug>` to an `ambicode` command that lacks it.
- `Stop`: `decision: block` with a reason, at most once per route (tracked by a ledger `limit {stop-block}`
  entry), then allow.

## Workflow

### 1. Decision table

| Tool / command | Decision | Release |
|---|---|---|
| `git commit\|push\|stash(save\|pop\|drop)\|reset\|checkout\|clean\|rebase\|merge\|branch -D`, `glab mr *` | **ask** | the human approves in the prompt; never deny |
| `git status\|diff\|log\|show\|stash list\|blame\|ls-files` | allow (no spawn: the `if:` matcher excludes them) | — |
| Write/Edit on `.ambicode/task/**` | **deny** | `note save`; the reason names the exact command |
| Bash writing into `.ambicode/task/**` (redirect, `tee`, `sed -i`, `cp/mv/rm` with that path as a target argument) | **deny** | same |
| `ambicode note save` in any segment, any prefix (`cd X &&`, `node "…"`) | allow | — |
| Edit outside the map's paths during `task` | **ask** with "re-map first: `$A map --task <slug> <path>`" | human approves; off by default (`guard.askOutsideMap: false`) until the task suite measures the ask rate (G17) |
| `ambicode <cmd>` without `--task` while a route is active | allow + `updatedInput` adds `--task <slug>` | — |
| `rm -rf`, `git clean -fdx` on the repo root | ask | — |

### 2. Structural command parsing (M12)

The regex-over-the-whole-string guard matched `=>` inside a heredoc body and `.ambicode/task` inside
quoted text. The parser becomes:

1. Split into segments on `&&`, `||`, `;`, `|`, newline, **outside quotes and outside heredoc bodies**
   (a heredoc starts at `<<WORD` / `<<'WORD'` / `<<-WORD` and ends at the matching line).
2. Tokenise each segment (shell words; quotes removed; `$VAR` and `$(…)` kept as opaque tokens).
3. Classify by `argv[0]` (after `cd`, `env`, `node`, `npx`, `sudo` prefixes) and by positional
   arguments: a path argument is "a target" only when it follows `>`/`>>`, `tee`, `-i`, or is the last
   argument of `cp/mv/rm`.
4. Opaque tokens (`$VAR`, `$(…)`, `bash -c "…"`) in a write position → **ask**, never deny (G14).

Regression fixtures (all must *allow*): `cd X && node "…/ambicode.mjs" note save --task T --kind plan
<<'EOF'\nconst f = () => 1; // .ambicode/task/\nEOF`; `grep foo > out.txt`; `echo ".ambicode/task" `;
and (all must *deny*): `echo x > .ambicode/task/T/plan.md`; `tee .ambicode/task/T/notes.md`; `sed -i …
.ambicode/task/T/notes.md`. The guard stays a standalone bundle with no imports (34 ms, M15).

### 3. Stop hook (new)

Runs once per assistant stop in the main thread. Steps:

1. Find the active route: latest `route` entry across `.ambicode/task/*/ledger.jsonl` for this session
   (the `route` entry records `session_id`). None → allow (no route, no rules).
2. Read the last assistant message from `transcript_path`. Unreadable → allow, append `limit
   {stop-unreadable}` (diagnostic, P9).
3. Checks, mechanical only:
   - every `path:line` cited exists and `line ≤ lines(file)` (paths resolved against the repository);
   - if the route reached its report step: the generated **Evidence** and **Not verified** sections are
     present and unchanged (hash comment or normalized diff, P6);
   - a sentence claiming acceptance ("accepted", "approved") has an `acceptance` entry;
   - "tests pass" / "checks passed" has a `check {exit:0}` entry for a key in the report;
   - an `exit` entry exists, or every step is done.
4. Any failure → `decision: block` with the list, and append `limit {stop-block, n:1}`. A second stop
   with failures → allow (one block only), and the report is left to the human with the hook's list
   appended as context where the event allows (if `Stop` cannot carry `additionalContext`, the list
   goes to `.ambicode/task/<slug>/stop-check.md` and the block reason names it).

The hook never judges prose. It never blocks a stop that is a question to the human (an
`AskUserQuestion` was the last tool call).

### 4. Gates and releases, the matrix

Every gate in every route, with its release, is a table the tests enumerate
([33-measurement.md](../33-measurement.md) §5). The guard owns the rule that the table is complete:
a route file with a gate lacking `release` fails schema validation at build time.

## Interfaces

```ts
interface Guard {
  decide(input: PreToolUseInput): { permissionDecision; permissionDecisionReason?; updatedInput? };
  stopCheck(input: StopInput): { decision?: 'block'; reason?: string };
  parseCommand(command: string): Segment[];      // exported for tests
}
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| `ask` in a headless run (G20) | the command fails; the route's `onError` for `permission-denied` is `stop:blocked` with the command named; the report leads with it |
| Guard crash | exit 0 with no decision (allow) and a line to stderr; a crashing guard must not block work. Tested. |
| Stop hook latency | reads one ledger and one transcript tail (last message only; the transcript is read backwards up to 1 MB) |
| Transcript format changes | step 2 fails → allow + diagnostic; nothing else depends on it |

## What changes from v0.4.0

- Structural parser replaces the regexes. `updatedInput` for `--task`. Stop hook. Ask-outside-map
  flag (off). Gate table validated at build.

## Open problems

- P9 The Stop hook reads the transcript, an undocumented format. It is designed to fail open.
- P17 `Stop` may not carry `additionalContext` (the guide says yes; the repo probed `PostCompact`
  cannot; `Stop` was not probed). The file fallback covers it.
- P18 Edits during `task` are unmeasured (1 Edit in 7,709 calls); the ask-outside-map rule is shipped off.

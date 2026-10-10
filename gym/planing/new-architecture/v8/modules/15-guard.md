# Module: Guard (PreToolUse decisions, Stop hook, gate releases)

## Purpose

Enforce the few rules that must hold regardless of the model (C1): no git writes without a human,
no agent writes under `.ambicode/task/` except the one plan body file, no report-shaped stop that
contradicts the ledger. Never deny a legitimate action (M12); never wedge the session (R12).

## Inputs

`PreToolUse` for `Bash` (via `if:` matchers; non-matching calls spawn nothing) and
`Write|Edit|MultiEdit|NotebookEdit`; `Stop` (last assistant message from `transcript_path`, the
active route from session state or the ledger scan); `PostToolUse(AskUserQuestion)` for gate answers
(12 §3.4).

## Outputs

`permissionDecision: ask|deny` with a reason, or `{}` (allow); `Stop`: `decision: block` with a
reason, at most once per route.

## Workflow

### 1. Decision table

`hooks.json` sends Bash calls to `guard.mjs` only when one of `Bash(git *)`, `Bash(glab mr*)`,
`Bash(*.ambicode/task*)`, `Bash(*ambicode.mjs*)` or `Bash(rm *)` matches.

| Tool / command | Decision | Release |
|---|---|---|
| `git commit\|push\|reset\|checkout\|clean\|rebase\|merge`, `git stash` except `list`/`show`, `git branch -D` (or `-d -f`), an alias or expansion naming the git operation, `glab mr *` | **ask** | human approves; never deny |
| read-only git | allow | — |
| Write/Edit on `.ambicode/task/**` | **deny** | `note save`, named exactly |
| Write/Edit on `.ambicode/task/<slug>/steps/plan-body.md` while this session owns the task's live plan route (the chain's latest `route` entry is this session's, 12 §2.3, H2) | allow; after another session's `--adopt`/`--fresh` → deny naming `route-taken-over`; no route, another skill's route or another owner → deny | the plan skill's `allowed-tools` grants `Write(.ambicode/task/*/steps/plan-body.md)` (#57) |
| Bash writing into `.ambicode/task/**` (redirect, `tee`, `sed -i`, `cp/mv/rm` target), a literal target | **deny** | `note save`; the plan body has its own message |
| the same with a target only the shell can resolve (`$VAR`, `$(…)`), or relative after a `cd` in the same command | **ask**, never deny (G14) | — |
| a command the parser cannot close (unbalanced quote) that mentions git or `.ambicode/task` | **ask** | — |
| `rm -r` of the working directory, an ancestor, `/`, home or `*` | **ask** | — |
| Write/Edit on `.ambicode/config.yaml` or `.gitignore` while an init route is active | deny | answer the init gate; `init --apply` writes both |
| `ambicode check --approve` / `review --approve` typed by the model | allow the command; the **CLI** honours the flag only under 12 §3.4 (an `acceptance` for that key on record — a bound hook answer or a consumed preanswer; never the flag itself, whatever the route's mode or channel, G1, C1, #137) — not a guard decision (#84) | the gate |
| any `ask` while the active route is **headless** | **deny** with "run `route stop --reason blocked --detail "permission-denied: …"` and finish with `permission-denied: <what>`" (B12) | — |

### 2. Structural command parsing (M12)

1. Split into segments on `&&`, `||`, `;`, `|`, newline, outside quotes and outside heredoc bodies
   (`<<WORD`, `<<'WORD'`, `<<-WORD` to the matching line).
2. Tokenise each segment (shell words; quotes removed; `$VAR`, `$(…)` marked opaque).
3. Classify by `argv[0]`; a path is a write target only after `>`/`>>`, `tee`, `-i`, or as the last
   argument of `cp/mv/rm`.
4. Opaque tokens in a write position → **ask**, never deny (G14). Expansions are not parsed: a
   command nested in `$(…)`, backticks or `<(…)` is matched by its text and asks.

Fixtures (allow): `cd X && node "…/ambicode.mjs" note save --task T --kind plan-draft <<'EOF'\nconst f = () =>
1; // .ambicode/task/\nEOF`; `grep foo > out.txt`; `echo ".ambicode/task"`. (deny): `echo x >
.ambicode/task/T/plan.md`; `tee .ambicode/task/T/notes.md`; `sed -i … .ambicode/task/T/notes.md`.
Standalone bundle, no imports: **26,152 B** (was 76,295 B), capped by `src/architecture.test.ts` at
26,152 + 512 B. Shell: POSIX; on Windows Claude Code's Bash tool runs Git Bash, so the same parser
applies (assumption to verify in the Windows smoke test, P40).

### 3. Stop hook

Runs on the main thread only (no `agent_id`). Checks **only** when one of these holds:

- (a) an `exit` entry was appended since the last stop (the model ran `route stop`, or the route
  ended); or
- (b) the last assistant message begins with the heading of the route's last model step (the report
  header that step prescribes); or
- (c) the route's open step is `answer: note` (investigate's `read`): the final message is the
  note when it cites at least one repository file, and a `note` entry saved since the last stop
  makes the note file the checked text.

Every other stop (a question, a progress line, mid-route text) **allows** without reading further.

Checks, mechanical only: every `path:line` cited exists and the line is within the file (an answer's
range is judged by its start); the generated Evidence / Not verified sections are present and
unchanged (normalized diff; hash comment when present); red-before-green for a defect brief (a
failing run precedes the first green one per check key); on the review route the "not covered" block
of the recorded review is reproduced verbatim. Failure → `block` with the list (at most 2,048
bytes), the full list in `stop-check.md`, and a `limit {stop-block}` entry; a second failing stop in
the same route → allow (one block only). An `answer: note` answer that passes is saved as the note
and the route advances as `note save` would; one that fails is kept in `answer-blocked.md` and the
reason asks the user whether to keep it or rewrite it. A final model step (`final: true`) is
completed at Stop, and a user-set headless route stopped anywhere else ends `inconclusive`.

Latency: one ledger read, one transcript tail (read backwards), one note file. Transcript
unreadable → allow + `limit {stop-unreadable}` (P9). A skipped Stop writes its reason to stderr.

### 4. Gates and releases (both classes)

A table test enumerates **every declared gate in every route file and every raised gate in
`routes/gates.yaml`** and drives: accept, release, `--answer`, `--default`, headless, three
`route next` with `asked = 0` (→ `never-asked`), every declared `onAnswer: revise` to its
`maxRevises`, and every `onFail: revise` to its `repeat` (#42, #43, #75). A gate with no `release`,
or whose `default` is an acting option **or missing** (#80), fails build validation. Model-raised
`decision:*` gates are tested through the registry entry (default *keep open*).

## Interfaces

```ts
guardDecision(input: GuardInput, pluginRoot?: string, state?: GuardState): Record<string, unknown>;   // PreToolUse
stopHook(ports, input: HookInput, options?): Promise<StopHookOutput | null>;                          // Stop (harness/engine/stop.ts)
parseCommand(command: string): Segment[];
```

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| `ask` in headless (G20) | deny with the `route stop --reason blocked` message; the model finishes with `permission-denied: <what>` (33 §7, #74) |
| Guard crash | exit 0, no decision, a stderr line; tested |
| Transcript format change | (b) cannot be evaluated → allow + diagnostic |
| A stop that is both a question and a report | (b) wins only if the header is first |

## What changes from v0.5.0

Structural parser; Stop hook scoped to report-shaped stops; plan-body allow row; config and
`.gitignore` deny during init; headless ask → deny; gate table (both classes) validated at build.

## Open problems

- P9 Transcript reading, fails open.
- P17 `Stop` output fields: the repo's own probe (`docs/compatibility.md:383-387`) shows the 2.1.278
  schema accepts `Stop` in `hookSpecificOutput`; whether `additionalContext` is a field there is open.
- P18 Edit-time asks: `guard.askOutsideMap` is still a config key (default false) but `guard-core.ts` has no row for it; it waits for the task suite.
- P40 Windows: Git Bash assumption unverified.

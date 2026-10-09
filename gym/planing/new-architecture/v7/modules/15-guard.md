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

`permissionDecision: ask|deny|allow` with a reason; **`updatedInput`** adding `--task <slug>` to an
`ambicode` command that lacks it while a route is active — **unverified platform behaviour** (no
mention in `docs/compatibility.md` or `src/types/hook.ts`; probe P47 before 41 step 1; the
fallback is that every step text already carries `--task <slug>`, so nothing depends on it, #64);
`Stop`: `decision: block` with a reason, at most once per route.

## Workflow

### 1. Decision table

| Tool / command | Decision | Release |
|---|---|---|
| `git commit\|push\|stash(save\|pop\|drop)\|reset\|checkout\|clean\|rebase\|merge\|branch -D`, `glab mr *` | **ask** | human approves; never deny |
| read-only git | allow (no spawn) | — |
| Write/Edit on `.ambicode/task/**` | **deny** | `note save`, named exactly |
| Write/Edit on `.ambicode/task/<slug>/steps/plan-body.md` while a plan route is active **and this session owns it** (the chain's latest `route` entry is this session's, 12 §2.3, H2) | allow; after another session's `--adopt`/`--fresh` → deny naming `route-taken-over` | — (the plan skill's `allowed-tools` grants `Write(.ambicode/task/*/steps/plan-body.md)`, #57) |
| Bash writing into `.ambicode/task/**` (redirect, `tee`, `sed -i`, `cp/mv/rm` target) | **deny** | same |
| `ambicode note save\|promote` in any segment, any prefix | allow | — |
| Write/Edit on `.ambicode/config.yaml` while an init route is active | deny | `init --apply --set` |
| Write/Edit on `.gitignore` while an init route is active | deny | `init --apply` writes it on acceptance (30 §9) |
| Edit outside the map's paths during `task` | **ask** "re-map first" — `guard.askOutsideMap`, **off** | — (G17, P18) |
| `ambicode <cmd>` without `--task` while a route is active | allow + `updatedInput` (if P47 holds) | — |
| `ambicode check --approve` / `review --approve` typed by the model | allow the command; the **CLI** honours the flag only under 12 §3.4 (an `acceptance` for that key on record — a bound hook answer or a consumed preanswer; never the flag itself, whatever the route's mode or channel, G1, C1, #137) — not a guard decision (#84) | the gate |
| `rm -rf`, `git clean -fdx` on the repo root | ask | — |
| native `Read`, or `cat`, `sed -n`, `head`, `tail` on a tracked repository file, while the route's latest `step` entry is `delivered` with `answer: note` (D5; not `.ambicode/**`, not outside the repository, not `grep`/`ls`/`find`/`wc`, not a `\| head` filter) | headless **deny**, interactive **ask**, reason `use: node "<cli>" read --task <task> <path[:a-b]>` | the `read` command |

### 2. Structural command parsing (M12)

1. Split into segments on `&&`, `||`, `;`, `|`, newline, outside quotes and outside heredoc bodies
   (`<<WORD`, `<<'WORD'`, `<<-WORD` to the matching line).
2. Tokenise each segment (shell words; quotes removed; `$VAR`, `$(…)` opaque).
3. Classify by `argv[0]` after `cd`, `env`, `node`, `npx`, `sudo` prefixes; a path is a write target
   only after `>`/`>>`, `tee`, `-i`, or as the last argument of `cp/mv/rm`.
4. Opaque tokens in a write position → **ask**, never deny (G14).

Fixtures (allow): `cd X && node "…/ambicode.mjs" note save --task T --kind plan-draft <<'EOF'\nconst f = () =>
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

### 4. Gates and releases (both classes)

A table test enumerates **every declared gate in every route file and every raised gate in
`routes/gates.yaml`** and drives: accept, release, `--answer`, `--default`, headless, three
`route next` with `asked = 0` (→ `never-asked`), every declared `onAnswer: revise` to its
`maxRevises`, and every `onFail: revise` to its `repeat` (#42, #43, #75). A gate with no `release`,
or whose `default` is an acting option **or missing** (#80), fails build validation. Model-raised
`decision:*` gates are tested through the registry entry (default *keep open*).

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
| `ask` in headless (G20) | the command fails; `onError permission-denied` → `stop:blocked`; report leads with it; counted per headless run (33 §7, #74) |
| Guard crash | exit 0, no decision, a stderr line; tested |
| Transcript format change | (b) cannot be evaluated → allow + diagnostic |
| A stop that is both a question and a report | (b) wins only if the header is first |
| `updatedInput` ignored by the platform | the command runs as typed; `--task` is in the step text anyway |

## What changes from v0.5.0

Structural parser; `updatedInput` (if P47); Stop hook scoped to report-shaped stops; plan-body allow
row; config and `.gitignore` deny during init; gate table (both classes) validated at build.

## Open problems

- P9 Transcript reading, fails open.
- P17 `Stop` output fields: the repo's own probe (`docs/compatibility.md:383-387`) shows the 2.1.278
  schema accepts `Stop` in `hookSpecificOutput`; whether `additionalContext` is a field there is open.
- P18 Edit-time asks ship off until the task suite.
- P40 Windows: Git Bash assumption unverified.
- P47 `updatedInput` unverified; nothing depends on it.

## v7 changes

- **Matchers (B11).** `hooks.json` adds `Bash(*ambicode.mjs*)` and `Bash(rm *)` to the guard's `if:` list, so the root-deletion row is reachable. For a bound route the guard answers `allow` with `updatedInput` adding `--task` (`PLATFORM.updatedInput`; contract not verified live).
- **Headless (B12).** In a headless route a guard `ask` becomes a deny telling the model to run `route stop --reason blocked --detail "permission-denied: ..."`; the guard stays ledger-free. Bundle cap 70 KiB (measured in bytes by the architecture test).
- **D2 (zsh glob).** `hooks.json` adds `Bash(*--include=*)`, `Bash(*--exclude=*)` and `Bash(*--exclude-dir=*)`; an unquoted `--include=*.ts`-style glob value (also `--include *.ts`) is single-quoted through `allow` + `updatedInput`, composed with the `$R` and `--task` rewrites; any `ask`/`deny` wins. Found through the parser's glob words, so heredocs, quoted text, comments and brace values are left. Bundle cap raised to measured 72569 B + 512 B.
- **D5 (reading through `read`).** `hooks.json` adds `Read` to the guard's matchers and `Bash(cat *)`, `Bash(sed *)`, `Bash(head *)`, `Bash(tail *)` to its `if:` list (see the decision table row). The engine records `answer: note` on the delivered `step` entry, so the guard needs no route YAML; the repository is the nearest directory up from the cwd holding the task's ledger. Bundle 75921 B (+3352 B), cap +512. A `PostToolUse` `Read|Grep|Glob` entry appends `tool{name, step, path?, bytes?}` to the active route's ledger (no fold).
- **B10.** The tool-turns counter is removed.

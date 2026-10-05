# Step 1 — Guard: structural command parser, decision table, route-aware rows

> **Dispatch**: use 00-README defaults; no model spend. Prerequisite: step 00 integrated (commit
> 40b7334). Attach P47 result; if absent/unrun, do not build updatedInput. Read
> [01-contracts](01-contracts.md) and [05-working-rules](05-working-rules.md) as well.
> Owner: command parser, guard classifier, plan ownership reader, existing guard tests/hooks.
> Approved source: [v6 step 01](../migration-plan_v6/step-01-guard.md). Design:
> [v6/15](../v6/modules/15-guard.md) §1–§2 and Failure modes, [v6/30](../v6/30-harness.md) §1–§2,
> [v6/41](../v6/41-migration.md) step 1.

## Review status

Step 01 is already implemented under the v6 brief and went through four review revisions without
converging. With this brief, round counting restarts under [05-working-rules](05-working-rules.md)
§3: the next review is **round 1 against this brief**, and there are at most two rounds. Findings
from earlier rounds are not carried over; a reviewer re-raises one only if it breaks a numbered rule
below, with a failing test or an exact reproducing command.

## Goal

The guard decides Bash commands from their shell structure, not from a regex over the whole string,
so it never denies a legitimate `note save` again (M12, real-run B3) and never wedges the session
(R12). It gains the route-aware rows the later routes need: the plan-body exception, decided by one
import-free `ownerOf` predicate, and the init rows. Startup stays within 50 ms.

## Starting point

Base revision 40b7334 ("00-harness"), before step 01:

- `src/hook/guard-core.ts` (76 lines, no imports): regex classification. `GIT_WRITES` =
  `commit, push, stash, reset, checkout, clean`; `stash list|show` read-only. `taskDirectoryWrite`
  matches `.ambicode/task` anywhere in the command, so a heredoc body that mentions the path is
  denied (the B3 defect). `noteSaveReason(pluginRoot)` names
  `note save --task <slug> --kind investigation|plan|notes`.
- `src/hook/guard.ts` (17 lines): stdin → `guardDecision` → stdout; swallows errors silently.
- `src/hook/guard.test.ts` (123 lines), including a "survives garbage" built-bundle test.
- `src/hook/markers.ts` (74 lines): `hookStateBaseDir(fs, sessionId, scratchpadDir?)` →
  `<scratchpad_dir>/ambicode-hook-state`, else `<tmpdir>/ambicode-hook-state/<hash(session)>`
  (uses `node:path` and a sha256 content hash).
- `build.mjs`: entry `guard: 'src/hook/guard.ts'` → standalone `scripts/guard.mjs` (3,355 B).
- `hooks/hooks.json` `PreToolUse`: `Bash` with `if: Bash(git *)`, `Bash(glab mr*)`,
  `Bash(*.ambicode/task*)`; and `Write|Edit|MultiEdit|NotebookEdit`. `PostToolUse` has an
  `Edit|Write` entry (step 03 removes it).
- `src/route/ownership.ts` does not exist. Nothing writes `active-route` (step 03 will).
- Baseline startup of the pre-change bundle, 20 spawns, small `git status` input: medians
  34.1–37.0 ms on the reference machine (step-01 report); M15 says 34 ms.
- `npm run verify` at the base: 1008 tests, 1007 pass, 1 skipped (Windows-only U29).

**Current state.** The implementation is in the working tree (staged and unstaged). Its report is
`plan/migration-v6-reports/step-01/implementation.md` (revision 4): what was built, every deviation,
the decisions taken and pending, and "Not done". The working tree has unstaged parser and guard
changes made after that report (for example a `CDPATH` option, glob/brace write targets, an
`unparsed` segment for constructs bash and zsh read differently, git-alias detection). Recheck at
dispatch with `git status`, `git diff --cached` and `git diff`; the report must describe the tree as
it stands (01-L3).

## Files

Budgets are the as-built source sizes (tests excluded), recorded in the report at dispatch of round
1. A fix round may grow a file only to close a BLOCKER or SCOPE finding, and names the finding id.

| File | Built size (lines, at brief time) | Purpose |
|---|---|---|
| `src/hook/shell/command-parser.ts` | 1,398 | Structural parser; no imports (01-P rules) |
| `src/hook/guard/guard-core.ts` | 350 | Decision table; no I/O; imports only the parser and `ownerOf` (01-G, 01-B rules) |
| `src/hook/guard/guard-state.ts` | 84 | Bounded `node:fs` reads of the pointer and a task ledger (01-S rules) |
| `src/hook/guard/guard.ts` | 19 | Bundle entry: stdin/stdout, crash line (01-G13) |
| `src/route/ownership.ts` | 81 | `ownerOf(entries, slug)`; type-only import (01-O rules) |
| `src/hook/index.ts` | 26 | Barrel for the regrouped hook folder (01-L1) |
| `src/hook/session/markers.ts` | 73 | Moved; exports `HOOK_STATE_DIR_NAME` for the equality test |
| `src/hook/events/run-hook.ts`, `prepare-on-skill.ts` | 228, 203 | Moved; `deliverOnce()` consolidation; behaviour unchanged |
| `skills/review/references/outcomes.md` | +17 | Three guard paragraphs (01-H2) |
| `build.mjs`, `src/cli/main.ts`, `docs/compatibility.md` | 1 line each | Mechanical path changes for the regrouping |

Tests: `src/hook/shell/command-parser.test.ts`, `src/hook/guard/guard.test.ts`,
`src/route/ownership.test.ts`; moved `src/hook/events/*.test.ts`. Test size guide: as built; new
tests in a fix round only for the finding being fixed.

Unchanged (protected), byte-identical to 40b7334: `hooks/hooks.json` (including the `PostToolUse`
`Edit|Write` entry), every `skills/*/SKILL.md`. No other file changes.

## Contract

```ts
// src/hook/shell/command-parser.ts — no imports
export type Move = string | null | { maybe: string };      // literal dir | only the shell knows | only if an earlier command succeeded
export type Directories = readonly Move[];                   // changes from the hook's cwd, in force where the target resolves
export interface WriteTarget { path: string; opaque: boolean; pattern?: true; directories: Directories }
export interface Segment { argv: string[]; opaque: boolean[]; writeTargets: WriteTarget[]; raw: string; unparsed?: true }
export interface ParseOptions { bsdSed?: boolean; cdpath?: boolean }
export function parseCommand(command: string, options?: ParseOptions): Segment[];   // never throws

// src/route/ownership.ts — `import type { LedgerEntry }` only
export type PlanOwnership =
  | { task: string; state: 'owned'; session: string; routeId: string; chainIds: string[]; takenOver: string[] }
  | { task: string; state: 'none' }
  | { task: string; state: 'unknown'; reason: string };
export function ownerOf(entries: readonly LedgerEntry[], slug: string): PlanOwnership;

// src/hook/guard/guard-core.ts — no I/O
export interface GuardInput {
  hook_event_name?: string; session_id?: unknown; cwd?: unknown; scratchpad_dir?: unknown; tool_name?: string;
  tool_input?: { command?: unknown; file_path?: unknown; notebook_path?: unknown };
}
export interface ActiveRoute { task: string; skill: string }
export interface GuardState {
  activeRoute(scratchpadDir: string): ActiveRoute | null;
  ledger(taskDirectory: string): LedgerEntry[] | null;
}
export function guardDecision(input: GuardInput, pluginRoot?: string, state?: GuardState, platform?: string): Record<string, unknown>;

// src/hook/guard/guard-state.ts — node:fs only
export const GUARD_STATE_DIR_NAME = 'ambicode-hook-state';
export const ACTIVE_ROUTE_FILE = 'active-route';
export const GUARD_LEDGER_FILE = 'ledger.jsonl';
export const LEDGER_LIMIT = 1024 * 1024;
export const fsGuardState: GuardState;
```

Output shape: `{}` (no decision) or
`{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' | 'deny', permissionDecisionReason } }`.
The guard never emits `permissionDecision: 'allow'` in this step (D19). No persisted schema, no error
code, no release. Pointer file: `<scratchpad_dir>/ambicode-hook-state/active-route`, JSON
`{"task": "<slug>", "skill": "<skill>"}`, ≤ 4,096 bytes; read here, written by step 03.

## Rules

**Threat model.** The guard catches ordinary model mistakes: writing into `.ambicode/task/` with a
plain redirect, `tee`, `cp`, `mv`, `rm`, `sed -i` or a file tool, and running a state-changing git or
`glab mr` operation nobody asked for. It is not a sandbox and does not defend against input built to
evade it ([01-contracts](01-contracts.md) §5, [05-working-rules](05-working-rules.md) §3). Wherever
the guard cannot place a write or tell what runs, it asks; it never denies on uncertainty (G14).

**Parser (`src/hook/shell/command-parser.ts`)**

- **01-P1** The file has no imports. `parseCommand` never throws: an internal exception, or nesting
  deeper than 64 levels of commands or expansions, ends analysis there and adds one opaque write
  target or an `unparsed` segment; the segments read before it are kept.
- **01-P2** Segments split on `&&`, `||`, `;`, `|`, `&` and newline, outside single and double
  quotes and outside heredoc bodies. Heredoc forms: `<<WORD`, `<<'WORD'`, `<<"WORD"`, `<<-WORD`; the
  body runs to the line equal to WORD, and a `<<-` body also ends at a tab-indented WORD. CRLF line
  ends are accepted. **A heredoc body is never tokenised or inspected (M12).** A heredoc delimiter is
  only quote-removed, never expanded.
- **01-P3** Words are shell words with quotes removed. A word holding `$VAR`, `${…}`, `$(…)` or a
  backtick expansion is one token with `opaque[i] = true`.
- **01-P4** `argv[0]` is the first word after leading `K=V` assignments and the prefixes `env`
  (options and `K=V`), `sudo` (options), `node`, `npx`, plus the superset in D3. `cd <dir> &&` is
  its own segment.
- **01-P5** The bodies of `$( )`, backticks, `<( )` and `>( )`, including those inside `${…}` and
  `$(( ))`, are parsed as segments of their own (D3), so a git write inside them is classified.
- **01-P6** Write targets (D2): the word after `>`, `>>`, `&>`, `N>` (not `>&N`, not `2>&1`, not
  `/dev/null`); every operand of `tee`; every file operand of `sed -i`/`gsed -i` after the script
  (D13 for the suffix); for `cp`, the `-t`/`--target-directory` value, else the last operand; for
  `mv`, every operand and the `-t` value; for `rm`, every operand. An opaque word in a write position
  is a target with `opaque: true`.
- **01-P7** Each target carries the directory changes in force where it resolves (D14). `cd X && cmd`
  places `cmd` in X. A change that may or may not have happened (a `cd` followed by `;`, a `cd` in
  a branch or loop body, a loop that moves the shell) is a `{ maybe }` or `null` move. `( )`,
  pipeline elements other than the last, `&` lists and substitution bodies do not move what follows.
  Redirections on `cd`/`pushd` and on a compound command resolve where that command starts.
  `env -C`/`sudo -D` apply to that command's argv targets only.

**Guard decisions (`src/hook/guard/guard-core.ts`)** — 01-G1 first. For Bash, every segment is
classified (01-G2–01-G8); a deny (01-G5) wins over any ask, and all asks of one command are joined
into one reason. File tools go through 01-G10, then 01-G11.

- **01-G1** `hook_event_name !== 'PreToolUse'` → `{}`. A tool other than `Bash`, `Write`, `Edit`,
  `MultiEdit`, `NotebookEdit` → `{}`. Bash with a non-string `command` → `{}`.
- **01-G2** A segment whose `argv[0]` basename is `git`, after skipping `-C x`, `-c k=v` and other
  leading `--flag`/`-x` options, with subcommand `commit`, `push`, `reset`, `checkout`, `clean`,
  `rebase` or `merge` → **ask**; the reason begins
  ``AMBICODE: `git <subcommand>` changes repository or merge-request state.`` `stash`: the word right
  after `stash` is the action; `list` and `show` give no decision, every other action and a bare
  `git stash` ask (D1). `branch` with `-D`, or with both delete and force flags, asks as
  `git branch -D`. An opaque subcommand asks.
- **01-G3** A segment `glab mr …` → **ask**, naming `glab mr`.
- **01-G4** `rm` with a recursive flag (`-r`, `-R`, a cluster holding either, `--recursive` or a prefix of it of at
  least three characters) and a target of `/`, `~`, `*`, `./*`, `.`, `..`, or a path that resolves to
  the directory the command runs in, the hook's `cwd`, or an ancestor of either → **ask** (D6).
  `git clean -fdx` asks through 01-G2.
- **01-G5** A non-opaque Bash write target whose every possible place is under `.ambicode/task/`
  (lexically normalized, resolved against `cwd` and its directory changes) → **deny** with 01-R1.
- **01-G6** An opaque write target, or a relative target whose directory only the shell knows →
  **ask**; the reason contains `cannot tell where this writes`. Never deny (G14).
- **01-G7** A target with some possible places under `.ambicode/task/` and some outside → **ask**,
  reason contains `cannot tell where this writes`.
- **01-G8** A command not wholly analysed (01-P1) asks: its literal task-directory write gets the
  01-R1 text as an ask, not a deny.
- **01-G9** `note save` and `note promote` are not special-cased: a `node "…/ambicode.mjs" note save
  … <<'EOF' … EOF` command gets no decision because its body is never tokenised (01-P2) and it has no
  write target. A redirect of that same segment into `.ambicode/task/` still denies (D5).
- **01-G10** `Write`/`Edit`/`MultiEdit`/`NotebookEdit`: the path is `tool_input.file_path`, else
  `tool_input.notebook_path` (D4); not a non-empty string → `{}`. Normalized lexically against `cwd`
  (`\` read as `/`). Under `.ambicode/task/` → **deny** with 01-R1, unless it is the plan body (01-B1).
- **01-G11** File tools on a path ending `.ambicode/config.yaml` or `.gitignore`, with a non-empty
  `scratchpad_dir` whose pointer has `skill === 'init'` → **deny**; the reason names
  `init --apply --set`. Without a pointer the row does not fire (01-T1).
- **01-G12** Anything else → `{}`.
- **01-G13** `guard.ts` passes `fsGuardState` and `CLAUDE_PLUGIN_ROOT`. On any exception (malformed
  JSON included) it writes `ambicode guard: no decision: <message>` to stderr, prints `{}` and exits
  0 (15 Failure modes, D9).

**Reasons**

- **01-R1** The task-directory deny reason is exactly:
  ``AMBICODE: .ambicode/task/ is written only through `node "<pluginRoot>/scripts/ambicode.mjs" note save --task <slug> --kind investigation|plan|notes`, with the note on standard input. It names the file, stamps the time and adds the label. Run that instead.``
  `<pluginRoot>` is the `pluginRoot` argument (the hook's `CLAUDE_PLUGIN_ROOT`), default the literal
  `${CLAUDE_PLUGIN_ROOT}`. Step 02 changes the kinds and this test; this step does not pre-empt it.
- **01-R2** The taken-over deny reason begins
  `AMBICODE: route-taken-over: session <owner> took over the plan route on <slug> (route <routeId>);`.
- **01-R3** Every other plan-body deny reason begins
  `AMBICODE: steps/plan-body.md is written only by the session that owns the task's live plan route; <cause>.`
  and ends with the 01-R1 text.

**Plan-body exception**

- **01-B1** The exception applies only to a normalized path `<prefix>/.ambicode/task/<slug>/steps/plan-body.md`
  where `<prefix>` itself contains no `.ambicode/task`; `<slug>` is one path component.
- **01-B2** Checks in this order; the first failure denies (01-R3 with the cause in brackets):
  1. `session_id` is a non-empty string (`the hook named no session`);
  2. the task directory is absolute (`the hook gave no absolute path for it`);
  3. `scratchpad_dir` is non-empty and `activeRoute` returns a pointer (`no active route is on record for this session`);
  4. pointer `skill === 'plan'` and `task === <slug>` (names both);
  5. `ledger(<task directory>)` is not `null` (`… missing, unreadable or over 1 MiB`);
  6. `ownerOf(entries, slug)`: `none` → `no plan route is open on <slug>`; `unknown` → its `reason`;
  7. `owned` and `session === owner.session` → `{}`; `session` in `owner.takenOver` → 01-R2; else
     `session <owner> owns it`.
- **01-B3** A pointer alone never authorizes. A Bash write to the plan body denies under 01-G5 for
  every session, the owner included.

**Ownership predicate (`src/route/ownership.ts`)**

- **01-O1** The file's only import is `import type { LedgerEntry }`; it runs on entries already
  parsed by the caller and does no I/O. It is the single ownership predicate; step 03's assertOwner
  calls it (01-contracts §6).
- **01-O2** Entries are one task ledger's, in file order. A `route` with `skill: 'plan'` and no
  `resumes` starts a chain. A plan `route` whose `resumes` names a member of an open chain extends it;
  its `session` becomes the chain's owner and its id the `routeId`. An `exit` whose `route` names a
  chain member closes that chain with its `reason` (default `exit`); an exit naming an earlier
  non-plan route closes only that route. Entries of other kinds, including unknown kinds, are skipped;
  valid routes of other skills are accepted.
- **01-O3** `unknown` (never a guess) for: an entry without a non-empty string `id`; a repeated `id`;
  a `route` without a non-empty string `skill`; a route `session` or `resumes` present but not a
  non-empty string; a non-boolean `adopts`; a plan route with no `session`; a plan `resumes` naming no
  open plan route before it; a non-plan route resuming a plan chain id; an `exit` whose `route` is
  missing, empty or not an earlier route; a non-string exit `reason`; more than one open plan chain
  (D7).
- **01-O4** No open plan chain → `none`. One → `owned` with `session` and `routeId` of its latest
  route, `chainIds` in order, and `takenOver` = the other sessions of that chain plus every session
  of chains closed with reason `superseded`, minus the owner. Age and idle time play no part.

**Guard state reader (`src/hook/guard/guard-state.ts`)**

- **01-S1** Imports `node:fs` only. Constants as in the Contract; the pointer cap is 4,096 bytes.
- **01-S2** A read opens with `O_RDONLY | O_NONBLOCK`, `fstat`s the descriptor, returns `null` for
  anything that is not a regular file or is over its cap, and reads exactly the `fstat` size. Any
  error → `null`. A FIFO or directory never blocks.
- **01-S3** `activeRoute(dir)` reads `<dir>/ambicode-hook-state/active-route`; JSON with string
  `task` and `skill` → `{task, skill}`, anything else → `null`.
- **01-S4** `ledger(taskDir)` reads `<taskDir>/ledger.jsonl` up to `LEDGER_LIMIT` (D12). It is
  strict (D8): any non-blank line that is not a JSON object with string `id` and `kind` makes the
  whole result `null`.
- **01-S5** Equality tests pin `GUARD_STATE_DIR_NAME === HOOK_STATE_DIR_NAME` (markers.ts) and
  `GUARD_LEDGER_FILE` equal to the ledger module's file name (D10).

**Tmpdir fallback (pending user decision)**

- **01-T1** Built and done-state, option (a): the pointer is read only from `<scratchpad_dir>/…`.
  With no `scratchpad_dir`, the plan-body write denies (01-B2 step 3) and the init row (01-G11) does
  not fire. No other path or hash is computed. Branches, not part of this step's done-state:
  - (b) `node:os` + `node:crypto` allowed in the guard: a separate assignment amends 01-S1 and 01-M1,
    reads `<tmpdir>/ambicode-hook-state/<hash(session)>/active-route` with markers.ts's hash, and
    re-measures 01-M2 (about +2 ms measured).
  - (c) step 03 writes the pointer under a path computable with `node:fs` alone: step 03 adds that
    path to 01-S3 and its test; this step changes nothing.

**Measurement and bundle**

- **01-M1** The built `scripts/guard.mjs` statically imports exactly `node:fs` and `node:module` (the
  latter from the existing build banner) and loads at most 2 files (entry plus the existing shared
  chunk). No Runtime, zod, `node:path` or `node:crypto`.
- **01-M2** Startup on the final build (`npm run build`): 20 sequential spawns of `scripts/guard.mjs`
  per input, median ≤ 50 ms (33 §7) for (i) a small Bash input, (ii) a plan-body write with a small
  ledger, (iii) a plan-body write with a 1 MiB short-record ledger (the worst accepted case). Three
  rounds, interleaved with the pre-change bundle (40b7334) on the same small input; all round
  medians are reported, noisy rounds included (D17).
- **01-M3** `node fixtures/materialize.mjs ts-feature-boundary <tmp>`, then the built guard with that
  `cwd` on the synthetic B3 string and on the §3 `note save` heredoc fixture → `{}`, exit 0, empty
  stderr.

**Hooks, P47, documents, layout**

- **01-H1** P47 is not run, so there is no `updatedInput` row, no `Bash(*ambicode.mjs*)` matcher and
  no `docs/compatibility.md` hook-section change; the report says `P47: not run; row not built`.
  If a dispatcher later attaches a `held` result, v6 step 01 §5 applies verbatim as a separate
  assignment.
- **01-H2** `skills/review/references/outcomes.md` documents the guard reasons in three paragraphs:
  "Guard decisions", "`route-taken-over`", "Init owns its files". The existing skill-content tests
  stay green. No error code is added.
- **01-H3** Protected files are byte-identical to 40b7334 (Files). Nothing writes `active-route`.
  No Stop hook and no `AskUserQuestion` hook. No `allowed-tools` change.
- **01-L1** Hook sources live in `src/hook/{guard,shell,events,session}/` with `src/hook/index.ts`
  (D15). `build.mjs`'s guard entry is `src/hook/guard/guard.ts`. Events behaviour is unchanged: the
  moved `run-hook` and `prepare-on-skill` tests pass unchanged apart from import paths.
- **01-L2** `npm run verify` exits 0.
- **01-L3** The report follows [05-working-rules](05-working-rules.md) §4, describes the final tree
  only (history removed, ≤ 150 lines plus the rule→test table), and carries a **rule→test table**:
  every rule id above → the test name(s) that prove it (D18).

## Decided readings

- **D1** `git stash`: every action except `list`/`show` (as the word right after `stash`) asks,
  wider than v6 brief's `save|pop|drop`. 15 §1 lists only asks and never-deny; `apply`, `clear`,
  `branch`, `store`, `push` change the stash or tree, and narrowing would drop v0.4.0 asks.
- **D2** Write targets are wider than "last operand": `cp -t`, every `mv`/`rm`/`tee` operand, all
  `sed -i` forms. Keeps v0.4.0's denies (`mv .ambicode/task/T/x y`). Implements 15 §1 "Bash writing
  into `.ambicode/task/**`".
- **D3** Prefixes are a superset: also `time`, `xargs`, `nice`, `timeout`, `command`, `exec`,
  `nohup` with their valued options; shell keywords and `( )` separate commands; substitution
  bodies are re-parsed (01-P5). Implements R9 "parse structurally".
- **D4** `NotebookEdit` is checked through `notebook_path` (its real field); 15 §1 lists the tool.
- **D5** The note-save "allow" row is structural: no command is special-cased; the heredoc body is
  never read (M12); a redirect into the task directory in the same segment still denies.
- **D6** The `rm -r` root row also covers `~`, `*`, `./*`, and the directory the command runs in,
  the session `cwd` or an ancestor (through `cd`, `env -C`, `sudo -D`). Ask only (15 §1 row).
- **D7** `ownerOf` validates fields itself (no zod) and returns `unknown` for every malformed field
  that could hide a takeover; every caller fails closed. 01-contracts §1 "unreadable route state
  must not fold as empty/new".
- **D8** The guard's ledger reader is strict: one torn or foreign line makes the ledger `null`, so
  the exception fails closed. Step 03's assertOwner applies the same strictness or proves why not.
- **D9** On a crash the guard writes one stderr line (15 Failure modes: "exit 0, no decision, a
  stderr line"). v0.4.0 was silent.
- **D10** `ambicode-hook-state` and `ledger.jsonl` are duplicated as constants, pinned by equality
  tests; importing markers.ts or ledger.ts would bundle `node:path`/`node:crypto`.
- **D11** The v0.4.0 test `d=…; cat > "$f"` moves from the deny list to the ask list: its target is
  opaque, and G14 forbids denying it.
- **D12** Ledger cap 1 MiB (1,048,576 bytes), the 01-contracts §1 warning size. A 2 MiB short-record
  ledger measured 53.5–56.6 ms, over 33 §7; a larger ledger denies the plan-body write instead.
- **D13** `sed` is read per platform: BSD on `darwin` and `*bsd` (`-i` takes the next word as the
  suffix), GNU elsewhere and always for `gsed`. GNU-form deny fixtures run with `platform: 'linux'`.
- **D14** Directory model: a relative write whose directory is uncertain (conditional `cd`, `cd X;
  cmd`, branch or loop body, a loop that moves the shell, a `cd` in the last pipeline element or a
  function, opaque `cd`, `cd -`, `pushd +N`, `popd`, compound-command redirections, more than 16
  possible places) resolves to **ask**, never deny. Absolute targets stay definite. Implements G14.
- **D15** The hook regrouping into `guard/`, `shell/`, `events/`, `session/` with `index.ts` (and
  `deliverOnce()` in `run-hook.ts`) was requested by the user and is accepted; it is not SCOPE.
- **D16** The route-aware rows need a bounded state and ledger read despite 15 §2's "no imports":
  `node:fs` sync reads are the only addition (v6 brief §2).
- **D17** 01-M2 is met when every reported 20-spawn median of the final build is ≤ 50 ms. A round
  where the unchanged pre-change bundle is itself ≥ 10% above its lowest round median is noisy: it
  is repeated once, both are reported, and the budget is judged on the repeat.
- **D18** Existing test names need not carry rule ids; the report's rule→test table is the mapping.
  New tests added in a fix round are named after their rule (05 §2.4).
- **D19** "allow (no decision)" in the v6 table is `{}`. `permissionDecision: 'allow'` is reserved
  for the P47 row, which is not built.
- **D20** Code already built beyond these rules (including the post-report working-tree changes in
  Starting point) is accepted as is for this step and is not a SCOPE finding, as long as it emits
  ask, never deny, where it is uncertain. It must not be extended. Trimming it is a separate user
  decision (Hand-off).

## Non-goals (a reviewer may not raise these)

The guard is not a security sandbox. None of these is a BLOCKER or SCOPE finding, and none may be
added in a fix round. Where the tree already models one of them, that code is accepted as is (D20)
and not extended.

- Adversarial or crafted input of any kind: commands built to defeat the parser, not produced by a
  model or user in ordinary use.
- Further shell-semantics modelling: zsh `repeat`/`foreach` blocks; bash 4 `${X^}`, `${X,}`
  operators; zsh parameter flags (`${(S)X…}`); aliases; `CDPATH`; functions called after their
  definition (a body is read where it is defined); a branch condition tied to its body; `case`
  patterns beyond harmless words; heredocs read differently by bash 3.2; more than 16 possible
  places (already ask).
- Additional write detectors: `truncate`, `touch`, `dd of=`, `ln`, `rmdir`, `install`, `rsync`,
  scripting languages writing files (`python -c`, `node -e`), valued `sudo` options outside the set.
- Windows and Git Bash paths beyond lexical handling (`\` → `/`, `C:/`); P40 is unverified.
- Matcher reach of `hooks/hooks.json`: the `if:` matchers decide which Bash calls reach the guard
  (15 §1: non-matching calls spawn nothing), so `echo x > $OUT` alone never reaches it. Unchanged by
  design; widening costs a ~35 ms spawn per Bash call.
- Multi-host, multi-user or networked state; symlink resolution; real filesystem checks of targets.
- The tmpdir fallback (01-T1 (b)/(c)); the `updatedInput` row (01-H1).
- Writing `active-route`, the Stop hook, the `AskUserQuestion` hook, the `allowed-tools` plan-body
  grant, removing `PostToolUse(Edit|Write)`, assertOwner, the real two-session S11 run (steps 03/06).
- Changing the deny-reason kinds (step 02), or any CLI command.
- Refactoring, splitting or consolidating the parser further; performance work beyond 01-M2.
- Updating CLAUDE.md's test count.

## Tests

Each test proves the named rules. Existing tests satisfy a rule through the report's rule→test
table (D18). Scenario owned: **S11**, the guard part (03/01 → 06): the predicate plus the
plan-body fixtures below; the real two-session integration belongs to 03/06.

Fixtures, verbatim from the v6 brief (guard tests, unit level):

| Expected | Input | Rules |
|---|---|---|
| no decision | `cd X && node "…/ambicode.mjs" note save --task T --kind plan-draft <<'EOF'\nconst f = () => 1; // .ambicode/task/\nEOF` | 01-P2, 01-G9 |
| no decision | `grep foo > out.txt`; `echo ".ambicode/task"` | 01-G5, 01-G12 |
| no decision | the synthetic B3 regression string (investigation archive §6 row B3) with `--kind plan-draft` | 01-P2, 01-G9 |
| deny 01-R1 | `echo x > .ambicode/task/T/plan.md`; `tee .ambicode/task/T/notes.md`; `cp a.md .ambicode/task/T/b.md` | 01-P6, 01-G5 |
| deny 01-R1 | `sed -i 's/a/b/' .ambicode/task/T/notes.md` with `platform: 'linux'`; `sed -i '' 's/a/b/' .ambicode/task/T/notes.md` on darwin | 01-P6, D13 |
| ask | `git -C repo commit -m "x"`, `git stash`, `git stash pop`, `git rebase main`, `git branch -D x`, `glab mr create` | 01-G2, 01-G3 |
| ask | `echo x > $OUT` | 01-P3, 01-G6 |
| no decision | `git stash list`, `git stash show -p`, `git status`, `git diff`, `git log`, `echo "git commit"`, `cmd 2>&1`, `cmd > /dev/null` | 01-G2, 01-P6 |
| ask | `rm -rf .`, `rm -rf /`, `rm -rf <cwd>`, `git clean -fdx` | 01-G4, 01-G2 |
| no decision | `{"hook_event_name":"PostToolUse",…}`, tool `Read`, missing `tool_input`, non-string `command` | 01-G1 |

Further required tests:

- `01-G10`: Write/Edit/MultiEdit on `.ambicode/task/T/notes.md` deny; NotebookEdit via
  `notebook_path` denies; relative path resolved against `cwd`.
- `01-G11`: config.yaml and `.gitignore` deny with pointer skill `init`; no decision with another
  skill or no pointer.
- `01-G7`/`01-P7`: from inside `.ambicode/task/T`, `cd /tmp && echo x > notes.md` → no decision;
  `cd /missing; echo x > notes.md` → ask; `(cd /tmp); echo x > notes.md` → deny.
- `01-G9`: `node "…/ambicode.mjs" note save --task T --kind notes > .ambicode/task/T/x` → deny.
- `01-P1`: 4,000-deep nested `${X:-…}` beside `git push` → ask, no throw (unit and built bundle).
- `01-R1`: the reason substitutes the given `pluginRoot` and names
  `--kind investigation|plan|notes`.
- Plan body (`01-B1`–`01-B3`, `01-O*`, `01-S*`, S11), with a mkdtemp state directory holding
  `ambicode-hook-state/active-route` and a task `ledger.jsonl`, read through `fsGuardState`:
  allowed for the owner, the adopter after `--adopt` (`route {resumes, adopts: true}`), the new owner
  after `--fresh` (`exit {route, reason: 'superseded'}` then a new route); denied with
  `route-taken-over` for the former owner after `--adopt` and after `--fresh`; denied with the cause
  for another session, another slug, a pointer on another skill, no pointer, no `session_id`, no
  `scratchpad_dir`, a missing/torn/non-object/over-cap ledger, a closed chain, a dangling `resumes`,
  two open chains; a ledger of exactly `LEDGER_LIMIT` bytes is read and one byte more is not; a
  directory or FIFO in place of the pointer or ledger answers at once; a Bash write to the plan body
  denies for its owner.
- `01-O1`–`01-O4` (ownership tests): each `unknown` cause of 01-O3 as a table row; `none`; owned
  chain with adopt; superseded sessions in `takenOver`; other kinds and other-skill routes skipped;
  the module has only type imports.
- `01-S5`: the two equality tests.
- Built bundle (`01-G13`, `01-M1`): garbage stdin → `{}`, exit 0, one stderr line; the plan-body
  decision against the fixture directory; static imports exactly `node:fs` and `node:module`, ≤ 2
  files loaded.
- `01-M2`, `01-M3`: measured, not unit tests; numbers in the report.

## Done when

- [ ] Every rule 01-P1…01-L3 maps to at least one passing named test, or to a measurement for
      01-M2/01-M3, in the report's rule→test table.
- [ ] Every fixture string in Tests is a verbatim test case and passes.
- [ ] `npm run verify` exits 0; the report gives the test count, pass, skip.
- [ ] 01-M2 medians reported for all three inputs and the pre-change bundle, each ≤ 50 ms (D17).
- [ ] 01-M3 B3 proof: `{}`, exit 0, empty stderr, for the built guard.
- [ ] Report line `P47: not run; row not built`; no `updatedInput` code; `hooks/hooks.json`
      unchanged.
- [ ] `git diff 40b7334 -- hooks/hooks.json skills/*/SKILL.md` is empty (the `PostToolUse`
      `Edit|Write` entry included).
- [ ] 01-T1 option (a) is what is built; the report lists the decision as pending with (a)/(b)/(c).
- [ ] Report in the 05 §4 template, final state only, with the rule→test table (01-L3).

## Hand-off to steps 02, 03 and 06

What the next steps receive and must not redo:

- **Step 02** changes the 01-R1 kinds to its note kinds and updates that test only.
- **Step 03** wires assertOwner to `ownerOf` over the same parsed entries, with the guard's
  strictness (D8) or a stated reason; no second ownership predicate or fold. It records a route's
  `session` exactly equal to the hook's `session_id`; records adoption as `route {resumes, adopts:
  true}` and `--fresh` as `exit {route: <old chain member>, reason: 'superseded'}` before the new
  route (v6/12 §2.3); writes `active-route` as `{task, skill}` JSON ≤ 4 KiB under
  `<scratchpad_dir>/ambicode-hook-state/` (or the path 01-T1 (b)/(c) fixes); removes the
  `PostToolUse(Edit|Write)` entry; implements Stop and `AskUserQuestion`. When the CLI imports
  `ownership.ts`, esbuild may move it to a shared chunk: re-run 01-M1 and 01-M2.
- Ownership is rechecked at tool decision time, and consuming CLI commands check again at their write.
  A guard allow earlier is no authority for a later command after takeover. Share the minimal entry
  shape with type-only imports; runtime dependencies stay import-free.
- **Step 06** adds the plan skill's `Write(.ambicode/task/*/steps/plan-body.md)` grant and runs the
  real two-session S11 integration with 03.
- **For the user** (not for the implementer or reviewer): the tmpdir fallback (a)/(b)/(c); P47
  authorization; whether to trim parser code built beyond the rules (D20); whether to widen hooks.json
  matcher reach; the 1 MiB deny reason not naming a separate task slug as recovery (01-contracts §1
  attaches that recovery to the 1 MiB warning); CLAUDE.md's stale test count.

## Coverage of the v6 brief

| v6 step 01 requirement | Where here |
|---|---|
| Dispatch: 00-README defaults, no spend, step 00 prerequisite, P47 attach, owner | Dispatch block, 01-H1 |
| Why: B3 regression, structural parse (R9), never deny legit / never wedge (R12), later-route rows | Goal, 01-P2, 01-G9, 01-B*, 01-G11 |
| Read first: CLAUDE.md, 15, 30 §1/§2/§9, goals M12/M15/R9/R12/D6, code files, outcomes.md, B3 archive | Dispatch links, Starting point, Tests (B3 string) |
| Facts: standalone bundle, no imports; baseline 20-spawn median | Starting point, 01-M1, 01-M2 |
| Facts: hooks.json PreToolUse today; GIT_WRITES today and design's list | Starting point, 01-G2, D1 |
| §1 parser: no imports, Segment/parseCommand exports | Contract, 01-P1 |
| §1 rule 1: split outside quotes and heredoc bodies, heredoc forms, `<<-` tab end | 01-P2 |
| §1 rule 2: tokenise, quotes removed, opaque `$VAR`/`${…}`/`$(…)`/backticks | 01-P3, 01-P5, D3 |
| §1 rule 3: argv[0] after `cd &&`, `env`, `node`, `npx`, `sudo`, `K=V` | 01-P4, D3 |
| §1 rule 4: write targets `>`/`>>` (not `2>&1`, `/dev/null`), `tee`, `sed -i`, `cp/mv/rm`; opaque target | 01-P6, D2 |
| §2 replace regex with parser; every row a test | 01-G*, Tests |
| §2 row git writes incl. stash and `branch -D` → ask naming operation | 01-G2, D1 |
| §2 row `glab mr` → ask | 01-G3 |
| §2 row `rm -rf` root, `git clean -fdx` → ask | 01-G4, D6 |
| §2 row file tools under task dir → deny naming note save | 01-G10, 01-R1, D4 |
| §2 row plan body: active route plan for slug and session owns latest live chain → allow | 01-B1, 01-B2, D19 |
| §2 row Bash non-opaque task write → deny | 01-G5 |
| §2 row opaque write target → ask, never deny (G14) | 01-G6, 01-G7, D11, D14 |
| §2 row note save/promote any prefix → allow; heredoc never inspected | 01-G9, 01-P2, D5 |
| §2 row config.yaml/.gitignore during init → deny naming `init --apply --set` | 01-G11, 01-T1 |
| §2 row `--task` updatedInput if P47 held | 01-H1 |
| §2 row anything else → `{}` | 01-G12 |
| Active route from `<scratchpad_dir>/ambicode-hook-state/active-route` or tmpdir fallback | 01-S3, 01-T1 (pending decision) |
| Pure import-free `ownerOf(entries, slug)` in `src/route/ownership.ts`; guard reads entries with node:fs and binds the session | Contract, 01-O1–01-O4, 01-S4, 01-B2 |
| assertOwner calls same predicate; no Runtime/zod in guard bundle | 01-O1, 01-M1, Hand-off |
| Pointer alone never authorizes; absent/unparsable context fails closed | 01-B2, 01-B3, D7, D8 |
| Nothing writes the pointer yet; predicate ships with fixture state directory | 01-H3, Tests (plan body) |
| node:fs sync reads the only addition; record the reading | 01-S1, D16 |
| Re-measure startup ≤ 50 ms over 20 spawns (33 §7) | 01-M2, D17 |
| §3 allow / deny / ask / leave-alone fixtures verbatim | Tests (fixture table) |
| §3 plan-body owner allow, former owner after adopt/fresh deny route-taken-over, other task/slug/chain and missing session deny | Tests (plan body), 01-R2, 01-R3 |
| §3 robustness: malformed JSON, missing fields, other events/tools → `{}` exit 0; built bundle survives garbage | 01-G1, 01-G13, Tests (built bundle) |
| §4 deny reason shape, kinds at this step; step 2 changes them | 01-R1, Hand-off |
| §5 updatedInput row, hooks.json matcher, its tests, or "P47: <result>; row not built" | 01-H1 |
| §6 outcomes.md documents new reasons; compatibility.md only if §5 adds a matcher | 01-H2, 01-H1 |
| Proofs: verify green; tests cover every row and fixture | 01-L2, Done when |
| Proofs: startup before/after medians | 01-M2 |
| Proofs: materialized ts-feature-boundary B3 → no decision | 01-M3 |
| Proofs: 1 MiB synthetic ledger, report small and 1 MiB medians | 01-M2, D12 |
| Do not: inspect heredoc bodies | 01-P2 |
| Do not: deny on opaque target | 01-G6, D14 |
| Do not: dependencies beyond node:fs | 01-S1, 01-M1, 01-T1 |
| Do not: write active-route, Stop hook, AskUserQuestion hook | 01-H3, Non-goals |
| Do not: change SKILL.md allowed-tools | 01-H3, Done when |
| Do not: change PostToolUse Edit\|Write entry | Files (protected), Done when |
| Done when: rows/fixtures tested, verify, startup, P47 row, report template | Done when (template now 05 §4, D18 / 01-L3) |
| Integration contract: 03 wires assertOwner to ownerOf; guard keeps fs reader; type-only shared shape; no second predicate | 01-O1, Hand-off |
| Integration contract: recheck at decision time and at CLI write; real S11 in 03/06; earlier allow no authority after takeover | Hand-off, Tests (S11 note) |

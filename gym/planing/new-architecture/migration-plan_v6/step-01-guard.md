# Step 1 — Guard: structural command parser, decision table, route-aware rows

> **Dispatch**: use 00-README defaults; no model spend. Prerequisite: step 00 integrated.
> Attach P47 result; if absent/unrun, do not build updatedInput. Read 01-contracts as well.
> Owner: command parser, guard classifier, plan ownership reader, existing guard tests/hooks.

## Why this step exists

The real run's only plugin-caused block was the guard denying a legitimate `note save` because a
regex matched `.ambicode/task/` inside a heredoc body (M12, real-run B3): +20k output tokens. The
guard must parse commands structurally (R9), never deny a legitimate action, and never wedge the
session (R12). It also gains the rows the later routes rely on (plan body file, init's config and
`.gitignore`). Design: [../v6/modules/15-guard.md](../v6/modules/15-guard.md) §1–§2 and Failure
modes; [../v6/41-migration.md](../v6/41-migration.md) step 1.

## Read first

1. `CLAUDE.md`.
2. `../v6/modules/15-guard.md` (whole), `../v6/30-harness.md` §1 (hook matrix rows for `PreToolUse`),
   §2 (session state), §9; `../v6/01-goals-and-constraints.md` M12, M15, R9, R12, D6.
3. Code: `src/hook/guard-core.ts`, `src/hook/guard.ts`, `src/hook/guard.test.ts`, `hooks/hooks.json`,
   `build.mjs` (the `guard` entry), `src/hook/markers.ts` (`hookStateBaseDir`: where session state
   lives), `skills/review/references/outcomes.md` (document new releases here; existing skill-content tests cover codes across skills,
   with a narrower outcomes subset).
4. `gym/planing/investigation/archive/real-run-VS-6735-2026-10-02.md` §6 row B3 (a proposed regression string, not the verbatim session command).

## Facts to verify before changing anything

- `scripts/guard.mjs` is a standalone bundle built from `src/hook/guard.ts`; `guard-core.ts` has no
  imports by design ("startup time is the point"). Measure the baseline: 20 spawns of the built
  `scripts/guard.mjs` with a small stdin JSON; report the median (M15 says 34 ms).
- `hooks/hooks.json` `PreToolUse` today: `Bash` with `if: Bash(git *)`, `Bash(glab mr*)`,
  `Bash(*.ambicode/task*)`; and `Write|Edit|MultiEdit|NotebookEdit`.
- `guard-core.ts` `GIT_WRITES` today: `commit, push, stash, reset, checkout, clean` (stash
  `list|show` read-only). The design's list adds `rebase`, `merge`, `branch -D`, and narrows
  `stash` to `save|pop|drop`.

## Deliverables

### 1. `src/hook/command-parser.ts` — structural parser (15 §2)

No imports (it is bundled into the guard). Exports:

```ts
export interface Segment { argv: string[]; opaque: boolean[]; writeTargets: { path: string; opaque: boolean }[]; raw: string }
export function parseCommand(command: string): Segment[];
```

Rules, exactly as 15 §2:
1. Split into segments on `&&`, `||`, `;`, `|`, newline — **outside** single/double quotes and
   **outside heredoc bodies** (`<<WORD`, `<<'WORD'`, `<<"WORD"`, `<<-WORD`, up to the line equal to
   WORD; a `<<-` body ends at a tab-indented WORD too).
2. Tokenise each segment into shell words; quotes removed; `$VAR`, `${…}`, `$(…)`, backticks are
   **opaque** tokens (kept as one token, flagged).
3. `argv[0]` is the first token after the prefixes `cd <dir> &&` (already a separate segment),
   `env [K=V…]`, `node`, `npx`, `sudo`; a leading `K=V` assignment is skipped.
4. Write targets: the token after `>` or `>>` (not `2>&1`, not `>/dev/null`), the operand of `tee`
   (not its flags), the file after `sed -i …` (last operand), and the last operand of `cp`, `mv`,
   `rm`. An opaque token in a write position is a write target with `opaque: true`.

### 2. `src/hook/guard-core.ts` — decision table (15 §1)

Replace the regex classification with the parser. Every row below is a test. Decisions:

| Input | Decision |
|---|---|
| segment `argv[0] === 'git'` and the subcommand (after `-C x`, `-c k=v`, `--flag`) is one of `commit, push, reset, checkout, clean, rebase, merge`, or `stash` followed by `save\|pop\|drop` (bare `git stash` counts as `save`), or `branch` with `-D` | **ask**, reason names the operation |
| `glab mr …` | ask |
| `rm -rf <repo root or '.' or '/'>`, `git clean -fdx` | ask |
| `Write/Edit/MultiEdit/NotebookEdit` with `file_path` under `.ambicode/task/` | **deny**, reason names `note save` exactly (see 4) — **except** the plan-body row below |
| same tools, `file_path` = `.ambicode/task/<slug>/steps/plan-body.md` and the active route is `plan` for `<slug>` **and the calling session owns its latest live chain** | allow (no decision) |
| Bash segment with a write target under `.ambicode/task/` (non-opaque) | deny, same reason |
| Bash segment with an **opaque** write target | **ask** ("cannot tell where this writes"), never deny (G14) |
| any segment whose `argv` is `node <…ambicode.mjs> note save\|promote …` (any prefix, any quoting) | allow; **the heredoc body is never inspected** (M12) |
| `Write/Edit` on `.ambicode/config.yaml` or `.gitignore` while the active route is `init` | deny; reason names `init --apply --set` / "init writes it on acceptance" |
| Bash `ambicode` command lacking `--task` while a route is active **and P47 held** | allow + `updatedInput` adding `--task <slug>` (see 5) |
| anything else | no decision (`{}`) |

"Active route" is read from session state (30 §2): `<scratchpad_dir>/ambicode-hook-state/active-route`
(or the tmpdir fallback `hookStateBaseDir` computes), a cached pointer to `{task, skill}`; ownership is decided by one pure, import-free function `ownerOf(entries, slug)` in
`src/route/ownership.ts`, created here. The guard reads entries with node:fs and uses that
predicate with an explicitly bound calling session. Step 03's assertOwner calls the same
predicate over the same parsed entries; no Runtime/zod import enters the guard bundle. A pointer alone
never authorizes plan-body writes. Absent/unparsable ownership context fails closed for that exception. In this step **nothing writes that file yet** (step 3 does); the predicate and its tests
ship now with a fixture state directory. Reading bounded state and ledger files with `node:fs` sync calls is the only
import the guard may add (the route-aware rows require a minimal state/ledger read despite
15 §2's no-import wording; record this reading, do not pull in the whole CLI); re-measure startup after (target: median ≤ 50 ms over 20 spawns, 33 §7).

### 3. Fixtures (15 §2) as tests in `src/hook/guard.test.ts`

Allow (no decision), verbatim:
- `cd X && node "…/ambicode.mjs" note save --task T --kind plan-draft <<'EOF'\nconst f = () => 1; // .ambicode/task/\nEOF`
- `grep foo > out.txt`
- `echo ".ambicode/task"`
- the synthetic B3 regression string from §6 with `--kind plan-draft`;
- plan body owned by this session → allow; former session after adopt/fresh → deny
  naming route-taken-over; other task/slug/chain and missing session binding → deny.

Deny:
- `echo x > .ambicode/task/T/plan.md`
- `tee .ambicode/task/T/notes.md`
- `sed -i 's/a/b/' .ambicode/task/T/notes.md`
- `cp a.md .ambicode/task/T/b.md`

Ask:
- `git -C repo commit -m "x"`, `git stash`, `git stash pop`, `git rebase main`, `git branch -D x`,
  `glab mr create`, `echo x > $OUT` (opaque target).
Leave alone:
- `git stash list`, `git stash show -p`, `git status`, `git diff`, `git log`, `echo "git commit"`,
  `2>&1`, `cmd > /dev/null`.
Robustness: malformed JSON, missing fields, other events, other tools → `{}` and exit 0; the built
bundle answers on stdin/stdout (the existing `survives garbage` test, extended).

### 4. Deny reason

Keep the shape of `noteSaveReason` but name the commands exactly as they exist **at this step**:
`note save --task <slug> --kind investigation|plan|notes`. Step 2 changes the kinds and updates the
string and its test; do not pre-empt that here.

### 5. `updatedInput` (only if P47 held)

If the dispatcher block says `held`: add the row, add `{ "type": "command", "if": "Bash(*ambicode.mjs*)", … }`
to `hooks/hooks.json` `PreToolUse.Bash`, and test that the returned object carries both
`permissionDecision: 'allow'` and `updatedInput.command` with `--task <slug>` appended **once**, never
when `--task` is already present, never for `note save|promote` (they carry it) and never without an
active route. If `not held` or `not run`: do nothing for this row; write "P47: <result>; row not
built" in the report. Nothing depends on it (15 Outputs).

### 6. `docs`/references

Every new error code or reason must be in `skills/review/references/outcomes.md`; the guard emits
reasons, not codes, so only the test for outcomes stays green. Update `docs/compatibility.md`'s hook
section with the new `if:` matcher if §5 adds one.

## Proofs

- `npm run verify` green; new tests in `src/hook/guard.test.ts` cover every row and fixture above.
- Startup: `for i in $(seq 20); do …; done` timing of the built `scripts/guard.mjs` (after
  `npm run build`), median printed in the report, compared to the pre-change median you measured first.
- `node fixtures/materialize.mjs ts-feature-boundary <tmp>` then run the built guard against the
  B3 command with that cwd: no decision.
- Re-measure built startup with a 1 MiB synthetic ledger; retain the 50 ms budget and report
  both small-ledger and 1 MiB medians.

## Do not

- Do not inspect heredoc bodies for anything.
- Do not deny on an opaque write target.
- Do not add any dependency to the guard bundle beyond `node:fs` for state and ledger files.
- Do not write the `active-route` file from anywhere (step 3 does); do not implement the Stop hook
  (step 3) or the `AskUserQuestion` hook (step 3).
- Do not change `skills/*/SKILL.md` `allowed-tools` (step 6 adds the plan-body grant).
- Do not change the `Edit|Write` `PostToolUse` entry in `hooks/hooks.json` (step 3 removes it per 41).

## Done when

All rows and fixtures are tests and pass; `verify` is green; startup median is reported; P47's row
is built or explicitly not built per the probe; the report follows the template.

## Integration contract

Step 03 wires assertOwner to ownerOf; the guard keeps its node:fs reader. Share the
minimal entry shape with type-only imports; runtime dependencies stay import-free. No second
ownership predicate or fold. Recheck ownership at tool decision time, and consuming CLI commands
check again at their write. The real two-session integration belongs to 03/06 (S11).
Do not treat the guard's earlier allow as authority for a later command after takeover.

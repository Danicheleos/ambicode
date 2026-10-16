# Plan: close the free choices, lowest layer first

User decisions (2026-10-09): cases be-vs-6140, fe-vs-6406, be-vs-5973 at ×5; reading is steered
**hard in headless, ask in interactive** (D5); the first evidence is fixed by a **ready `read` line**
in the map payload, not by pre-serving content (D3); every new limit is soft; score gains out of
scope, floors against bare hold; implementation runs in subagents (Sonnet 5.5, medium effort), one
approval per step.

## Execution rules

- One step per change; report → the user approves → apply. The user runs reviews.
- Each step ships with its tests; targeted `node --test` on touched files and `npm run typecheck`
  per step; `npm run build` before any eval; full `npm run verify` at hand-off.
- Offline replay on saved attempts before any paid run. Paid checks only on the user's go, at the
  tier in [01-cases.md](01-cases.md#running-the-5-checks).
- Language-agnostic: no ecosystem tables; facts come from the measured profile.
- Nothing hard-stops the route: a limit is a ledger entry and a line under Not verified.

## Steps

### D0 Ruler for drift runs (evals, free)

- `evals/scripts/src/analysis/run-report.mjs`: count a Bash result containing `no matches found:
  --include=` as a failed tool call (`zshGlob`), and a `<persisted-output>` result as a lossy call
  (`hostCapped`); per run `readsVia{read, nativeRead, bash}` from the trace classes plus the engine
  `search{command:'read'}` receipts; operand refusals from `== …: not found ==` lines in `read`
  output.
- A drift table for N repetitions per case on any run directory: spread per metric, in-band flags
  against the absolute band, mechanics columns (receipts, zsh, retries, served bytes). Either
  parametrize `eval-replay/evals/analysis/drift-2026-10-09/analyze.mjs` (date, prefixes, no
  notation cross-check) or add `evals:bench drift <eval.json> [--traces dir]`; prefer the latter.
- Tests: fixtures with one zsh failure, one persisted output, one `$N`-style `read` call.
- Done when the table reproduces the 15_1241 numbers in 01-cases.md for the three cases.

### D1 Operands and root (modules/search, guard; no model-facing text)

- `parseReadOperand` accepts `path:a:b`, `path:a,b` and `path:a-b`; `resolvePath` also tries the
  operand with a leading `./`, `repo/` or the cwd basename stripped before the suffix match.
- `TASK_COMMANDS` += `read`, `map`, `refs`, `find`, `relates`, so `--task` is injected and the
  reader root is the task repository on every call.
- Tests: `read-many.test.ts` (grammar, prefix strip, ambiguity unchanged), `guard.test.ts`
  (`withTask` on `read`), `cli.test.ts` reader-root case.
- Effect: 17-R2/R3 retries (4 calls) and the `repo/` prefix class disappear.

### D2 zsh glob rewrite (guard)

- `hooks/hooks.json`: add `Bash(*--include=*)` and `Bash(*--exclude=*)` to the guard's `if` list.
- `guard-core.ts`: when a Bash segment carries an unquoted `--include=<glob>` / `--exclude=<glob>`
  with `*` or `?`, return `allow` with `updatedInput` quoting the value and a one-line reason.
  Quoted values pass untouched.
- Bundle: measure after the change; if over 70 KiB, raise `GUARD_BUNDLE_MAX_BYTES` to the measured
  size + 1 KiB and say so in the step report.
- Tests: `guard.test.ts` (rewrite, no rewrite when quoted, pipelines), `route-hooks.test.ts`
  handler count, `command-parser.test.ts` if the tokenizer changes.
- Effect: the single largest retry source (21/24 attempts) goes to zero.

### D3 Ready `read` line in the map payload (modules/search)

- `leadsOf` renders each lead as `path:a-b` when `declarations` give an anchored span (bounded to
  the declaration's lines, cap per lead from the measured profile's declaration density, fallback
  `:line`), and ends the block with one line:
  `read: node "<cli>" read --task <task> <lead operands…>` (operands only, no content).
- Keep `LEADS_LIMIT_BYTES = 1200` for the leads; the ready line is capped separately (≤ 400 B,
  trailing leads dropped first). The `map` ledger entry records the operands it printed.
- Tests: `map.test`/`locate.test` (span rendering, caps, determinism), `investigate.route.test.ts`
  payload shape, `context-cost.test.ts` ceilings.
- Effect: the first read set is the same operands on every run; D0 measures how often the model
  types that line as given (6140 shows an identical first read is stable across six runs).

### D4 Deterministic `read` bytes (modules/search)

- Outline mode: a whole-file operand over N lines (N from the profile, default 300) returns the
  declaration outline (`name line-line`) plus the anchored spans, not the whole body, unless
  `--full`. The header says so and names the `--full` form.
- Dedupe: a span already served in this route (from the chain's `search` receipts) is answered with
  `served at <receipt id>; add --again to re-read`, not re-served.
- Cumulative counter: the receipt gains `servedTotal` over the route; past a soft cap (start at
  60,000 B, provenance: 5973 R1 answered from 27 KB, R3 served 55 KB with no recall gain) the
  command still serves and appends `limit{which:'read-bytes'}` once; the report lists it under Not
  verified.
- Tests: `read-many.test.ts` (outline, `--full`, dedupe, `--again`, counter), `engine.limits.test.ts`
  (soft limit recorded, route continues).
- Effect: byte and context spread (5973 R3, 5941 R1/R3); continuation churn.

### D5 Reading goes through `read` (guard + hook) — hard in headless, ask interactive

- Guard PreToolUse: native `Read`, and Bash `cat|sed -n|head|tail` whose target resolves to a
  tracked repository file, while the active route's position is a model step with `answer: note`:
  headless → `deny` with the reason `use: node "<cli>" read --task <task> <path[:a-b]>`; interactive
  → `ask` with the same line. Unchanged: `.ambicode/task/**/steps/*.md`, paths outside the
  repository, `grep|rg|git grep|ls|git ls-files|wc|find`, every `ambicode.mjs` call, every other
  route and skill.
- `hooks.json`: `Read` added to the guard matcher; `Bash(cat *)`, `Bash(sed *)`, `Bash(head *)`,
  `Bash(tail *)` added to the `if` list. The guard reads mode and position from `guard-state` (the
  active-route pointer and the bounded ledger tail; the `route` entry carries `mode`). If the
  position needs the fold, the guard keys on the latest `step{delivered}` whose step has `answer`.
- PostToolUse `Read|Grep|Glob` → `ambicode.mjs hook` appends `tool{name, step, bytes?}` so the
  ruler sees allowed deviations too (interactive runs, other skills).
- Bundle: expect to exceed the 642 B headroom; raise `GUARD_BUNDLE_MAX_BYTES` explicitly with the
  measured size in the step report.
- Tests: `guard.test.ts` decision table (deny/ask/allow × headless/interactive × target classes),
  `route-hooks.test.ts`, `run-hook.test.ts` (tool entries), `architecture.test.ts` cap.
- Effect: removes the tool-choice variance (11/24 attempts) and the host-cap re-reads; one
  deterministic extra turn on the first deviation.

### D6 Answer shape at Stop (harness/engine/stop.ts) — offline replay first

- Port `changeLines` from `evals/scripts/src/analysis/bench-score.mjs` to
  `src/modules/evidence/change-lines.ts` with one shared fixture set used by both suites.
- `problemsOf` for an `answer: note` step, truth-free and mechanical, block once:
  1. every change path under `## Files` is served in this route (a `search{command:'read'}` receipt
     names it) or is marked as a creation; otherwise "not read: <path>";
  2. a hedged change line ("only if", "possibly", "may need", "did not read") is "undecided: <path>";
  3. a delivered map lead that is neither a change nor named on a "not changed"/"evidence" line is
     "undecided lead: <path>".
  The block reason lists at most 8 lines, ≤ 600 B, and asks for one decision per line. The second
  Stop passes (`limit{stop-block}`), as today.
- Offline replay before building the hook: run the check over the 24 saved attempts and the 60
  bare answers. Build only if it fires on 6140 R2, R3, 17-R1, 17-R3 and 6406 R3 and stays silent on
  6140 R1, 17-R2 and the 5973 runs; report fire rate, lines per fire, and the paths named.
- Tests: `stop-check.test.ts` (each rule, block once, silent when all decided, size cap),
  `change-lines.test.ts` shared fixtures.
- Effect: precision drift (6140 extras), explicit scope decision (6406), unread assumptions.

### D7 Paid checks (3 cases × 5, on the user's go)

| Campaign | After | Pass (per 01-cases.md) | Rollback rule |
|---|---|---|---|
| 1 exploration | D1–D3 (+D0 ruler) | receipts 5/5, zsh 0, retries 0; tool-call spread in band; floors hold | revert the step whose mechanics column got worse |
| 2 bytes + routing | D4–D5 | served-bytes and agent-cost spread in band; floors hold; extra-turn count from denials reported | if denial turns > 1 per run, soften D5 to ask in headless and report |
| 3 selection | D6 | 6140 precision 1.0 ×5 or ≥ bare − band; 6406 scope line present 5/5; 5973 unchanged within band | drop rule 3 (leads) before rules 1–2 |

One mechanism per campaign. The existing drift gate and case floors are reported with every
campaign. No bare rerun: the lock stays.

## Not in this plan

Discovery families and the shortlist default (stage 3a), pre-serving lead content (reconsidered
only if campaign 1 shows a varying first read), the task fixture check command, plan anchors,
review replay vs live, wording tuning (stage 13), i18n cases.

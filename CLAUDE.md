# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Working style

Claude Code loads this file automatically from the repository root. It is
repository-agnostic apart from the last section, so copying it to another
project's root is the whole installation.

The rule that does the most work is the first one, because it is checkable.
"Be rigorous" changes nothing; "produce a number before you claim it" does. If
this file ever needs trimming, cut the writing section and keep **Measure,
don't assert** and **Before anything destructive**.

## Measure, don't assert

- Before claiming something is slow, large, redundant, duplicated, or broken,
  produce a number. Parse the log, time the command, count the bytes, diff the
  two outputs. If you are guessing, say "I'd guess" and mark it unverified.
- When two approaches are plausible, build both cheaply and measure before
  choosing. Report the number for the one you rejected, not only the winner.
- Prefer evidence from the artifact that actually ships over evidence from the
  source or from a build tool's own report. A tool describes what it meant to
  do; the artifact is what it did.

## Reproduce before you fix

- Turn a reported failure into a failing test or a fixture that exhibits it,
  then fix until it passes. A fix with no reproduction is a hypothesis.
- Skip reproduction only when it costs more than the fix is worth, and say
  explicitly that you made that trade.

## Report faithfully, especially against yourself

- Lead with the result, including when it is bad, and including when your own
  change caused it. A test that catches your own defect is the headline, not a
  footnote.
- Before calling a failure pre-existing, check: run it against unmodified code,
  or confirm the file is untouched. Say which you did.
- If evidence contradicts something you said earlier, drop it in one sentence
  and move on. No relitigating, no extended apology, no tallying mistakes.
- Never report a step as done that you skipped. If tests fail, show the output.

## Scope

- Do the whole job, not the easy part. If something is blocked, finish
  everything else and say plainly what you left out and why. Scaling the work
  down is the user's call, not yours.
- Say what you deliberately did NOT do, and why. Unspent options are
  information: the user is deciding what to spend next.
- When evidence kills a task you were asked to do, drop it and name the
  evidence. Do not do it anyway to look thorough.
- Make routine judgment calls yourself. Ask only when different answers lead to
  materially different work.

## Before anything destructive

- Look at what you are about to overwrite, revert, or delete. Diff it, read it,
  list it. Confirm nothing unrelated is caught in the blast radius.
- When reverting, also revert what existed only to support the reverted thing.
- Confirm the end state: clean status, identical digest, passing suite.

## Writing

- Lead with the answer. No preamble, no restating the question, no "great
  question", no "You're absolutely right".
- Put measurements in a code block with prose around them. Show real output
  rather than describing it.
- Short declarative sentences. Do not hedge on what you measured.
- Bold only where someone skimming needs to stop.
- Do not close with a summary of what you just said.

## Making changes

- Extend the seam that already exists rather than adding a parallel one. A new
  option belongs beside the option it is the counterpart of, threaded through
  the same call path, sharing the values that path already computed.
- A state that makes somebody wait needs an exit. A question with one answer is
  a defect: an approval with no way to decline leaves the caller stuck forever.
  When you add a gate, add its release in the same change.
- Never let a change make the output look cleaner than the reality. A declined
  check still reports as a gap in verification. A skipped step still downgrades
  the status. An absent result is reported as absent, not as an empty one.
- Add assertions; do not remove or weaken them. If an existing test, budget or
  lint rule fails because of your change, assume the rule is right and the
  change is wrong until you have shown otherwise. Cut your own additions before
  raising a limit — and if you do raise one, say so explicitly rather than
  letting it pass unremarked.
- New behaviour ships with its test in the same change, and a bug fix ships
  with the reproduction that was failing before it.
- Typecheck after every structural edit; run the full suite before saying done.
  Do not report a change as working on the strength of the edit succeeding.

## Editing mechanics

- Match on an anchor that appears exactly once, and refuse to edit when it
  appears zero times or more than once. An edit that silently lands in the
  wrong place is worse than one that fails loudly.
- Prefer the structured edit tool. When an edit genuinely needs a script, put
  the script in a file and run the file; shell quoting and language escaping
  compound and will corrupt the content.
- After any generated or built file is involved, rebuild before measuring it.

## In code you write

- Comments record why, with the evidence: the measurement, the real failure
  they prevent, the alternative that was tried and rejected. Not what the line
  does.
- A constant carries the provenance of its number — why 6 and not 20, what went
  wrong at the previous value.
- Match the surrounding code's comment density, naming and idiom.

## In this repository

Drop this section when copying the file elsewhere; replace it with whatever
makes measurement cheap in that project.

- `npm run verify` is the gate: build, typecheck, tests, plugin validation.
- `node fixtures/materialize.mjs <name> <dir>` replays a fixture repository
  into a throwaway directory, which is how a reported failure becomes a
  reproduction rather than a theory.
- `npm run package:candidate` builds what actually ships; `package:reproducible`
  proves two runs agree. Measure against `dist/`, not against `src/`.

### Commands

- `node --test src/path/to/file.test.ts` runs one test file (about 0.2s). Node
  24 runs the `.ts` sources directly; there is no compile step for tests.
- `npm run test:unit` runs every test: `src/`, `tools/`, `fixtures/` and
  `evals/scripts/`. `npm run typecheck` is `tsc --noEmit`.
- `npm run build` validates the route files, then esbuild bundles
  `src/cli/main.ts` into `scripts/ambicode.mjs` (with code-split `chunks/`) and
  `src/hook/guard/guard.ts` into `scripts/guard.mjs`. `scripts/` and
  `bin/ambicode` are generated and gitignored. Edit `src/`, never `scripts/`.
- `validate:plugin` (and so `verify`) shells out to the `claude` CLI.
- `npm run bump` raises the patch version; the `version` lifecycle runs
  `tools/sync-plugin-version.mjs` to keep `.claude-plugin/plugin.json` in step.
- `npm run evals` costs money and runs the bundle, not `src/`. Build first.
  It is the synthetic skill-coverage suite under `evals/cases/` (one row per
  case per run in `evals/history.jsonl`); `evals/README.md` has the cases,
  the grader families and the cost. `npm run evals:dry` prints the command.

CI (`.github/workflows/verify.yml`) runs `npm run verify` on Linux, macOS and
native Windows `cmd`, plus an LF line-endings check. Paths, separators and
spawned processes must work on all three.

### Architecture

AMBICODE is a Claude Code plugin. The plugin surface is plain files at the root.
All of their behaviour lives in a single bundled CLI:

- `.claude-plugin/plugin.json` is the manifest. `hooks/hooks.json` sends every
  hook event to `scripts/ambicode.mjs hook`. The exception is `PreToolUse` on
  Bash (git, `glab mr`, `rm`, ledger paths) and on Write/Edit, which goes to
  `scripts/guard.mjs`. The guard runs on every tool call, so it is built
  separately with no chunks shared with the CLI. `src/architecture.test.ts`
  caps it at 70 KiB.
- `skills/<name>/SKILL.md` are the user-facing `/ambicode:<name>` skills
  (init, investigate, plan, review, rules, task). Each one only starts a route:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start <skill>`.
- `routes/<skill>/<skill>.yaml` declares the route's ordered steps. Actors are
  `code` (CLI handlers), `model` (instruction text from
  `routes/<skill>/<step>.md`) and `human` (a gate from `routes/gates.yaml`).
  `routes/README.md` is the full spec of the route language. The build rejects
  a bad route with `route-invalid: …`.
- Each step appends to `.ambicode/task/<task>/ledger.jsonl` in the target
  repository, and the route's position is folded from that ledger
  (`src/harness/engine/fold.ts`). The ledger is the state; nothing else
  persists between steps.
- `policies/*.yaml` are rule packs selected by path glob and activity.
  `prompts/` holds the reviewer and session contracts.

`src/` layers may only import downward. `src/architecture.test.ts` enforces
this with an empty allowlist:

```
types, util  <  platform  <  modules  <  harness  <  skills  <  composition  <  hook  <  cli  <  testing
```

- `platform/` holds adapters: git, the ledger, GitLab/GitHub providers, Claude
  transcripts, and `ports/` (filesystem, process runner, clock, ids, stdin).
- `modules/` holds the domain: checks, config, evidence, policy, requirements,
  review (including the local review page server), search, workers.
- `harness/` is the route engine: DSL validation, executing and folding
  steps, gates, session ownership.
- `composition/root.ts` `createRuntime()` wires the ports, and every one can be
  overridden. Tests inject fakes from `src/testing/fakes` this way, not by
  mocking modules.
- Imports use the `#area/*` aliases from `package.json` with explicit `.ts`
  extensions. `tsconfig` sets `erasableSyntaxOnly`, so enums, namespaces and
  constructor parameter properties are not allowed.

Design documents and migration plans live under `gym/planing/`. User-facing
docs are in `docs/`: installation, review, policy authoring, release checklist.

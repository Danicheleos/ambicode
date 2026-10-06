# Baseline evaluation suite (archived)

Archived 2026-09-28, when `evals/` became the benchmark suite, and moved to
`evals/cases/evals-archived/typescript/` the same day when every suite went under
`evals/`. Nothing below was rewritten, so read its paths through this map:

- a case or file below named under `evals/` lives in this directory;
- `evals/results/` below is now `results/` here
  (`evals/outputs/archived/`, gitignored);
- `npm run evals` below is now `npm run evals:archived`, which passes
  `--eval-dir evals/cases/evals-archived/typescript`;
- a bare `claude plugin eval .` below now runs the trigger suite (the
  manifest names `evals/cases/evals-triggers`): add
  `--eval-dir evals/cases/evals-archived/typescript` to run this one.

The scaffolds reach `fixtures/` as `../../../..`.
`evals/cases/scripts/src/testing/evals-suite.test.mjs` and the scripts
`evals-preflight.mjs` and `evals-reviewer.mjs` under
`evals/cases/scripts/src/validation/` read this directory. See the
[script layout](../../scripts/README.md) for the current paths of scripts
named below.

Thirteen cases, all TypeScript. Six are the Phase 1 review cases (doc 07,
"Native model evaluation"), one per category. Seven `p2-*` cases cover the
investigate, plan and task skills. The six Python review cases are archived in
`../` (`evals/cases/evals-archived/`) while the suite focuses on TypeScript; that
README says how to restore them.

```sh
npm run build
npm run evals -- --json ./eval-results.json
```

`npm run evals` runs the preflight first (below) and stops if it fails. Then it
runs `claude plugin eval . --runs 3 --ablation with-without -j 4 --scaffold
--allow-tools Bash 'WebFetch(domain:api.anthropic.com)' --no-publish` with
`EVAL_AMBICODE_REVIEWER_REPLAY` pointing at `evals/cases/common/reviewer-recordings/archived.json`.
`-j 4` runs four agents at once on one credential: the 2026-09-27 sweep at
`-j 1` took 7,874 s for 114 runs.

The `WebFetch(domain:api.anthropic.com)` grant is the sandbox's only network
opening, and the independent reviewer is a nested `claude` launched from the
agent's `Bash`: without the grant its connection is denied
(`deny network-outbound api.anthropic.com:443`, E02 below). Even with it, no
reviewer signs in inside the sandbox, so the suite replays recorded reviewer
answers (Status, and "Replaying the reviewer" below).

`--ablation with-without` is what makes this a comparison: the `without` arm is
the ordinary-prompting baseline doc 07 requires, and the `with` arm is the same
request with AMBICODE loaded. Graders marked `arm: with-only` record that the
plugin fired and stay out of the score.

Two grants are needed and they are not the same thing. Each case declares `Bash`
in `allowed_tools` because the review skill runs the packaged helper; the
operator grants it with `--allow-tools Bash`. `--scaffold` authorizes the fixture
setup script only — it does not give the evaluated agent Bash.

Each case scaffolds its fixture from `fixtures/definitions.mjs`, so the cases
carry no second copy of the repositories the unit tests already use.

## Fixture setup

Setup runs as the operator, outside the evaluation sandbox, and happens before
either arm starts, so both arms see the same repository.

- **Configuration.** Eleven scaffolds pass `--ambicode-init`: after the
  fixture's last commit, `materialize.mjs` runs the built `ambicode init` and
  commits what it wrote as "configure ambicode". Without it `ambicode review`
  stops at `config-missing`, and running `init` inside the measured session
  put the config file and its `.gitignore` lines into the change under review.
  The two other scaffolds (`p2-investigate-boundary-shortlist`,
  `p2-plan-path-scoped-policy`) write a purpose-built config of their own.
  Run `npm run build` first: `--ambicode-init` uses `scripts/ambicode.mjs`.
- **Test runners.** Only `regression-ts` and `p2-task-regression-fix` pass
  `--install`, because only they grade an unchanged test actually running. It
  installs jest and eslint (`npm ci --include=dev`) into `node_modules`,
  which is where `init` looks for them. **These two need network at setup**
  (the npm registry): an explicit step in the scaffold, not an install the
  agent triggers.
  - Versions are pinned. The fixture commits
    `fixtures/jest-manifest/package-lock.json` (jest 30.5.2, eslint 9.39.5)
    in its first commit, so it is not part of the change under review. `npm
    ci` refuses a lockfile out of step with the manifest, and
    `evals-suite.test.mjs` catches that drift without the network. After a
    manifest change, regenerate it with `npm install --package-lock-only`.
  - The harness runs a scaffold with a fixed environment: a temporary `HOME`
    (so a cold npm cache), `NODE_ENV=production`, stdout discarded, killed
    after 120 s (Claude Code 2.1.283). Under `NODE_ENV=production` a plain
    `npm install` skipped the devDependencies and exited 0, so every run of
    the 2026-09-27 suite had no runner and every check null, in both arms.
    Measured under that environment with `npm ci`, cold cache, two runs:
    2–3 s each, the same 348 packages at the locked versions, `unit` wired
    to jest, `git diff HEAD` byte-identical.
  - `materialize.mjs` now fails the scaffold when the install leaves out a
    path the fixture `provides`, or `init` leaves a slot it `wires` null. The
    harness then records the run as `scaffold failed (exit 1): <reason>`
    with score 0, instead of grading an agent that had no runner.
- Every other case installs nothing, so its unit and lint commands are null
  and reported as missing, in both arms.

`evals-suite.test.mjs` at the repository root guards these claims in
`npm run verify`: the ground truths against the fixtures, grader patterns
against the command the skills prescribe, a scored outcome grader in every
case, a file grader in every task case, the trace indicators against what
`review` prints, the scaffold flags, and rubrics that state how their
conditions combine.

The task cases score the file the agent was asked to change, not the reply:
`add-restored`, `page-count-added` and `implemented` are weight-3 `regex`
graders on `{ source: file, path: repo/src/... }`. The suite replays each
fixture and shows the pattern failing on the state the agent starts from.
What the reply says is graded separately by an `llm` grader
(`fixed-and-verified`, `reviewed-at-least-twice-if-finding`,
`reports-verification-gap`). Before this split, `p2-task-trivial`'s single
grader also required the reply to say no check existed, and failed 6 of 6 in
both arms.

The two requirement cases also scaffold a frozen `requirement-evidence.json`
beside `repo/`, because an eval session holds no MCP connection. Both arms can
read it, so the comparison stays fair, and it sits outside the repository so it
is not part of the change under review. This is a model-quality comparison on
frozen evidence, never a test of live Jira or Confluence retrieval — that is
M05.

These `arm: with-only` graders record what actually happened, and none of them
is part of the score:

- `plugin-fired` matches a `Skill` call naming `ambicode:review`. It proves
  routing and nothing else.
- `helper-ran` matches a `Bash` call running `ambicode.mjs" review` (the
  form the skills prescribe) or a bare `ambicode review`. The pattern is
  matched against the JSON-encoded tool input, which is why it reads
  `ambicode(\.mjs\\")? review`. It matches the tool **input**, so it proves
  only that the call was attempted: not the exit status, not the working
  directory, not that a bundle came out.
- `helper-output-used` reads the final message for values only a completed run
  produces — a review id, the pinned target, per-check status, the omissions.
  That is the closest a grader gets to "the result was read".
- `reviewer-completed` matches, in the `trace`, what `review` printed back
  when the independent reviewer returned a validated result:
  `reviewer    ok — model` in the text form, or its `--json` equivalent. It
  is in every case that runs `review`. In the 2026-09-27 run the reviewer
  printed `failed` ("Not logged in") while `helper-ran` passed.
- `unit-check-ran` matches a `unit` check that `review` executed and that
  reported `passed` or `failed`. It is only in the two cases whose fixture
  wires `unit`, the only ones where it can pass.

The first three do not establish that the run succeeded. The last two read
the helper's output, but only as a regex over the trace. Whether the trace
keeps a long tool result whole is unverified; `bundle`'s text report on
`ts-source-regression` measured 2,616 bytes. E02 establishes success by inspecting
one authorized trace.

## E02, when model access is authorized

E02 is not satisfied by a grader verdict. Run one case with a trace and read it:

```sh
claude --debug-file ./evals/results/e02-trace.log plugin eval . \
  --case correctness-ts --runs 1 --ablation none \
  --scaffold --allow-tools Bash 'WebFetch(domain:api.anthropic.com)' \
  --no-publish --verbose --keep-temp
```

`--debug-file` is a global option: after `plugin eval` it is refused as
unknown (Claude Code 2.1.283). Without a terminal to answer the first-run
trust prompt, add `--trust-plugin`. The agent's own trace is
`<kept dir>/out/trace.jsonl`; `--keep-temp` seals the fixture under
`<kept dir>/sealed`, and the harness prints how to open it.

The trace must show all of:

1. the `ambicode:review` skill being invoked;
2. a `Bash` call running `ambicode review` **with `repo/` as its working
   directory**, exiting 0 — a run from the harness directory is a failed case;
3. the agent reading that run's output and reporting its review id, target and
   check evidence rather than describing the diff;
4. `.ambicode/reviews/<id>/result.json` present inside the fixture, with a
   `reviewer` block naming `Read,Grep,Glob` — or, under replay, carrying
   `source: "replay"` and no tools, with the reply saying no model reviewed
   the change;
5. both arms receiving the same non-plugin tool grants.

Until that trace exists and has been read, E02 is outstanding. Record it in a
sanitized dated acceptance record, without workstation paths or private source.

**Repeated under replay, 2026-09-28**, from the second preflight's kept traces
(`regression-ts`, one run, $0.20, 6 turns):

1. `Skill` `ambicode:review` — yes.
2. `cd repo` first, then `node "<plugin>/scripts/ambicode.mjs" review` from
   there; its output names review `local_2026-09-28T01-08` and `src/math.js` —
   yes. The exit status is hidden by the agent's own `| grep -v` filter.
3. The reply reports the checks table (lint passed, unit failed on
   `jest --runTestsByPath tests/math.test.js`) and the finding at
   `src/math.js:1` — yes.
4. The summary line reads `reviewer    ok — model sonnet, REPLAYED from a
   recording (no model call)`, and the reply says "No model reviewed the change
   in this run" and that the result is partial — yes, under replay.
5. Not applicable to `--ablation none`.

## Status

E01 was first recorded when the suite had twelve cases, from another
checkout at plugin version 0.1.0; the five local `evals/results/` records
from 2026-09-20/21 are those dry runs (`casesTotal: 0`,
`partialReason: "cost_ceiling"`). **Repeated 2026-09-27** on 0.3.1 with
nineteen cases: `--max-cost-usd 0` stopped at the ceiling for $0 with no case
refused and no warning. Claude Code 2.1.283 no longer prints a case count;
that load-time validation is real was checked on a copy with one malformed
grader, which was refused ("graders.2.arm: Invalid enum value").

**E02, 2026-09-27: blocked on the independent reviewer.** Two authorized
`correctness-ts` runs (`--runs 1 --ablation none`), each about $0.21, 43 s,
7 turns, score 0.83:

1. `ambicode:review` was invoked — yes.
2. `Bash` ran `node "<plugin>/scripts/ambicode.mjs" review` after `cd repo`
   — yes: the plugin root is readable in the sandbox, the CLI completed and
   wrote a bundle. `helper-ran` matched it.
3. The agent reported the review id and the reviewer failure, then gave its
   own reading (which found the defect, so `finding` passed) — honest, but
   not a completed AMBICODE review, and `helper-output-used` failed.
4. `result.json` in the fixture names `Read,Grep,Glob` — with
   `reviewer.status: failed`.
5. Not applicable to `--ablation none`.

The reviewer failures, in order:

- Run 1: `EPERM: mkdir '/tmp/claude-502'` after 171 ms, and
  `deny network-outbound api.anthropic.com:443`. Claude Code takes its temp
  base from `CLAUDE_CODE_TMPDIR`, else a literal `/tmp`, never `TMPDIR`;
  the reviewer's environment allowlist now passes `CLAUDE_CODE_TMPDIR`.
- Run 2, with that fix and the `WebFetch(domain:api.anthropic.com)` grant:
  no sandbox violation, and the reviewer started, then stopped after 1.6 s
  with **"Not logged in · Please run /login"**. The agent itself runs on
  OAuth (`apiKeySource: "none"`) outside the `Bash` sandbox; its nested
  reviewer, inside it, finds no credential.
- Run 3, 2026-09-27: `CLAUDE_CODE_OAUTH_TOKEN` (a `claude setup-token` token,
  already in `REVIEWER_ENV_ALLOWLIST`) exported in the **operator's** shell
  before launching `claude plugin eval`. Same result: score 0.83,
  `reviewer.status: "failed"`, `"Not logged in · Please run /login"`
  unchanged. The token reaching the operator's shell is not enough — the
  reviewer reads whatever environment the OS sandbox hands the `Bash` tool's
  child process, and that sandbox boundary, not `REVIEWER_ENV_ALLOWLIST`, is
  where the variable is lost: `--help` documents no `claude plugin eval` flag
  to forward an operator env var into it. `CLAUDE_CONFIG_DIR` stays out of
  the reviewer's environment by decision, unrelated to this result.

Until the reviewer authenticates inside the sandbox, every `with`-arm review
records `reviewer.status: failed`, reviewer spend is unmeasured, and no arm
of this suite measures an AMBICODE review. Fixing this needs either a
`claude plugin eval` mechanism (outside this repository) to carry a
credential across that sandbox boundary, or a different reviewer credential
path than an inherited env var — both are product decisions, not a code
change this iteration's plan scoped. The case set is not frozen and no score
exists. The `with` arm now replays recorded answers instead (below): that
measures the workflow around the reviewer, never the reviewer itself.

A zero-case, cost-ceiling or otherwise partial run is diagnostic evidence, not a
result. `evals/results/` is gitignored for that reason.

Outside the sandbox, the same "Not logged in" had a cause in this repository.
`REVIEWER_ENV_ALLOWLIST` dropped `USER`, which Claude Code 2.1.283 needs to
find a macOS keychain login: `claude auth status` said `"loggedIn": false`
under `PATH`, `HOME` and `TMPDIR` only, and `true` with `USER` added. `USER`
is now allowed.

It does not explain the sandbox runs. A probe case (a throwaway plugin, three
authorized haiku runs, $0.11 in total) ran one script in the evaluated agent's
`Bash`, 2026-09-27:

```text
EVAL_AMBICODE_PROBE=reached          set in the operator's shell before `claude plugin eval`
USER=KillBill  HOME=/private/tmp/e-…/home  CLAUDE_CODE_OAUTH_TOKEN=unset
A. auth status, full sandbox env                → "loggedIn": false
B. auth status, reviewer allowlist with USER    → "loggedIn": false
C. auth status, reviewer allowlist without USER → "loggedIn": false
D. one haiku call, allowlist with USER          → exit 1, terminal_reason api_error
```

The same script outside the sandbox gave `true`, `true`, `false` for A–C. So
`USER` reaches the sandbox and does not help; an `EVAL_*` variable reaches it
too, which is what the replay reviewer below relies on.

## Preflight (`npm run evals:preflight`)

One run of each case tagged `preflight`, `--ablation none`, capped at $1.50
(`evals-preflight.mjs`), before any sweep. It reads the run's JSON and fails
unless each gated indicator passed; a case, run or grader missing from the
result is a failure, not a pass.

| Case | Gated | Printed, not gated |
|---|---|---|
| `regression-ts` | `plugin-fired`, `helper-ran`, `reviewer-completed`, `unit-check-ran` | |
| `p2-task-regression-fix` | `plugin-fired`, `helper-ran`, `unit-check-ran` | `reviewer-completed` |

A task case's diff is written by the agent, so no recording matches it
(`replay-miss`), and no live reviewer signs in inside the sandbox: its
`reviewer-completed` cannot pass, and the gate says so instead of counting it.

- **First run, 2026-09-28, $0.41: failed**, correctly, on two setup defects.
  - `regression-ts reviewer-completed`: the recordings sat in `evals/`, which
    the sandbox's `denyRead` names for the evaluated agent (a kept run's
    `settings.json`). They moved to `fixtures/`.
  - `p2-task-regression-fix unit-check-ran`: on `ts-source-regression`, fixing
    `add` makes the tree equal HEAD, and `review` stops at
    `nothing-to-review` before any check. The case now uses
    `ts-source-regression-feature`, whose change also adds `multiply`, so the
    fix leaves a change to review.
- **Second run, 2026-09-28, $0.42: passed**, all seven gated indicators. The
  task case's `review` ran `jest --runTestsByPath tests/math.test.js` after the
  fix, and its reply reported the `replay-miss` as an unreviewed change.

## Skill routing

In the 2026-09-27 sweep the investigate and task skills fired 1 of 15 times
across their five cases (`p2-task-finding-fix-rereview` once). The prompts were
left alone; the two skill descriptions changed. Each now says it is the way to
make a code change, or to answer a question about the code, in a repository
that has `.ambicode/config.yaml`, "instead of editing files directly" or
"instead of reading the code directly", and names small cases such as a
one-line addition. The cause was a guess: those traces were gone.

Routing check, 2026-09-28: the five cases, `--runs 3 --ablation none -j 4`,
with replay, $3.36, 169 s.

```text
p2-investigate-boundary-shortlist   fired 3/3
p2-investigate-frozen-requirement   fired 3/3
p2-task-finding-fix-rereview        fired 3/3
p2-task-regression-fix              fired 3/3
p2-task-trivial                     fired 3/3
```

`p2-task-finding-fix-rereview`'s `reviewed-at-least-twice-if-finding` failed
3/3 in that run. Under replay a task case's reviewer never answers
(`replay-miss`), so there is no finding to fix and re-review; that grader
cannot pass in this suite until a task-case reviewer works.

## Replaying the reviewer inside `claude plugin eval`

Since no reviewer signs in inside the sandbox, the suite runs with recorded
reviewer answers instead:

```sh
npm run build
npm run evals          # sets EVAL_AMBICODE_REVIEWER_REPLAY="$PWD/evals/cases/common/reviewer-recordings/archived.json"
```

The recordings live in `fixtures/`, not `evals/`: the sandbox denies the
evaluated agent reading the plugin's eval directory.

With the variable set, `review` answers from the recording made for the exact
snapshot it is reviewing (`src/review/replay-reviewer.ts`) and starts no
reviewer process. What the `with` arm then measures is the workflow around a
known answer — routing, the helper, the checks, how the agent uses the
result — not the reviewer, which `npm run evals:reviewer` measures.

- **Labelled.** `reviewer.source: "replay"` is in `result.json` and the
  `--json` output, the summary line reads `REPLAYED from a recording (no
  model call)`, and the result is at best `partial`. `reviewer-completed`
  still passes on a replayed answer: it says the workflow reached a validated
  answer, and in this suite every answer is a replay.
- **Exact.** A recording is keyed on the review's `snapshotId`. A change that
  differs by one byte — any `p2-task` case, where the agent writes the change
  — has no recording, and its reviewer fails with `replay-miss` and the
  snapshot it looked for. It never falls back to a model.
- **Validated.** The replayed answer goes through the same location and
  reference validation as a model's.
- **Reproducible.** `materialize.mjs` dates every fixture commit at
  `FIXTURE_DATE`, so a scaffold built at any time has the same HEAD and so
  the same `snapshotId`. Before, HEAD changed every second.

`evals/cases/common/reviewer-recordings/archived.json` holds one `sonnet` answer per review case,
from the first `ambicode` run of `evals/results/reviewer-2026-09-27T21-17-36Z`
(gitignored, so `recordedFrom` names a local file). To record again after a
fixture or prompt change:

```sh
npm run evals:reviewer -- --runs 1
npm run evals:reviewer -- record evals/results/reviewer-<ts>   # writes recordings.json there
cp evals/results/reviewer-<ts>/recordings.json evals/cases/common/reviewer-recordings/archived.json
```

`record` re-scaffolds each case and runs `bundle` (no model call) to key it.
It refuses a case whose change today differs from the recorded one in files,
lines or bytes, and exits 1 if it refused any. Replaying all six on fresh
scaffolds, with a `claude` on `PATH` that logs and fails, gave the recorded
findings unchanged in every case and no `claude` call. That was run outside
the sandbox; a replay inside `claude plugin eval` has not been run.

## Reviewer quality (`npm run evals:reviewer`)

The reviewer's quality is measured outside `claude plugin eval`, as the
operator, with the reviewer's restrictions intact (doc 07:236). It runs from
the operator's own shell and costs model calls: about 12 reviews per run
across the six review cases.

```sh
npm run build
npm run evals:reviewer -- --runs 3          # --case <name> to narrow, --seed <n> to fix the shuffle
```

Each case, arm and run gets its own scaffold, made by the case's own
`scaffold.sh`, and the arms alternate which goes first. The two arms are:

- `ambicode`: the built `scripts/ambicode.mjs review --json`, with the
  frozen requirement evidence piped in where the case scaffolds it.
- `plain`: the same isolated `claude` process (`ClaudeReviewer`: tools,
  environment, output schema and parser), given the case prompt and the
  `git diff HEAD`, with none of AMBICODE's system prompt, bundle, checks or
  location validation.

It writes `evals/results/reviewer-<ts>/`:

- `results.json`, `raw/` (each run's full output), `runs.csv`, `findings.csv`;
- `adjudication-sheet.csv`: shuffled across cases, with no arm and no run;
- `adjudication-key.csv`: maps each row back; keep it closed until labelling
  is done;
- `report.md`.

A failed review is a failed run with its reason and no finding count, never
zero findings. Precision and recall need the labels, per `adjudication.md`.
`evals-reviewer.test.mjs` drives the whole harness against a `claude` stub on
`PATH`, without a model call.

## Categories

Case names, descriptions and tags are neutral: the expected defect lives in
`ground-truth.md` and the graders, never in anything the evaluated agent sees.

| Cases | Category | Fixtures |
|---|---|---|
| clean-ts | Clean or trivial change; any finding is a false positive | `ts-staged-unstaged` |
| correctness-ts | A defect in the changed lines | `ts-off-by-one` |
| regression-ts | Source-only change breaking an unchanged test | `ts-source-regression` |
| requirement-ts | Code contradicts the stated requirement | `ts-requirement-mismatch` |
| duplication-ts | Reuse and unjustified complexity | `ts-duplication` |
| degraded-ts | Evidence is missing; silence is the failure mode | `ts-rename-delete` |

| Case | Skill | Fixture |
|---|---|---|
| p2-investigate-boundary-shortlist | investigate: navigation cost (below) | `ts-feature-boundary` |
| p2-investigate-frozen-requirement | investigate: behaviour against a frozen requirement | `ts-requirement-mismatch` |
| p2-plan-accepted-iteration | plan: ordered iterations, no open decision | `ts-no-tests` |
| p2-plan-path-scoped-policy | plan: path-scoped policy applied | `ts-no-tests` |
| p2-task-finding-fix-rereview | task: fix a reviewer finding, then re-review | `ts-off-by-one` |
| p2-task-regression-fix | task: select and run an unchanged affected test | `ts-source-regression-feature` |
| p2-task-trivial | task: small change, no plan, no task note | `ts-no-tests` |

## Navigation cost (R4)

`p2-investigate-boundary-shortlist` is the one case whose point is not the
verdict. Both arms are expected to be able to answer it; the fixture
(`ts-feature-boundary`) is built so keyword matching alone ranks a retired
decoy exactly like the two real files that share its keyword, and only
co-change separates them.

What it measures is what the answer cost, read from the run record rather than
from a grader:

- tool calls before all four boundary files were open or cited;
- input and output tokens for the run;
- whether the decoy was read at all.

A grader can say the answer was right; none of them can say it was cheap. Both
figures are recorded per arm, with the caveat that three runs of one case is a
signal to accumulate, not a benchmark. `shortlist-requested` is an
`arm: with-only` indicator like `helper-ran`: it matches the tool **input**, so
it proves the call was attempted and nothing more.

## Adjudication

Grader verdicts are machine labels, not adjudication. Document 07 requires human
scoring for actionable precision and recall; `adjudication.md` holds the rubric
that turns a run's findings into those numbers.

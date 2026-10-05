# Benchmark evaluation suite

Real tickets against real code. The data is under NDA and is not in this
repository: `evals/benchmarks/` and everything here but this README are gitignored.
The previous suite (13 synthetic TypeScript cases) is archived in
`../evals-archived/typescript/` and still runs with `npm run evals:archived`;
the trigger-boundary suite is `../evals-triggers/`.

The suite that runs by default is **curated**: `evals-bench.mjs select`
(`evals/cases/scripts/src/`, like every eval harness script) picks
the strongest, most provable cases per side (5 localize + 4 review; 18 in the
2026-09-28 data) into `cases/` here, by measurable criteria only (`SELECT` in
`evals-bench.mjs`):

- **Localize**: every true file still in the snapshot, 2–10 of them, a ticket
  of 300+ characters — ranked by *hardness*, the fraction of true files whose
  name the ticket never mentions. Every selected case scores 1.0: grep over
  the ticket's own words reaches none of its files, so naming them requires
  actual localization.
- **Review**: the change fits the case timeout (≤600 changed lines; a
  1,623-line version timed out at 300 s) — ranked by *substance*, how much
  proof the human threads carry (resolved by the author, replied to,
  120+-character bodies).

`cases/selection.json` records the criteria and each chosen case's numbers.

The harness implementation is [grouped by responsibility](../scripts/README.md)
under `evals/cases/scripts/src/`: `cases/bench-cases.mjs` selects and generates cases,
`analysis/trace-analysis.mjs` reads and harvests traces, `analysis/bench-score.mjs`
scores results, and `analysis/bench-walk.mjs` renders walkthroughs.
`harness/evals-bench.mjs` owns the CLI and run lifecycle and reexports
the existing APIs. The unused `runCasesDir` and `harvestDir` adapters were
removed; use `runSpec`'s `casesDir` and `tracesDir`. `runArgs` remains supported.
Scoring and walkthroughs share parsed traces and case metadata within one
invocation; subsequent invocations reread evidence. Generated prompts,
scaffolds, graders, and score/report formats are unchanged.

```sh
npm run build
npm run evals                 # = evals:walk
npm run evals:walk            # 4 walk-tagged cases (2 localize, 2 review), plugin arm, 1 run, Sonnet 5.5, $2 cap, writes walk-<ts>.md
npm run evals:walk:haiku      # the same on Haiku 4.5
npm run evals:baseline        # 18 cases, naked plugin only, 3 runs, Sonnet 5.5, $15 cap: once per Claude Code version
npm run evals:decide          # all 18 cases, plugin arm, 3 runs, Sonnet 5.5, $20 cap: gate it against the baseline
npm run evals:select          # evals/cases/evals-core/cases/ only, no run (--regenerate: see "Per-arm prompts")
node evals/cases/scripts/src/harness/evals-bench.mjs run … --dry-run     # print the execution plan; spawns and changes nothing
node evals/cases/scripts/src/harness/evals-bench.mjs restore-prompts     # put back prompts an interrupted --prompt with run left
npm run evals:score -- evals/outputs/core/eval-<ts>.json [--baseline <eval-baseline>.json]
npm run evals:gate -- evals/outputs/core/eval-<ts>.json [--baseline <eval-baseline>.json]
npm run evals:walk-report -- evals/outputs/core/eval-<ts>.json
npm run evals:full            # all ~200 cases from evals/benchmarks/cases/, plugin arm, 1 run, $45 cap
npm run evals:generate        # evals/benchmarks/cases/ only, no run
```

`evals-bench.mjs` holds no word of the data — the selection is criteria, not a
list — and `evals-bench.test.mjs` fails if `evals/cases/evals-core/cases/` or its
`results/` is not gitignored, or any file git would take names a ticket
identifier.

**Never point `claude plugin eval` at this suite by hand** (`--eval-dir
evals/cases/evals-core`, or `evals/`, which reaches it: discovery is recursive): it
publishes the HTML report — the NDA prompts included — to claude.ai by
default. `npm run evals` always passes `--no-publish` and refuses
`--publish-report`. The manifest points a bare `claude plugin eval .` at the
synthetic trigger suite instead, and `evals-bench.test.mjs` fails if it ever
points at a directory containing this one, or inside it.

## Layout of `evals/benchmarks/`

One directory per codebase ("side"):

```text
<side>/src/                   snapshot of the code
<side>/.ambicode/config.yaml  the team's configuration for it
<side>/assets/<ticket>.md     "## build:context prompt" (the ticket) and
                              "## TRUE RELATED CODE" (files the merged change touched)
<side>/reviews/<ticket>/<iid>-<head8>/   prepared review versions (below)
cases/                        generated full set; never edit
results/                      run output
```

The curated set is generated into `evals/cases/evals-core/cases/` (also gitignored,
never edit) with the same layout per case; its scaffolds reach back into
`evals/benchmarks/` by a relative path the generator computes from where it writes —
after moving this directory, regenerate with `npm run evals:select`.

## Two kinds of case

**Localize** (`<side>-<ticket>`), one per ticket. The prompt is the ticket and a
question: which existing files would the change touch, as a `## Files` list.

- In the harness: `names-a-true-file` (weight 3, llm judge with the true list),
  `no-code-edit` and `no-code-write` (weight 1 each, no Edit/Write under the
  code), and the with-only indicators `plugin-fired` and `helper-ran`
  (`prepare` or `locate`).
- Graded against the true files **present in the snapshot**: a file the
  snapshot no longer has cannot be found, so it is recorded in `truth.json`
  as `missingFromSnapshot` and not graded. A ticket with none left is refused.
- `evals:score` computes precision, recall, F1 and hit from each run's final
  message, which the llm grader's evidence carries whole. Paths are read from
  the `## Files` section only, so files named as out of scope do not count.

**Review** (`<side>-<ticket>-review-<iid>-<head8>`), one per merge-request
version a human reviewer commented on.

- The scaffold puts each touched file back as it was at the change's base,
  commits, and applies the change as that reviewer saw it, uncommitted. The
  touched files are exact; the rest of the tree is the snapshot, which is
  newer than the change.
- One llm grader per reviewer-started inline thread (`raises-NN`, weight 1):
  did the answer raise the same concern about the same code. The score is
  recall against the humans. Precision is not measured: a concern no human
  raised may be right or wrong, and nothing here can tell which.
- Inside the eval sandbox no nested reviewer signs in, and there is no
  recording for these changes, so the with arm's independent reviewer does not
  answer. What this measures is the agent with AMBICODE against the agent
  without it, not the reviewer.

## Preparing review versions

`evals/benchmarks/audit-mrs.mjs` collects the human discussion on each ticket's
merge requests through `glab api` (GET only). `evals/benchmarks/prepare-reviews.mjs`
turns each version a reviewer commented on into `change.patch`, `base/`,
`absent.txt`, `version.json` and `threads.json`, fetching missing commits by
sha into `<side>/.git-cache`, a scratch clone, never the team's checkout. Both
live in `evals/benchmarks/` because they name the projects.

## Running safely

`npm run evals` goes through `evals-bench.mjs run`, which always passes
`--no-publish`, refuses `--publish-report`, and refuses `--json`, `--report`
or `--output-dir` outside the gitignored directories (`evals/benchmarks/`,
`evals/outputs/core/`). It also refuses a `--json` that already exists:
an earlier result is never overwritten, rewritten or walked as the new run's.
The harness writes to a file only that invocation knows
(`.<name>.run-<uuid>.json`, created exclusively beside the target); the
served-prompt record and the walkthrough are made from that file, and it is
published to the target by a hard link, which never replaces a file. A run
whose target appeared meanwhile (another run with the same `--json`) keeps its
result at the private path, says so and exits non-zero; a run that wrote
nothing annotates and walks nothing. An existing walkthrough is never
replaced either.

`run` parses its arguments once and forwards only what it validated: a
repeated option (`--ablation none --ablation with-without`), a missing value,
an unknown option or a stray word is refused before anything starts;
`--x=v` reads as `--x v`; `-j` is forwarded as `--concurrency`.

`run`, `restore-prompts`, `select`/`generate` and `naked-arm.mjs` each hold
the cases lock while they read or change the case prompts, and refuse while
another live process holds it, naked runs included. The lock is a directory,
`cases/.cases.lock/`, of numbered claims (pid, host, purpose, token). A claim
appears atomically and is taken only after the one below it was released or
abandoned, so concurrent claimants race for one number and one wins; no
process removes or rewrites another's claim. A claim whose process is gone on
this host is taken over, and what that run left swapped is restored first; a
claim from another host, or an unreadable one, is never judged and is refused
with instructions to remove the directory by hand. A release that does not
carry the claim's token releases nothing. The directory stays between runs
(case listings skip it).

It also harvests every run's `trace.jsonl` into `traces/` beside the result
JSON while the sweep runs — the harness deletes its sandboxes at completion
and has no flag to keep them, so a trace not copied during the run is gone.
Error analysis starts from those traces, not from the scores.

The sandbox loads only the plugin under test: user- and project-scope plugins
are absent by design, no case field or CLI option loads a second one, and
`--scaffold` runs outside the agent's sandbox against a child session with a
temporary config dir ("How runs are isolated",
code.claude.com/docs/en/plugin-evals). So an **LSP-armed eval environment is
impossible today**: every run here exercises the no-LSP fallback path, and
whether live LSP tools help or hurt cannot be measured by this harness —
that data needs an ordinary session with an LSP plugin installed.

An `llm` grader's verdict records `judgeVotes` (booleans) and `evidence` —
the judged text itself, not the judge's reasoning; the harness offers no way
to capture why a vote fell. Adjudicate a disputed verdict by reading the
run's `evidence` against the grader's own rubric, and treat a verdict that
contradicts its rubric as a rubric defect to fix, not a plugin result.

The full set runs with `--eval-dir benchmarks`, which puts the snapshot,
tickets and ground truth under the sandbox's `denyRead` for the evaluated
agent. The curated set runs with `--eval-dir evals/cases/evals-core`, whose `denyRead` covers
the curated truth and graders but **not** `evals/benchmarks/` — so every case
carries four `no-peek-*` graders (Read, Grep, Glob, Bash; `max: 0`) that fail
any run whose tool input reaches a path containing `evals/benchmarks/`.

## Shortlist recall, free

`npm run evals:shortlist-recall -- <BE snapshot repo> <FE snapshot repo> [limit]`
asks, for each localize ticket, whether `locate`'s top N holds the true files.
No model runs; it prints counts and per-case numbers, never ticket text.
Use it before spending on a walk when the change is to `locate` or its terms.

## Deciding with it

`run` refuses a sweep without `--model`. On 2026-09-29, four runs of one
plugin build read as plugin changes. In fact the model had changed from Opus
5.5 to Sonnet 5.5, and the investigate body was byte-identical in every trace.
On Opus the agent ran `prepare` in 26 of 29 runs; on Sonnet, in 3 of 50.

`run` also refuses a sweep without `--max-cost-usd`. Campaign R1 (2026-09-29)
ran uncapped for 13.5 h. It spent about $221 API-equivalent ($56 on its lead
agent, $165 on the evals the lead started) and used up a weekly plan limit.

**Three tiers, cheapest first.** Only go up a tier when the one below says the
change is worth it.

1. **Walk** (`evals:walk`, about $1.1–1.3 and 2 min, measured). This runs
   one case per kind per side, from the `walk` tag (the top pick of each), with
   one run and the plugin arm only. `walk-<ts>.md` then lists each run's cost,
   turns, skills, `prepare` use and score, plus its **first deviation** in trace
   order:
   - a `evals/benchmarks/` peek;
   - an edit to the code;
   - `prepare` cut by `head`/`tail`/`cut`;
   - a review re-run;
   - a helper that printed an error code;
   - no skill fired, or a skill but no `prepare`;
   - the turn limit.

   After that summary come the compact steps, one line per tool call. Read the
   first deviation of each run and note what you saw, not why. This is the
   error-analysis method of the ai-evals-course `evals-skills`. It makes no
   model call beyond the runs themselves.

   **Trying a variant of a skill.** `run --plugin <dir> --trust-plugin` evaluates
   a copy of the plugin in place of the repository. The harness resolves
   `--eval-dir` inside the plugin and refuses symlinks there, so the copy needs
   its own `evals/cases/evals-core/cases/` (real files) and a `benchmarks` symlink
   (the case scaffolds `cd` to `../../../../benchmarks/BE`). Do not put the copy
   under a path containing `evals/benchmarks/`: the no-peek graders match that text in
   the plugin's own script path and fail every run (seen 2026-09-30). `.tmp/` is
   gitignored and safe. `--case <glob>` takes one glob, so braces do not
   select two cases; run once per case. The result records the plugin path,
   and the walk header prints it.
2. **Decide** (`evals:decide`, about $13–16 projected, unmeasured: the
   2026-10-04 baseline's measured $10.16 for 54 naked runs × the 1.25–1.6×
   plugin cost ratios of 2026-09-29). All 18 cases (10 localize, 8 review),
   3 runs, the plugin arm only. `--tag localize` narrows it to the 10
   localize cases; the gate then checks localize only, since `withBaseline`
   matches the run's own cases. `evals:gate -- <decide>.json --baseline
   <baseline>.json` takes the no-plugin arm from the baseline. That arm depends
   on the model, the Claude Code version and the prompt, and not on the plugin.
   A baseline that differs in any of those, or one that is partial, is
   refused. The gate prints which baseline it used and how old it is. It
   reports `meanDelta` as **GAP**, since the harness computes that only with
   both arms in one run; the recall check is the Δ check.
3. **Baseline** (`evals:baseline`, $10.16 and 11.3 min measured on
   2026-10-04, 18 cases × 3 runs). Run once per Claude Code version. It
   runs only the no-plugin side, since every decide run brings its own plugin
   arm:
   - `naked-arm.mjs` builds `.tmp/naked`, a plugin with no components, and
     the run uses `--ablation none`. The harness has no without-only mode.
     `withBaseline` takes a naked baseline's plugin arm as the no-plugin arm
     on its own.
   - `naked-arm.mjs --benchmarks <absolute path>` links a benchmark root
     other than this checkout's (a worktree reads the primary's). It refuses
     to build while a prompt swap or an interrupted generation is outstanding,
     and copies no `prompt.with.md`, `prompt.naked.md` or per-arm prompt key:
     the control serves the generator's `prompt.md` bytes.
   - The naked plugin's arm is assumed to equal the harness's no-plugin arm.
     The user declined the paid equivalence check on 2026-10-04. The working
     reference is `eval-2026-10-04T19-44-56-791Z.json` (Claude Code 2.1.289,
     Sonnet 5.5, 18 cases × 3, not partial); naked/without equivalence
     remains **unverified** and must be reported in comparisons: the gate
     prints "naked/without equivalence unverified" whenever its baseline's
     plugin is `naked`. A further baseline or equivalence run requires a new
     user instruction. A run on another Claude Code version is still refused.

A run that died outside the arm (session limit, lost login, interrupt,
scaffold failure) is **absent** in `score` and the gate, even when a grader
scored it. Only a run that hit its own turn or time limit counts as the arm's
outcome. On 2026-10-02, 84 of 156 runs died of a session limit or a lost
login. They read as recall 0, and the gate's absent check passed.

Opus has no script. A run costs 2.5–3× a Sonnet run, and Opus uses up plan
limits fastest. Run it by hand, at a release, with an explicit `--max-cost-usd`.

**Haiku is not the cheap tier.** Measured on 2026-09-30, one case per kind:
- On localize, Haiku 4.5 took 3–4× Sonnet's turns and cost 1.7–1.9× as much.
- On review, it cost 0.6× as much.
- It fired the review skill unforced; Sonnet did so 0 times in 24.

So a Haiku run predicts neither a Sonnet run's cost nor its behaviour.
Effort and thinking cannot be set from the harness. Eval children do not read
the user's settings, and `MAX_THINKING_TOKENS=0` did not stop thinking.
Thinking was about 4.5% of a Sonnet run's cost anyway. Details are in
`gym/planing/investigation/archive/probes-2026-09-30.md` §5.

The curated scripts set `EVAL_AMBICODE_REVIEWER_REPLAY` to
`evals/benchmarks/reviewer-recordings.json`. Inside the sandbox, no nested reviewer
signs in: without the replay, every review failed with `reviewer-error: Not
logged in` (2026-09-30).

`score` reads the harvested traces beside the result and adds what the
agent actually did, counted from its tool calls:
- `skill-fired`, `prepare-ran` and `prepare-truncated` (piped into
  `head`/`tail`/`cut`);
- `review-runs` per run;
- `bash-reads` against `read-calls`.

- `peak-context`: the largest input (uncached + cache read + cache written)
  of any request in the trace.

`traced` counts the runs with a trace. The rest are left out of those
numbers and are not counted as runs that did nothing.

The harvest also copies each sandbox's `.ambicode/task/*/ledger.jsonl` to
`traces/ledgers/<e-id>/<its path in the sandbox>`, so two runs' slugs never
overwrite each other. `score` reads them into each run's `ledger`: map
layers and pass-2 terms, steps by status, revises by `via`, gate prints by
class and answers by `via` (bound to their printed instance or not),
preanswers, blocked exits, permission-denied exits, red-then-green proof,
and the envelope's `builtFrom`. Field contract (step 02 writes it):

- A measure is known only from the records it is read from: a route alone
  measures nothing. Steps, revises, preanswers and exits are each null until
  one of their kind is written, and 0 once one was written with no match (an
  exit that is neither blocked nor permission-denied gives 0 and 0). Gate
  prints and answers are separate records, so `gates.prints`, `answers` and
  `unbound` are null independently, and `bound` needs both. Unreadable or
  empty ledgers keep every measure null. The arm summary averages and counts
  only the runs that recorded a measure, is null when none did, and lists
  those counts in `measured`.
- `check.only` is a flat array of strings (absent or empty is the whole
  suite); any other shape counts the check as malformed and proves nothing.
- `exit {route, reason, detail?, code?}`: `stop-blocked` counts `reason: "blocked"`
  (also the `onError` form `stop:blocked`); `permission-denied` counts exits
  with `code: "permission-denied"`, never the refusal that preceded one.
- `route {id, resumes?}` starts a route chain, or continues the chain of the
  earlier route entry `resumes` names (transitively). A resume of a route the
  ledger does not have earlier, or a repeated id, puts that route in no chain.
- `check {route, key, only?, phase, exit, summary: {ran, failed}}`: proven
  when a `phase: "red"` check (failed ≥ 1, exit ≠ 0) is followed by a
  `phase: "green"` one (failed 0, exit 0) with the same key and the same
  `only` set, both naming (`route`) a route of the same chain recorded before
  them, in the same ledger file, with no `revise` or `exit` of that chain
  between. A `revise`/`exit` naming another chain's route leaves this one
  alone; one naming no known route voids every chain's reds. A check with no
  valid `route` is counted as `unassociated` and proves nothing (older ledgers
  stay readable). A summary that is missing or impossible (ran < 1,
  failed > ran, non-integers) proves nothing and counts as `malformed`.
  `route` on check, revise and exit is not in v6 13 §1: step 02 has to write
  it, or no run proves red then green.

Ledgers are read one file at a time; files are never ordered against each
other. A measure whose record was never written is null, not zero. A ledger
with an unreadable line, or an empty one, is incomplete: all its measures
are null and the run counts in `ledger-incomplete`, not as a clean zero. A run
with no harvested ledger is left out of `ledgered`. MCP hook process spawns
are unmeasured: the trace shows PostToolUse `hook_response` events at best
(`mcpHookResponses`, null when none of that kind appears), not processes.

`eval-gate.mjs` turns a result into pass or fail:
- the model is pinned and confirmed by the traces;
- there are ≥3 runs per case, and the run is not partial;
- no arm has more than 20% absent runs;
- recall with the plugin is no lower than without, beyond the noise band
  (how far an arm's mean moves between repetitions);
- cost is ≤1.1× and turns are ≤+2 against the no-plugin arm;
- `meanDelta` is no lower than 0 beyond the widest band.

A run that replayed the reviewer (`EVAL_AMBICODE_REVIEWER_REPLAY`)
reports its cost as **GAP**, not pass: the reviewer's own cost ($0.33–0.67
per recording, `record-*.log`) is not in the arm.

## Per-arm prompts

The forced review twins are gone; `select --forced` refuses with a migration
message. Instead each localize case carries `prompt.with.md`, the same prompt
with `/ambicode:investigate --headless` typed before its first body line, and
`prompt.naked.md`, a byte copy of `prompt.md`. `prompt.md` itself is
unchanged, so the naked baseline still matches.

`claude plugin eval` 2.1.289 serves one prompt per case to both arms: its
case schema (read from the binary) has no per-arm key. So `run --prompt with`
swaps `prompt.with.md` into `prompt.md` for the run and restores it in
`finally`, behind `cases/.prompt-swap.json`. A killed run leaves the marker;
the next `run` restores first, `restore-prompts` restores on demand, and
`select` and `naked-arm.mjs` refuse until it is gone (`select --regenerate`
recreates the cases instead). `--prompt with` is refused with the naked
plugin or without `--ablation none`, before anything is spawned. After the
run the result keeps the naked prompt as `promptMarkdown` (what the baseline
comparison reads), the served one as `pluginPromptMarkdown`, and
`suite.servedPrompt`; the gate and the walkthrough print it. Review and task
cases get their plugin prompts from the same `writePluginPrompt` in later
steps.

`run --dry-run` resolves the cases as the harness filters them, the served
prompts (as digests), the harness options, model, cap, ablation, trust and
the cases lock, prints that without case names, case selectors, result file
names or prompt text, and exits without spawning or changing a file. It cannot say whether a typed command expands in the sandbox (P37).

The harness keeps a case carrying **any** of several `--tag` values, so `run`
refuses more than one. For walk cases of one kind, select only that kind
(`select --review 0`, then `run --tag walk`).

Cost, measured:

```
2026-09-29  Opus 5.5    18 cases × 3 runs × 2 arms  $57.83  53 min  ≈ $0.54 per run
2026-09-29  Sonnet 5.5  18 cases × 3 runs × 2 arms  $21.26  26 min  ≈ $0.20 per run
2026-09-30  Sonnet 5.5  walk: 6 cases × 1 run × 1 arm  $1.28 / $1.12   2 min
2026-10-04  Sonnet 5.5  baseline: 18 cases × 3 runs × naked arm  $10.16  11.3 min  ≈ $0.19 per run
```

Where a Sonnet run's money goes, from the 09-30 run's 32 traces (list prices;
they sum to $6.86 against $6.44 reported):

```
cache write  0.92M tok  ~50%
cache read   6.23M tok  ~28%
output       0.10M tok  ~22%   (thinking ~4.5%)
judge (Haiku, 3 votes)   ~2%
```

The number of runs and turns × context drive the cost. Thinking and the judge
barely do.

## Three arms with LSP

The sandbox loads only the plugin under test, so a run has the `LSP` tool only
when that plugin declares `lspServers` (probed 2026-10-02). The question is
whether AMBICODE beats the model *with* LSP, not whether LSP beats grep. So
there are three arms:

- **N**, naked: the without arm of the control run.
- **L**, `lsp-only`: a plugin that only declares the TypeScript server.
- **A**, `ambicode-lsp`: the packaged plugin plus the same `lspServers`.

```sh
npm run package:candidate
node evals/cases/scripts/src/arms/lsp-arms.mjs [--case <name>]...   # .tmp/lsp-arms/{lsp-only,ambicode-lsp}
node evals/cases/scripts/src/harness/evals-bench.mjs run --plugin .tmp/lsp-arms/lsp-only --trust-plugin \
  --ablation with-without --runs 3 --model claude-sonnet-5-5 --max-cost-usd <usd> -j 4
node evals/cases/scripts/src/harness/evals-bench.mjs run --plugin .tmp/lsp-arms/ambicode-lsp --trust-plugin \
  --ablation none --runs 3 --model claude-sonnet-5-5 --max-cost-usd <usd> -j 4
npm run evals:gate -- <A>.json --baseline <L>.json                       # A vs N
npm run evals:gate -- <A>.json --baseline <L>.json --baseline-arm with   # A vs L
```

- The builder copies the localize cases only. Review cases replay a recorded
  reviewer, so LSP does not change what they measure.
- Every arm's scaffold commits the same root `tsconfig.json`. The snapshots
  have none, and without one the server builds an inferred project per open
  file, so references reach only the files that file imports.
- The first `findReferences` of a session can be partial until the server has
  loaded the project, about 5 s on 532 files (G25 in `known-gaps.md`).

## Impact cases

`node evals/cases/scripts/src/cases/impact-cases.mjs [--list] [--side BE|FE] [--limit n]` writes cases of the form "I am
changing the signature of X; which files use it?" into `evals/benchmarks/impact-cases` (gitignored). The truth is the
files the TypeScript language service reports as referencing X, excluding tests and mocks, under the tsconfig of
`lsp-arms.mjs`. Run them through the three arms with `lsp-arms.mjs --impact --out <dir>`. The first walk found
word-boundary grep enough for the symbols it picked (naked 1.00 recall), so pick harder ones before a paid run.

## Reuse cases

`node evals/cases/scripts/src/cases/reuse-cases.mjs [--list] [--limit n]` writes survey-before-building cases into
`evals/benchmarks/reuse-cases` (and `-forced` variants that name the investigate skill), scored by `reuse-score.mjs`.
**Do not read their recall or duplicate counts yet:** the scaffold copies the newer snapshot, which often already holds
the ticket's own feature (G28). Run them through the arms with `lsp-arms.mjs --reuse`.

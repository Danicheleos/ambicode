# Investigation note — how to evolve AMBICODE, ranked from dead-end to peak

**This is an investigation note** — not an accepted plan, not a task, not a
decision record. It feeds a plan.

Question: given the docs digests, the eval sweeps, the prod review logs and
the code, which ways of evolving the plugin are dead ends and which are the
strongest, across scripts (CLI, prepare, shortlist, review pipeline,
reviewer, snapshot, checks, policy packs, hook) and skills (investigate,
plan, task, review, init, rules, shared files)?

Sources: `.ambicode/task/push-it-to-the-limit/notes-eval-analysis.md`,
`notes-course.md`, `notes-anthropic-docs.md`, `perrun-*.txt`,
`timeline-*.txt`; `archive/logs/3.1`, `archive/logs/3.4`; the code cited
below. Plugin 0.3.4, branch `eval`, `npm run verify` green (750/751, 1
Windows skip).

## Confirmed facts

### Measurements the ranking rests on

- Two curated sweeps, 18 cases, 1 run each, with/without: localize F1
  0.64 vs 0.65 (13-30) then 0.69 vs 0.63 (16-18); review recall 0.09 vs 0.25
  then 0.09 vs 0.16. Per-case swings between sweeps on the *same* arm reach
  0.5 F1 (be-vs-5928 without: 1.00 → 0.50). `perrun-1330.txt`,
  `perrun-sweep1.txt`.
- Armed review runs never ran the pipeline: `helper-ran` 0/8 in both sweeps;
  15/16 agents wrote "writes `.ambicode/reviews/` … you asked me not to
  edit". `timeline-1330-review-with.txt`, `timeline-sweep1-all.txt`.
- The sandbox reviewer cannot sign in (`reviewer-error … Not logged in`,
  replica run); replay recordings now exist for 5/8 review cases
  (`benchmarks/reviewer-recordings.json`), 3 FE cases refused by
  `snapshot-too-large` until recorded with `--exclude 'main/assets/i18n/**'`.
- LSP: 0 uses in every sandbox run; the sandbox has no LSP server (tools
  list in every trace: `Task, Bash, Glob, Grep, Read, Skill, TaskStop,
  ToolSearch`). In this session LSP works on this repo (workspaceSymbol,
  documentSymbol, findReferences all answered).
- Prod MR !2696, same pinned revision reviewed by 0.3.1 and 0.3.4: 3 and 4
  findings, user verdict 0/4 useful; same three themes both times; reviewer
  $1.52 / 369 s and $1.83 / 438 s; prompt 287 KB of which 238 KB diff,
  10.6 KB policy dump, 16 KB changed-file list; both runs cite zero
  `ruleRefs`. `archive/logs/*/MR_2696_*/result.json`,
  `reviewer-user-prompt.md`.
- Human review threads behind the graders: 19; 10 conventions, 4 questions,
  3 design, 2 correctness (`notes-eval-analysis.md`, thread taxonomy).
- The recorded pipeline reviewer hits 1 of 8 human threads on the 4 BE/FE
  cases recorded first (validator on `cycleTimeSec`); its other findings are
  permission regressions, duplication, unused imports — plausible, but not
  what the humans wrote.

### Code facts

- MR mode gives the reviewer changed files only: `includeSiblingContext:
  false` is hard-coded with the comment "Each unchanged neighbour costs a
  remote request" (src/review/bundle.ts:379); the option is plumbed through
  src/snapshot/remote-target.ts:24,46 into `RemoteContent`
  (src/providers/gitlab/provider.ts:243). Local mode includes same-directory
  neighbours (src/snapshot/snapshot.ts:273). The prod result's omissions say
  "Only changed files are present", and the reviewer's coverage notes list
  six shared components it could not read.
- `configurationProvenance` already knows whether the checkout is the MR's
  own project (src/snapshot/remote-target.ts:144-176); nothing uses that to
  read unchanged files from the local checkout.
- Reviewer rules: "one location that cannot be verified makes this whole
  review invalid: every finding is discarded" (src/review/prompt.ts:384-386,
  prompts/reviewer-role.md); "below medium confidence on both → do not
  report"; single `claude --print` process (src/review/claude-reviewer.ts).
- Checks: `src/checks/adapters/` is empty; MR mode never executes a check
  without a digest-pinned image (src/checks/remote.ts:1-5); both benchmark
  configs null every command; every eval and prod run reports "No lint,
  unit, or e2e check ran".
- Policy: 12 builtin packs, all `authority: inherited`, 3–15 reviewer-judged
  rules each (policies/*.yaml); no `team` pack in either benchmark config or
  the prod config; `rules` skill is the only path to one and never appears in
  any eval.
- Shortlist: whole-term and compact-form substring matching over paths and
  `git grep` (src/code-intelligence/locate.ts:161-290); be-vs-5766 got 3
  candidates, all NOM files, truth 7 REBA files; `locate` retired from prose
  after adding 0/18 recall (refactor notes I8). Agents still `head -c` the
  output in 9/36 runs per sweep.
- Skill bodies: investigate 7,003 B, plan 9,808 B, task 10,565 B, review
  9,285 B, rules 9,921 B; zero worked input→output examples (`grep -i
  example` hits only CLI usage lines); prose tool preference only,
  `allowed-tools` keep Read/Grep/Glob unrestricted.
- Requirements: `plugin:atlassian` returns `parent` for a story
  (`archive/logs/3.4` fetch of VS-5813 → VS-5812); `claude_ai_Atlassian`
  does not; skills/shared/requirements-mcp.md never mentions parents; the
  user supplied the epic by hand.
- Hook: contract injected once per epoch, 2.7 KB, hash-cited, cache-stable
  (src/hook/run-hook.ts); always-on descriptions already cut 54% (I3).
- Snapshot per-file ceiling 262,144 B (src/config/defaults.ts:41): every
  i18n bundle in the FE repo exceeds it; 0.3.4 excludes at once (iteration 1).

## The ranking — from dead end to peak

Weakest first. Each entry: what it is, the evidence, the verdict.

1. **More prose in skill bodies (rules, prohibitions, "read it whole").**
   I5/I6 wording changes moved nothing measurable (truncation 9/36 → 9/36;
   fallback lines unchanged); 15/16 agents overrode the review skill's own
   text under a two-word prompt instruction. Prose that competes with the
   user's prompt loses. *Dead end as a lever; keep bodies shrinking.*
2. **LSP-first navigation taught by prose and measured in this harness.**
   The sandbox cannot load an LSP server, so every prose change here is
   unmeasurable there; in real sessions it is unmeasured. *Dead end until
   either a PreToolUse/allowed-tools mechanism forces the tool or a
   real-session measurement exists. Cheap first step: five ordinary-session
   transcripts on this repo with the LSP plugin on, counted.*
3. **Tuning the substring shortlist.** Wrong 3/3 on a REBA ticket, `locate`
   added 0/18, F1 at parity. The words in a ticket rarely name the boundary;
   a substring matcher cannot bridge that. *Weak. Only a structural retriever
   (symbol index / co-change / hybrid lexical+semantic) changes the shape;
   before building one, measure shortlist recall@10 alone on the 10 localize
   cases — it is probably near zero, which is the number that justifies or
   kills the investment.*
4. **Deciding anything from one run per case.** Same-arm swings of 0.5 F1
   and a sign flip between sweeps. *Weak as practice; three runs and medians
   before any accept/reject, or the plugin is being steered by noise.*
5. **Checks pipeline in current deployments.** Empty adapters directory, MR
   mode needs a pinned image nobody configured, benchmark and prod commands
   null; every run reports gaps honestly and verifies nothing. *Structurally
   sound, practically inert. Stop spending on it until one team configures
   commands or an image; then it becomes item 9's evidence.*
6. **Descriptions and triggering.** Trigger map deterministic 24/24 after the
   trim; always-on −54%. *Done; remaining upside is small. Only the
   post-compaction re-priming gap (descriptions vanish after /compact) is
   left, and it is a small PostCompact hook.*
7. **Requirements retrieval.** Parent epic skipped by 0.3.1, supplied by hand
   in 0.3.4; two connectors, one question; limits surfaced one at a time
   (input-too-large, then snapshot-too-large: three launches). *Medium: one
   level of `parent` when the connector returns it, `requirements.mcpServer`
   written at init, and both limit checks in one pass. Cheap, saves a launch
   and a question per review; does not change finding quality.*
8. **Reviewer prompt economy.** 10.6 KB of generic inherited rules that
   produced zero `ruleRefs` in both prod runs, a 16 KB changed-file list, 6 KB
   role prose, before a 238 KB diff, on sonnet at 6–7 min and ~$1.7. *Medium
   to strong and free: drop rule text the reviewer never cites (keep ids),
   cap the file list, trim the role prose to its checkable rules. Measure
   cost, duration and findings on the pinned MR !2696 before/after.*
9. **Evals as the steering wheel.** Recordings for 8/8 cases, three runs,
   truth relabelled `actionable` / `correct-but-inert` with recall on
   actionable only, judge agreement on 10–20 findings, the 0/4 prod verdict
   as a labelled case. *Strong and a prerequisite: without it items 10–12
   cannot be accepted or rejected. Most of the plumbing now exists
   (`evals:record`, replay wiring, per-run scripts).*
10. **Unchanged-neighbour context in MR mode.** The flag exists and is
    hard-coded off to save remote requests; local mode already includes
    neighbours; the checkout is usually the same project, which the code
    already detects. Reading neighbours from the local checkout at the MR's
    base costs zero remote requests. *Strong: the reviewer's coverage notes
    name exactly the files it needed, in every prod and recorded run.*
11. **A verification pass over findings, and sectioned recall.** Current
    shape rewards silence (invalid location voids all; below-medium dropped)
    yet the prod output is nits the reviewer itself half-retracts (the API
    service's `catchError` was in the diff). A second, cheap pass that keeps
    a finding only if it names a concrete behaviour a user or caller sees,
    is not already handled in the diff, and is postable as written; plus
    two or three focused passes (correctness, requirements, duplication)
    merged by location. *Strong: it attacks precision directly, which is what
    the user rejected; measured by item 9.*
12. **Team policy packs mined from review history.** 10 of 19 human threads
    are conventions no inherited pack encodes, and the reviewer is told not
    to raise unadopted preferences; `audit-mrs.mjs` already collects
    threads; the `rules` skill already writes packs but has never run in an
    eval. A "rules from your last N merge requests" path turns the team's
    own review record into `team` rules the reviewer may cite. *Peak: the
    only lever that moves recall on what humans raise and displaces the
    generic nits at the same time, and it makes every later review of that
    team better, not just the next one.*

Cross-cutting: cost. The armed arm is +20–46% per run on top of the
reviewer's own $1.5–1.8 per MR; items 8 and 10 lower it, item 12 makes it
buy something.

## Assumptions

- The 0/4 prod verdict generalises: one MR, one user, two runs. The
  benchmark's 1/8 human-thread hit for the recorded reviewer is consistent
  with it but measures recall, not usefulness.
- Reading MR neighbours from the local checkout is acceptable to the
  isolation model (the reviewer still reads a sanitized copy; the source is
  the checkout at the MR base rather than GitLab). Not verified against
  docs/review.md's provenance guarantees.
- Token figures are bytes/4; costs are the reviewer's self-reported usage.

## Unresolved questions

- Shortlist recall@10 in isolation (never measured).
- Whether LSP changes anything in ordinary sessions (never measured).
- Judge agreement with human adjudication on the review graders (never
  measured); until then "recall 0.09" is a judge reading.
- Whether a team will configure check commands or a pinned image; item 5's
  value depends entirely on it.

## Recommendation

Do 9 first (three runs, all recordings, adjudicated truth), then 10 and 8
together (both are CLI changes measured on the same pinned MR), then 11,
then 12 as the product bet. Retire prose-only work (1, 2) and shortlist
tuning (3) unless their cheap measurements say otherwise.

## Navigation evidence

Navigation: LSP — workspaceSymbol(`contentMatches`) to locate the shortlist
matcher, documentSymbol(src/snapshot/remote-target.ts) to find
`includeSiblingContext`, findReferences on it to reach
src/review/bundle.ts:379 and src/providers/gitlab/provider.ts:243; targeted
grep/sed for the rest. Shortlist (6 terms, 10 listed): confirmed
src/snapshot/remote-target.ts, src/snapshot/limits.ts, src/hook/run-hook.ts;
rejected src/policy/resolve.ts, src/policy/provenance.ts, the three
evals-archived p2-plan-path-scoped-policy files and the two test files (not
needed for the question). Outside the shortlist: src/review/bundle.ts,
src/review/prompt.ts, src/providers/gitlab/provider.ts, src/checks/select.ts,
src/checks/remote.ts, src/config/defaults.ts, src/code-intelligence/locate.ts,
policies/*.yaml, all six SKILL.md files, the notes and logs named above.

## What would change this conclusion

- Shortlist recall@10 above ~0.5 on the localize cases would promote item 3
  to a real lever.
- Ordinary-session transcripts showing LSP cutting turns or tokens would
  promote item 2 from dead end to mechanism work.
- A reviewer run with neighbours (item 10) that still returns the same nits
  would demote 10 and promote 11.
- A team pack built from real threads that the reviewer still fails to cite
  would demote item 12 to a prompt problem (item 8/11).
- Three-run medians overturning the 1-run numbers would reorder 4–8.

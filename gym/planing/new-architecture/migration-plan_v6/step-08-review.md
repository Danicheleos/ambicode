# Step 8 — Review route: estimate gate, index dependents, stop on a missing requirement, `review-run` re-entry, verbatim coverage, selection metrics, live reviewer tier

> **Dispatch**: 00-README defaults (isolated workspace, uncommitted, $0).
> Prerequisites: 07 integrated; 0-R decision and P37(b)/P58 report attached.
> Read 01-contracts and 02-scenarios first. Every paid item below needs named authorization.
> An unrun eval is measurement pending; finish independent model-free work.

## Why this step exists

The review pipeline is what measured as strong (M18) and stays byte-for-byte where the design
says so (41 "Kept"). What changes is around it: an estimate before spending with a non-acting
default, dependents from the index when one exists, a hard stop when a requirement is missing (#65),
the re-run after an approved waiting key as a route step, the "not covered" block read back verbatim,
and the publication selection metric (D4). The review eval is invalid today (replay-miss, P19); the
live tier replaces it. Design: [../v6/skills/25-review.md](../v6/skills/25-review.md),
[../v6/modules/16-checks-review.md](../v6/modules/16-checks-review.md) §5–§8,
[../v6/33-measurement.md](../v6/33-measurement.md) §0.7, §6; [../v6/41-migration.md](../v6/41-migration.md) step 8.

## Read first

1. `CLAUDE.md`.
2. `../v6/skills/25-review.md` whole (incl. "The D2 trade, stated"); `../v6/modules/16-checks-review.md`
   §1 (pipeline unchanged), §4–§8; `../v6/32-artifacts.md` §4 (`requirements-server-disconnected`
   `policy: {review: stop}`), §8 (`metrics.jsonl`); `../v6/modules/12-route.md` §3.5; `../v6/33-measurement.md`
   §0.7, §6; `../v6/01-goals-and-constraints.md` §1 (review claim and finder claim), M18, D2, D4, D8;
   `../v6/40-open-problems.md` P19, P20, P29, P51; `../v6/41-migration.md` "Kept" table (what must
   stay byte-for-byte: `src/review/prompt.ts`, `report.ts`, `src/snapshot/*`, `src/providers/*`,
   `src/publication/*`, `policies/*.yaml`, `prompts/reviewer-role.md`, `templates/*.eta` except `review.eta`).
3. Code: `src/review/bundle.ts` (`assembleBundle`, `writeBundleArtifacts`), `src/review/validate.ts`
   (`validateFindings`; the `onInvalid: drop` branch goes here, off by default), `src/code-intelligence/dependents.ts`
   (`findDependents`, ≤ 8), `src/page/*` and `templates/review.eta` (selection metrics), `src/cli/commands/review.ts`,
   `src/cli/commands/view.ts`, `skills/review/SKILL.md` (5.9 KB → ≤ 2 KB) and `references/{merge-request,outcomes}.md`
   (kept, named by step text), `references/impact.md` (**deleted**, 41), `references/requirements.md`.
4. `evals/evals-core/README.md` ("Inside the eval sandbox no nested reviewer signs in"); `evals/scripts/src/evals-reviewer.mjs`
   (how recordings were made; the live tier replaces re-keying them).

## Deliverables

### 1. Estimate (16 §5) and the `estimate` gate (25 step 4)

`$A review --estimate [target]`: a dry `bundle` — files, lines, checks and decisions, waiting keys,
snapshot bytes; median duration and cost of the last 5 reviews in this repository when present
("no history" otherwise, P20). Catches `input-too-large` / `snapshot-too-large` before the snapshot
is written and prints `--only/--exclude` suggestions. The route prints it as the declared gate
`estimate` ⏸ *run* / *narrow (--only/--exclude …)* / *skip*, default **skip** (non-acting); evals pass
`--answer estimate=run` only at a proven hook/harness trusted start. Later acting flags are
never authority; S14 verifies trusted headless without preanswer skips reviewer.

### 2. Dependents (16 §6; D8)

`index: none` → `findDependents` unchanged (name search, ≤ 8) — **the default configuration is
unchanged**. With an index (step 5): `relates` of the changed files passed as `--context`. Names the
harvest marks as colliding are listed in the reviewer prompt as "verify import" (10 §1) — this is
the one addition to the prompt **content**; `prompt.ts` stays byte-for-byte, so the line is added
where the bundle assembles context, not in the prompt template (verify the Kept rule in the report
with a `git diff --stat` of the kept files: empty).

### 3. Complete missing-source behavior (v6/25, G5/M3)

Registry policy review:stop applies to disconnected, ambiguous and not-captured-twice;
interactive ambiguous still offers actual connected servers. Defaults/releases stop.
Partial captures, list-only hit or unrecognised payload → requirements-missing refusal at ground,
missingAsked names each requested source, **no exit entry and no reviewer**. Fetch remaining
source then route next → normalization succeeds → estimate. Explicit stop is the exit path.
Test S7 recovery and S8 no-capture gate on the actual review route; reuse 04 fixtures.
Standalone requirement-based review must preserve existing refusal, never degrade silently.

### 4. `review-run` re-entry (25 step 5; #77)

`review-run` (code, `repeat: 2`): waiting checks → `check-only-unauthorized` per key ⏸
approve/decline (default decline); approve → `revise review-run` (`$raisedBy`) so the re-run is a
route step; at `repeat` the declined keys stay under Not verified. Two waiting keys approved one
after the other are two human cycles (review-v4 §6 noted it: legal); the gate text names a single
re-run command carrying both `--approve` keys when both are waiting.

### 5. Verbatim coverage and the Stop check (25 step 6)

The model reads the four parts back as printed; the "not covered" block must appear **verbatim** in
the report-shaped stop; the Stop hook (b) checks it by normalized diff.

### 6. Selection metrics (16 §8; D4)

The page records offered/selected/edited/posted per finding into `result.json` and
`.ambicode/metrics.jsonl` on submit (32 §8 line shape); `init --apply` gitignores `metrics.jsonl`
(step 9 — until then the review route's start tail checks the ignore and warns). An aggregation
script `evals/scripts/src/selection-metrics.mjs` prints accepted rate per repository. Touches
`src/page/*` and `templates/review.eta` only.

### 7. `review.onInvalid: drop` (16 §7) — flag only

A config flag, default `void`; `drop` keeps valid findings and drops the invalid ones with the
status downgraded and the drop stated. Off by default; the experiment runs in step 10.

### 8. Skill body (25 "What the model loads")

`skills/review/SKILL.md` ≤ **2 KB**: what the pipeline is; the four reporting rules **with reasons**
(empty ≠ clean; failed reviewer ≠ clean; skipped check ≠ pass; one bad location voids); the fallback
start line. `disable-model-invocation: true`; the description states the D2 trade in one sentence
(a natural-language "review my change" goes to Claude Code's built-in review; AMBICODE's runs only
when typed). Delete `references/impact.md`; `merge-request.md` and `outcomes.md` are named by the
step text when needed.

### 9. `routes/review.yaml`

Steps per 25's table: `start` (one target; `conflicting-target`, `baseline-not-applicable`),
`template`/`fetch` when `args.hasRequirement` (headless: only `--requirement`, D17), `estimate-step`
(code, tail of fetch or start), `estimate` (human), `review-run` (code, `repeat: 2`), `readback`
(model), `view` (model; `--mr` → `view --review <id>` in the background; the tokened URL), human
selection on the page (not a route step; publication stays human-only), `metrics` (code, on submit).
`budget.modelSteps: 6`. Ceremony: `route next` ×0–1 + the estimate gate = 1–2.

### 10. Live reviewer tier (33 §0.7, §6; needs named go and trusted launch)

Per decision 0-R: (i) credential pass-through inside the sandbox, or (ii) a runner outside the
sandbox for the 8 review cases × 3 runs, 2 arms, live reviewer, cost including the reviewer.
Measures: `complete` share ≥ 90% when no check waits; location validity 100%; accepted rate tracked;
finder hypothesis: thread recall vs naked. Planted caller-break cases (G7) for index `relates` vs name
search when step 5 shipped an adapter. **Decision 8-F**: live-reviewer thread recall ≤ naked at
> 1.5x cost over 3 runs → the user decides whether review is described as a publication and
coverage tool. Present; do not decide.

## Proofs

- `npm run verify` green; `git diff --stat` on the Kept files is empty; tests for every deliverable;
  the gates table test covers `estimate`, `check-only-unauthorized` under review, the disconnected
  stop.
- Integration on a fixture with a planted finding (`ts-source-regression`): `route start review
  --branch` → estimate printed → synthetic *run* → `review` runs with the replay reviewer
  (`EVAL_AMBICODE_REVIEWER_REPLAY` with `fixtures/reviewer-recordings.json`) → one waiting key →
  gate → synthetic approve → `revise review-run` → re-run → report step; the "not covered" block is
  checked verbatim by the Stop fixture. Show the ledger.

## Do not

- Do not change the pipeline's status rules, error codes, prompt template, snapshot, providers or
  publication (M18; Kept).
- Do not run the reviewer on a skipped or defaulted estimate; do not publish anything.
- Do not use a language service for dependents (D8); do not keep `impact.md`.
- Do not re-key the reviewer recordings (P19); the live tier replaces that.
- Do not turn `onInvalid: drop` on by default.

## Implementation hand-off acceptance

Deliverables 1–9 are built and tested, the Kept diff is empty, the integration ledger is shown, and
the live tier has run (or is "awaiting go") with decision 8-F presented as 33 §6 says.

## Review per-arm prompts (owned here, using 00's mechanism)

Extend select's existing prompt hook to write all 8 review prompt.with.md files. First body line:
`/ambicode:review --headless --answer estimate=run`, with no target flag. reviewScaffoldFile
commits the base then applies an uncommitted change; review's default target is that work.
Preserve remaining body/front matter and naked prompt.md bytes. Test a synthetic scaffold
built the same way: review --estimate selects the changed files; --branch excludes those
uncommitted changes and yields no matching file set (or baseline-not-applicable). Do not read a secret truth list to pick
files. pluginPromptMarkdown records served body; promptMarkdown remains naked baseline body.
Tests: eight synthetic review with-prompts, naked bytes unchanged, run --dry-run --prompt with
lists them, real estimator/review start selected, unauthorized later flags declined.
No live plugin arm until P37(b) or P58 proves trust; external runner needs proven hook start
or authenticated harness adapter too, not a public trusted flag. Report unsupported as pending.

## Byte ceilings and final integration

Assert built outputs: body≤2,048 bytes; start≤3 KiB; review --estimate and estimate gate≤2 KiB;
every review instruction≤1,500 chars; generic CLI/hook caps/file fallback unchanged. Tests use
large synthetic diffs/coverage. Do not raise limits. Run complete S1–S14 and all registry gate
matrix after integration; use 04-release-acceptance for package/compatibility checks.
Step 08 owns final completeness audit of v6/31 CLI including worker run and doctor.
Review estimator extends step 07's seam and writes no snapshot/check/reviewer/publication effect.
Metrics change page/ review.eta only; aggregator touches evals; default validate behavior stays void.
Review live-tier budget $8–16 historically covers 24 reviewer calls; two-arm full-session overhead
must be estimated and separately bounded from observed cost before dispatch, not hidden in that
figure. The new live tier uses two arms as v6/33 §6 requires; an authorized naked comparison
session for this tier is an experiment arm, not a new global curated baseline. Use the
user-authorized 2026-10-04 working naked reference for the early curated gate; retain the
unverified naked/true-without equivalence assumption. Report both the fresh live-tier comparison
and any cached comparison separately, including version uncertainty and reviewer cost.

Measurement status is separate from implementation acceptance. If a paid proof is not authorized,
report it as pending with its exact downstream limitation; do not claim the skill's bar is met.

## Trigger-suite migration (D2)

In the same change that disables model invocation for review, convert its positive
evals/evals-triggers cases to “no AMBICODE skill fires”. Preserve case inputs and validity
checking; add synthetic assertions for the changed expectations. Step 03 retires the old
trigger release-gate script. Do not run this paid suite without named authorization.

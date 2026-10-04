# Core integration and release acceptance

Owner: integrating agent after step 08. Read prerequisite reports from 00–09, shared contracts,
scenario matrix and normative v6/41 Kept/Deleted/Compatibility. Step 10 is optional.
This is a local candidate hand-off, not an instruction to publish/install into the user's
working environment, commit, push or deploy.

## 1. Integration prerequisites

Identify merged base commit, source manifest and each step's actual integration revision.
All core interfaces exist; no temporary fake ownership/consent implementation remains.
Decision A has explicit proceed. Missing source data/probe support is named; no hidden pending
branch is reported as complete. Config bootstrap and migrated legacy paths are included.

## 2. Functional and contract verification

Run affected integrated tests then npm run verify. Record actual count and exit output.
Run all S1–S14 against real route YAML with synthetic model-free hooks/commands.
Platform S2 launch truth remains separately conditional on P37(c); synthetic pass is no proof
that installed Claude invokes hooks. Full registry/default/release/revise table covers all gates.
Check negative authority, standalone consumers, different chains, ownership concurrency,
old-instance answers, producer-window recovery and each crash boundary.

Audit every v6/31 command/flag against CLI SPECS/USAGE, including worker run, doctor, note list,
promote, init --set, draft selection, check-only/phase and project/source handling.
All errors have a documented release; --json remains valid JSON; normal outputs within caps.
No command adds a public trusted/channel flag or resurrects model-invocable skill descriptions.
Plain questions and MCP reads without active route remain negative cases.

## 3. Compatibility and protected seams

Load schema 1/schema 2 fixtures with notices, accept init migration to 3 with comments preserved.
Reject too-new schema. Legacy L<n> note/review ledgers read without granting consent.
New entries coexist. Draft stays on Reject/default or crash; second promotion repairs/no-ops.
prepare stays deprecated for exactly the planned one release; no premature deletion.
Direct plan saves removed after 06; old notes still visible. No orphan shared-file references.

Against dispatch baseline verify byte-identical protected paths from v6/41:
src/review/prompt.ts, report.ts, src/snapshot/, src/providers/, src/publication/,
policies/*.yaml, prompts/reviewer-role.md and templates except review.eta.
Named extension seams (bundle, validate flag, process runner, checks, page/review.eta, policy
projection and search) have behavior regressions proving unchanged defaults.
Do not infer byte equality from test pass alone. Explicit unexpected diff is a release finding.

## 4. Packaged candidate evidence

Run npm run package:candidate and npm run package:reproducible after build/verify.
Inspect dist candidate/inventory for route YAML, gates, step Markdown, built CLI and standalone
guard, retained named references. Validate shipped route definitions from dist, not just source.
Assert excluded design/NDA files, benchmark data, credentials, unshipped worker definitions,
obsolete shared references and impact LSP procedure are absent.
Smoke a throwaway fixture using packaged CLI: init Cancel/Apply → investigate → plan draft/
Accept/reject → task check/skip reviewer → review estimate/skip; simulate consent in test harness.
No live model required. If model-free smoke uses fixture-only definitions, keep them outside
candidate. Do not publish candidate or install into real host as part of acceptance.

## 5. Measurements and claim gates

Reports contain both arms, loser detail, provenance, peak context, requirement bytes,
ceremony/work counts, cost/turns and skipped/denied verification.
Passing unit tests proves contracts, not speed or cost. Paid runs require authorization.

| Skill | Required measurement | Claim threshold |
|---|---|---|
| investigate | authorized walk then curated decide against matching cached naked subset | recall within recomputed comparison noise band and cost≤1.15x; turns reported |
| plan | frozen composite,3 epics×3 runs×2 arms, hand AC labels, single MCP process | >spread on≥2 metrics, not worse beyond spread on third |
| task | base scaffolds,10×3×2, hidden tests, valid red/green and assertion grader | gain≥20pp and cost≤1.2x; inside band inconclusive |
| review | typed trusted plugin launch, live reviewer, two live-tier arms (separate from cached curated gate) | complete≥90% no waiting check; valid locations100%; finder claim separate≤1.5x |

Reuse the user-authorized 2026-10-04 working baseline (18 cases/54 runs, naked with arm,
Claude Code 2.1.289). Preserve exact version/model/prompt/case/arm/partial refusals and automatic
reference-arm selection. No 2.1.287 version exception is required. Recompute noise from compared
repetitions; do not freeze 0.101. Record the declined/unrun naked-vs-true-without check as an
unverified equivalence assumption, not a passing probe. Do not run another baseline or that
comparison without a new explicit user instruction. Keep archived eval unchanged.
Infrastructure failures remain absent; own arm turn/time limits remain outcomes. Test both
classes after integration, with no fabricated zero-recall or successful negative trigger.
Do not mix untrusted/default-skipping
plugin runs into “live reviewer succeeded” denominator; report them as launch/consent failures.
Current selected neutral cases and working baseline both contain 18 cases; historical 26 included
twins. Counts after --tag localize are reported separately; the user confirms A's proposed
10-case population before paid decide. P-S/0-S must establish session transport, and version
mismatch leaves A measurement pending until a new instruction. Small-sample, correlated-case and single-baseline
noise limitations remain. Unknown index effect keeps default none.

## 6. Final status

Deliver one integration report with:
- implementation contracts pass/fail, package inventory/hash and protected-file diff;
- S1–S14 statuses and actual test commands;
- per-skill measurement passed/pending/inconclusive/failed with decision records;
- remaining platform limitations and their supported fallback;
- user decision needed at any unmet claim gate, with concrete numbers and options.

“Implementation ready; measurements pending” is a valid honest hand-off.
“Faster/cheaper/less peak context” requires measured outputs; never inferred from file size caps.
No automatic rollback or backlog reopening. Only the user authorizes release publication.

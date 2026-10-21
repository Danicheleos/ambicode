## Current version

0.6.3 (released 2026-10-21 after p24). Branch `new_tuning`; 23adeb26..cf1bc67f squashed into 5c6833de (user, 2026-10-21; same
tree, not pushed): commit hashes after 23adeb26 below exist only via reflog / old HEAD cf1bc67f. Last `npm run verify`
green 1294 pass 0 fail (f49f59f1). Commit after every phase/iteration (user, 2026-10-19).
Bench context = `inseer-frontend/.ambicode/context` (never touch; shasum before/after runs). Backup `.local-docs/context` is
gone (2026-10-21); user: not needed, the baseline runs are the reference.

## Navigator: where we are (2026-10-20)

User decisions: the navigator stays on **haiku** (frequent scope subagent for all skills; a senior model refines; ±0.1 F1 vs sonnet is fine),
packaged as one tool, **no Bash** (too risky). Context exists only to make the navigator faster/cheaper; dropping it is a later decision.
Main problem now: **haiku cuts its own findings**.

Active plan: "navigator eval" (3146e432), next phase p12 (cleanup). Child "haiku navigator + map tool" (540d2397) completed 2026-10-20.

### Bench: 6141 / 3571 / 6404, F1 (haiku unless noted; x2-x3 runs, haiku variance about ±0.15)

```
variant                              6141   3571   6404   mean   R mean
bare (sonnet, no context)            .339   .521   .815   .558
sonnet V2.1 (4c6c84ad)               .33    .58    .86    .59
haiku 634cccd3 (cap 3 notes)         .144   .616   .744   .501   .443
haiku + map --folders/--near c46d76ae .050  .374   .738          .427
haiku 634 + map union 3d15eb34       .077   .355   .745          .356
haiku no context 4fef362f            .140   .465   .835   .480   .428
haiku cap 12 notes d5349924          .112   .536   .817   .488   .392
haiku evidence rule, cap 6 4fc7b3f   .140   .537   .815   .497   .447
haiku deepest notes 932b65e4         .185   .625   .815   .542   .503   <- current file
```

10 cases: bare R .530 P .543 F1 .505 $0.144; sonnet V2 F1 .518; sonnet V2.1 F1 .542 $0.128; context-only sonnet (pre-V2) F1 .396.
**haiku 932b65e4, 10x3 (2026-10-20, stamps 17-55-29..18-12-57): R .593 P .610 F1 .572 $0.054/run** ($1.61 total, 0 zero-score).

```
case   438  6141 5948 6292 5967 5164 6404 3571 6406 6086
haiku .470 .194 .517 .473 .766 .857 .852 .555 .610 .431
bare  .738 .339 .502 .159 .503 .589 .815 .521 .480 .400
V2.1  .500 .331 .499 .309 .514 .803 .833 .520 .500 .615
hctx  .563 .182 .471 .455 .715 .730 .793 .407 .493 .466   haiku on the haiku-scout context (2026-10-21), F1 .528
```
Weak: 6141 (R .185), 438 (R .833 but P .329, per-run .55/.62/.25), 6086 (vs V2.1 -.18). Haiku peak context ~25k, 7.6 tool calls/run.

### Findings

- Bash variants failed because granting Bash removed Grep/Glob from the subagent (`No such tool available: Grep`); reverted
  (`e12562fe`), `map --folders/--near` removed (`5ffc1b3f`). Offline data-file (i18n key) hop: no gain.
- Haiku obeys numeric caps and step order (6/6), not floors ("use all N": 3/6) or print steps (0/21). It emits no text/thinking.
- Stage A: haiku selects modules as well as sonnet (related-module R .73-.88 vs .58).
- Funnel: truth folders listed in a read note, named: haiku .40-.64, sonnet .77. Named without a source hit: haiku .08-.09,
  sonnet .94. Haiku names only what Grep/Glob returned ("not globbed, so they are left out") → the "confirmed" answer rule.
- ~80% of haiku's lost truth folders never appear in a read note; sonnet reaches them by iterating source Greps (~10 on 6141).
- Context: no measurable gain on haiku (no-context .480 vs .501), doubles peak context (8-19k vs 22-37k). No-ctx ablation for
  sonnet not run.
- Bench cost: ~$0.55 per variant (3 cases x3); the sonnet relay main session dominates.

- Evidence-rule variant (129c0ce + cap 6 in 4fc7b3f; current file): "a note line or a Grep hit is evidence", Glob only
  self-composed paths, keep users/used-by, same-kind siblings rule, drop only clearly unrelated, recall framing.
  Funnel moved toward sonnet: named/listed .72 (was .47-.60, sonnet .77); named without source hit .36 (was .09, sonnet .94);
  non-truth kept .21; Glob 0 in 12 runs. F1 flat (mean .497 vs .501): what haiku keeps is now mostly fine, but on 6141 it
  reads the wrong notes (exact module P .06 R .04). Sibling rule followed in 1 of 2 runs that read the sibling note.
  Bench cost ~$0.80 (includes one cap-3 set on 6141: F1 .187).

## Next step

1. Done: deepest-note variant (932b65e4; Stage A/B open the deepest matching index line, parents only when no child matches,
   matching `## Submodules` child first). 6141 truth-bearing opens 14/18 (was 2/18), 14-16 truth folders listed per run;
   naming is the remaining gap there (26/46 listed named). Bench R .503 meets the child plan target.
2. Done: 10x3 confirmation (child plan p4 complete): F1 .572 > V2.1 .542 > bare .505 at 1/3 of the cost.
3. Backlog (user, 2026-10-20): 6141 naming / source-search usage hop; 438 precision; 6086 vs V2.1.
4. Then: source-search iteration like sonnet (next Grep from the previous hits); decide on the context (user, later).
5. p12: dead code (learn/seed/`navigator` CLI), `npm run verify`, version bump.

## Eval setup (navigator)

- Cases `fe-vs-<id>-navigator`, generated by `evals/scripts/navigator-cases.mjs` (gitignored); never run `evals:generate`
  or `cases.mjs` without `--case` unless `NAV_CASES`/`NAV_BENCH` are set (wiped twice; last 2026-10-21, regenerated, graders match).
  Env: `NAV_BENCH=/Users/KillBill/Documents/projects/inseer/inseer-frontend`, `NAV_CASES=` investigate sources (was
  /private/tmp/navcases2; copy in `eval-archive/navigator-case-sources/`). Run `node evals/scripts/navigator-cases.mjs`.
  `NAV_CONTEXT=<dir>` bakes another context into the case scaffolds (generation time, not run time).
- Run: `npm run evals -- --tag navigator --case fe-vs-<id>-navigator --runs N --max-cost-usd X`, one case per command, build first.
- Plugin arm: sonnet relay main session (`allowed_tools: [Agent]`) calls `ambicode:navigator` once. `run.mjs` strips
  `CLAUDE_CODE_SUBAGENT_MODEL*` from the child env (the user's shell forces sonnet otherwise). Scaffold copies context + config.yaml.
- Scoring: truth/answer collapsed to folders, ancestorShare 0.3; metrics in `results/<stamp>/aggregate-result.json`.
- Eval dir must stay under 20,000 entries: hardcoded in the claude CLI (`plugin eval` counts every entry under `evals/`).
  Workspace copies now go to `eval-archive/` (`AMBICODE_EVAL_ARCHIVE`); `find evals` ~2.3k.
- Bench leakage: inseer-frontend HEAD is after every truth commit (favours source search for all arms).

## Open

- Backlog (user, 2026-10-21, result accepted for now): (1) assess the navigator drop on the haiku-scout context (10x3 on
  archive haiku-scout-2026-10-21T03-48-22-578Z, built on c1e8b39b: R .568 P .578 F1 .528 vs .572; 3571 -.15, 5164 -.13,
  6406 -.12; compare haiku vs sonnet notes on the truth folders); (2) improve run time (init haiku runs ~100-130 s vs
  sonnet ~76 s; navigator duration not compared). Navigator cases still point at that archive (old trees in /tmp/navbak,
  or regenerate without NAV_CONTEXT).
- Backlog ticket (user, 2026-10-21): `summary-reports-validate` grader (evals/scripts/init-cases.mjs) — one regex branch
  is case-sensitive ("Config validates" missed in go-1 on f49f59f1); make it case-insensitive, check offline on the
  f49f59f1 5x3 traces. Also: draft-<id> misses `cd .ambicode/policies/drafts; cat > x.yaml` heredocs (user: leave for now).
- Path-prefix tolerance in the scorer (bare answers without `main/` score 0) — not decided.
- Todo test review-route.test.ts:343 (`--answer narrow` repeat-limit bug, task-lifecycle P3); unused exports in
  evals/scripts/*.mjs (low).

## Init + scout (plan d4d08796)

All phases p17-p24 done; plan not closed, 0.6.4 release not done (user stopped it, 2026-10-21).

What init does now:
- Scout `agents/scout.md`, haiku by default (`templates/config.yaml`): `context tree` all levels + doc files; one root per
  project in multi-project repos; `context write` builds index.md from disk, generates `## Depends on` (2 most-mentioned
  files per module).
- `skills/init/SKILL.md` (body 2000 B = `INIT_BODY_MAX_BYTES`): stack + root `*.md` before the scout; scout in background,
  free prompt that must ask to write the context; rules.md, pack-format.md and `packs --list` read in the launch turn;
  checks from the stack's config/rule files; config + drafts in one Write turn; one Bash `config packs; config validate;
  policy check --drafts`; drafts always, also with `--auto`; no shell aliases.
- `config validate` warns on empty/all-null checks, paths matching no file, same-root projects with identical checks;
  schema accepts a bare null check.

Evals: 5 cases `init-auto-{ts,python,go,jvm,monorepo}` (`evals/scripts/init-cases.mjs`, ~30-module fixtures in
`fixtures/init-stacks.mjs`, materialized in eval-archive/apps/; generate with `node evals/scripts/cases.mjs --case 'init-*'`)
and `init-scout-large` (inseer-frontend). Draft graders are tool-agnostic (file_exists + trace regex). Graders changed
several times: compare like for like only.

```
set (5 cases x3)                      score  $/run  main turns  scout $/run
sonnet scout, baseline v2 (old graders) .733  .262   ~7.5        ~.20
haiku scout p4                        .835   .127   ~4.4        .015
current f49f59f1                      .919   .187   8.0         .013-.021
  ts .906  py .906  go .923  jvm .931  mono .928
```
Cost: main sonnet session ~90% of a run; plugin share of the turn-1 prefix ~2%; floor ~$0.16-0.18 at this score (user:
further cheapening not worth it). Remaining gaps: conventions that must be inferred from code are never found by the scout
(same ids fail scout-convention-* and draft-*); mono summary-lists-checks 2/3; manual/web rules path not covered by evals.

## Task-lifecycle (older)

Done 2026-10-17 on `new_tuning` (run-3 audit fixes, verify green). Still open:
- plan-quality fails ~1 of 3 per plan case (judge reads the rubric literally); proposed rubric fix awaits the user.
- review-subtle unstable; rules-migrate rules-faithful 1 of 3; plan-reuse anchors-valid failed once.
- `agent_type` reaching the guard is not observed; if absent, the reviewer rule fails open.
- Linked requirements not passed to the review (~+28 KB): awaiting the user.
- plan-check is structural only; scout notes are thin (Depends on 0, Gotchas 0).
- VS Code started inside a Claude session inherits `CLAUDE_CODE_CHILD_SESSION`; start VS Code fresh.

# Migration from v0.4.0: order, keeps, deletions

Ordered so that each step is measurable on its own and the kill criteria in
[33-measurement.md](33-measurement.md) can stop the work early. Each step ships with its tests
(CLAUDE.md). Effort letters are guesses.

| # | Step | Effort | Measured by | Kill |
|---|---|---|---|---|
| 0 | Restore `evals/scripts/src/reuse-score.mjs` or drop the import; green `npm run verify`; ledger copy-out in the eval harness; replay re-key or live tier. | S | the suite loads; `score` reads ledgers | — |
| 1 | Guard parser (15 §2) with the M12 fixtures; `updatedInput --task`. | S | fixtures | — |
| 2 | Evidence v2: kinds, `note list`, `plan-draft`, `report`, `plan` refusal without acceptance. | S–M | unit | — |
| 3 | Route engine with the **investigate** route only; `prepare` aliased to `route start`; skill body cut to ≤ 2 KB; `search.index: none`. | M | 33 §1 (walk → decide): turns ≤ +2, cost ≤ 1.15x | turns not within +2 → cut payloads before continuing |
| 4 | Requirements v2: template, expansion, raw hashes, `acs`. | M | 33 §4 AC coverage ≥ naked | — |
| 5 | Search v2: `map` two passes, `refs/find/relates`, `IndexAdapter` with `none` + `codeindex`; `refs --exact` from the existing language-service code; offline recall script. | M | 33 §3 offline, then decide | no adapter gains ≥ 0.05 → ship `none` only and keep the interface |
| 6 | Plan route + `plan check` + scout (process worker). | M | 33 §4, three arms | scout no gain → keep it off |
| 7 | Task route: `check --only`, `format`, baseline scoping, caller inventory, Stop hook. | M–L | 33 §5 (new suite) | pass gain inside spread → cut task to baseline + guard + review offer |
| 8 | Review route: estimate, index dependents, verbatim coverage, selection metrics. | S–M | 33 §6 | — |
| 9 | init `--apply --set`, `doctor`, config v2 migration; rules drafts/quotes/apply/revert. | M | fixtures | — |
| 10 | Recorder hook; collector worker (after P21 probe); `review.onInvalid: drop` experiment. | S each | 33 §7; eval | recorder > 2 s → off |

## Deleted

`skills/shared/prepare-output.md`, `skills/shared/requirements-mcp.md` (content moves into
`requirements template` output and step files), `skills/review/references/impact.md` (the LSP
procedure; its retry rule moves into `refs --exact`'s one-process answer), `READING_ORDER`,
`requirements.lsp`, `evals/evals-triggers` as a gate (kept as negatives), the regex guard, the
`prepare` command after one deprecation release, model-invocable descriptions.

## Kept byte-for-byte

`src/review/{bundle,prompt,claude-reviewer,validate,report}.ts`, `src/snapshot/*`, `src/checks/*`
(extended, not changed), `src/providers/*`, `src/publication/*`, `src/page/*`, `policies/*.yaml`,
`prompts/reviewer-role.md`, `templates/*`.

## Compatibility

`.ambicode/config.yaml` v1 loads with a notice until `init --apply` migrates it. Task directories
from v0.4.0 (2 ledger kinds) fold as "no route": the new skills start a route beside the old notes
and `note list` shows both. Review artifacts unchanged.

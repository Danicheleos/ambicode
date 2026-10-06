# Required changes outside `evals/`

The evals move breaks these until they are updated. Ordered by impact.

## 1. Plugin manifest — done 2026-10-06

`.claude-plugin/plugin.json:19` — `"evals": "evals/cases/evals-triggers"` → `"evals/cases/common/triggers"`.

## 2. `package.json` scripts — done 2026-10-06

Shared calls are scripts of their own and the rest reuse them:

- `evals:bench` — the harness CLI; `select`, `generate`, `score`, `walk-report`, `full`, `baseline` call it.
- `evals:run` — `evals:bench run` with the curated reviewer replay (`reviewer-recordings/core.json`); `walk`,
  `walk:haiku`, `decide` call it.
- `evals:plugin-eval` — `claude plugin eval . --scaffold --no-publish` with the archived replay
  (`reviewer-recordings/archived.json`); `archived` and `triggers` call it.
- `archived` and `triggers` reserve a dated iteration with `harness/iteration-dir.mjs <type> <label>` and write
  `--json`/`--output-dir` into it (no more `outputs/triggers/latest.json`). They do not append to
  `iterations.md`: that row is written by the harness sweep only.

`evals:full` / `evals:generate` still need `<side>/assets` (see 03-data-gaps.md).

## 3. Root `.gitignore`

Stale lines (the new rules live in `evals/cases/.gitignore`):

- `/evals/cases/evals-core/*/*`
- `/evals/cases/evals-task/*/*`
- `/evals/cases/python`

Keep `/evals/outputs`, `/evals/benchmarks`, `/evals/reports`, `/evals/**/results/`.

## 4. src tests

- `src/skills/investigate/investigate.package.test.ts` — triggers path updated (done 2026-10-06).
- `src/modules/review/reviewer/replay-reviewer.test.ts:236` — uses `'fixtures/reviewer-recordings.json'` only as
  a relative-path example for the "must be an absolute path" refusal; still valid, but rename to the new path to
  avoid a dangling reference.

## 5. `fixtures/` (root)

Stays at the root: `definitions.mjs`, `materialize.mjs`, `materialize.test.mjs`, `jest-manifest/` and
`reviewer-envelopes/` are shared by src tests (`proposal`, `review-route.integration`, `task-integration`,
`locate`, `investigate.route`, `plan-integration`, `rules-route`, `snapshot`, `reviewer-boundary`,
`replay-reviewer`), `package.json` (`fixtures`, `test:unit`), `CLAUDE.md:116` and `docs/compatibility.md:105`.
Moving them into `evals/` would make src tests depend on the evals tree; not recommended.

Moved: `fixtures/reviewer-recordings.json` → `evals/cases/common/reviewer-recordings/archived.json` (only the
archived/triggers suites and `evals-preflight` use it).

## 6. Docs

- `docs/compatibility.md`, `docs/installation.md`, `docs/release-checklist.md`: check for `evals-archived`,
  `evals-triggers`, `fixtures/reviewer-recordings.json`, `evals/outputs/triggers/latest.json`.
- `evals/cases/common/archived/typescript/README.md` was updated in place (it is under `evals/`).

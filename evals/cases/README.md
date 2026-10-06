# Eval cases

| Folder | Suite | Runs with |
| --- | --- | --- |
| `common/core/` | Curated benchmark cases (localize + review), selected from every project | `npm run evals`, `evals-bench.mjs run` |
| `common/task/` | Task route on real defect tickets | `evals-bench.mjs run --set task` |
| `common/triggers/` | Synthetic trigger-boundary cases (tracked) | `npm run evals:triggers` |
| `common/archived/` | Earlier synthetic suites (tracked) | `npm run evals:archived` |
| `common/reviewer-recordings/` | Reviewer answers replayed by `EVAL_AMBICODE_REVIEWER_REPLAY`: `archived.json` (tracked), `core.json` (NDA). Never inside an `--eval-dir`: the sandbox denies reads there | — |
| `<project>/impact/`, `<project>/reuse/` | Per-project impact and reuse pools (`reuse/exports.json` lists the exports) | `lsp-arms.mjs --impact` / `--reuse` |
| `python/` | The python project's config and notes for its case candidates | — |
| `scripts/` | Harness, generators, scoring; `scripts/local/` holds untracked one-off analysis tools | see `scripts/README.md` |

Never pass `--eval-dir evals/cases` or `evals/`: discovery is recursive and would sweep every suite at once.

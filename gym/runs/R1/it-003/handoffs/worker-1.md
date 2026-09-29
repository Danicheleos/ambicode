# worker handoff — it-003 — 19ee14c
Transcribed by the lead from the worker's final message; the worker may not write under `gym/` (04 §3). The worker is `claude-sonnet-5-5` (Agent model `sonnet`). The first commit was `cf179ea`; after the lead's review it was amended to `19ee14c`. A help-text delta follows in `worker-1-delta.md`.

## Ran
- `npm run verify` (worktree, `19ee14c`) → exit 1, 64 s; `../ambicode-it-003/.worker-verify.log`; tests 773 / pass 771 / fail 1 / skipped 1. The one failure is `bundle-split.test.mjs` "still ships Fastify, in the chunk view imports". The worker attributes it to the symlinked `node_modules`: esbuild writes `// ../../../Users/.../node_modules/fastify/…`, but the test's regex wants `// node_modules/fastify/`.
- `npm run verify` on a clean copy of `19ee14c` (`git archive` → `/tmp/it003-verify`, `git init`, real `node_modules`) → exit 0, 63 s; `../ambicode-it-003/.worker-verify-clean-clone.log`; tests 773 / pass 772 / fail 0 / skipped 1; "Validation passed".
- The same `bundle-split` test on unmodified `01f626f` with symlinked `node_modules` → fails identically.
- Reproduction run before implementing (7 test files) → 17 failed / 109 passed of 126 (`/tmp/it003-before.log`); after: 0 failed / 126 passed.
- `npm run typecheck` → clean after each structural edit.

## Numbers
| field | value | from |
|---|---|---|
| tests (clean clone) | 773 / 772 pass / 0 fail / 1 skipped | `.worker-verify-clean-clone.log` |
| tests added | 21 (773 − 752) | same |
| `skills/shared/requirements-mcp.md` bytes | 5,598 (ceiling 5,600 at `src/cli/context-cost.test.ts:37`, not raised; was 5,438) | `wc -c` |
| new tests failing before the change | 17 | `/tmp/it003-before.log` |

## Files touched (worker only)
docs/review.md (+21/−0); skills/shared/requirements-mcp.md (+7/−3); src/cli/commands/init.ts (+2/−1); src/cli/commands/prepare.ts (+15/−2); src/cli/init-mcp-server.test.ts (new, +78); src/cli/prepare-size.test.ts (new, +141); src/config/config.test.ts (+77/−1); src/config/init.ts (+62/−7); src/contracts/requirements.ts (+20/−2); src/page/render.test.ts (+29); src/page/view-model.ts (+3/−4); src/requirements/normalize.ts (+9/−2); src/requirements/receipt.ts (new, +16); src/requirements/requirements.test.ts (+89/−3); src/review/bundle.ts (+1); src/review/prompt.ts (+2/−1); src/review/report.test.ts (+34); src/review/report.ts (+2/−1); src/review/review.test.ts (+24); src/snapshot/preflight.ts (new, +59); src/snapshot/snapshot.ts (+23/−8); templates/review.eta (+1/−1)

## Tests added (the before-failure line, as reported)
- init-mcp-server.test.ts ×4 (option declared; binds on first and later run; `--dry-run` writes nothing; refuses a different bound server) — `Unknown option for "init": Unknown option '--mcp-server'.`
- config.test.ts ×3 (fresh config writes the binding; existing config keeps comments, repeat = no change; refuses overwrite and empty name) — `actual: null, expected: 'atlassian'` / `Missing expected rejection.`
- requirements.test.ts: stamps `receivedAt` from the injected clock — `receivedAt` undefined; omitted `retrievedAt` parses as null — `requirements-invalid`; result with `receivedAt` and null `retrievedAt` parses — ZodError `expected string`; refuses an envelope that sets `receivedAt` — regression guard, passed before; a pre-change result re-emits unchanged — regression guard.
- report.test.ts: prints the receipt time, and the retrieval time only when supplied — old wording printed; pre-change result — regression guard.
- render.test.ts: same for the page — no `received … by AMBICODE` match; pre-change result — regression guard.
- review.test.ts: the review records `receivedAt`, and no invented retrieval time — `requirements-invalid` at `bundle.ts:136`.
- prepare-size.test.ts ×6: positional path over the ceiling named with bytes and the `--exclude` line — no notice; working-tree paths in one notice, skipping small, unchanged, deleted and at-ceiling files — `0 !== 1`; `review.excludePaths` not flagged — notice undefined; no notice when nothing is over, nothing written — `0 !== 1`; rename read by new name — added after the implementation (no before-failure); `statusPaths` parsing — added after (function did not exist).

## Judgment calls (worker's)
- Rework after the lead's review: restored the two skill instructions verbatim and fit the budget by cutting the worker's own additions. Moved the snapshot doc comment back above `oversizedRefusal`.
- `src/review/bundle.ts` +1 line: `normalizeRequirements` takes a required `clock`. Required, so no caller can forget it.
- Schemas: the envelope is `RequirementEnvelopeSource` (strict, no `receivedAt`, `retrievedAt` nullable, default null). The stored `RequirementSource` has `receivedAt` optional, so old results re-emit byte-identical (precedent `source: z.literal('replay').optional()`).
- No `REVIEW_SCHEMA_VERSION` bump. The repo has no rule for review results. Old results still parse under `z.literal(1)`, and a bump would make every stored `result.json` fail `readResult`. Old plugin code reading a new result would reject it.
- `receivedAt` is read once from `runtime.clock.now()` in `normalizeRequirements`. Both `prepare` and `review` stamp it.
- One wording helper, `src/requirements/receipt.ts`. `null` is never printed.
- Size pre-flight: `lstat` over the positional paths ∪ `git status` paths. It skips what `pathExclusionReason` excludes, symlinks, directories and missing paths, and a positional directory is not expanded. Wording is shared with the refusal (`oversizedFileLines`, `excludeLines`). Adds one `git status` per `prepare`.
- `init --mcp-server` on an existing config also adds newly detected projects, like any init run.

## Could not do
- CLI help line (`src/cli/main.ts` was outside the globs). The lead then allowed it in the brief addendum; see `worker-1-delta.md`.
- `skills/init/SKILL.md` was not edited: it is outside the globs and a T1 surface.
- `npm run verify` exit 0 inside the worktree (symlink artifact; shown on the clean clone instead).

## Claims without evidence
- (none)

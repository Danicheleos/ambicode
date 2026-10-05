# Step 05 amendment — review round 2 leftovers (2026-10-06)

The user decided to resolve notes N7 and N8 of the round-2 review
(`plan/migration-v6-reports/step-05/review.md`). The rules below replace the parts of
`amend-05-review-r1.md` they name; everything else there still applies.

## N7 — drift is measured against the contents the build indexed

- P3 "drift" replaced. After a successful build the marker also records
  `dirty: {<repository-relative path>: <content hash> | null}`. These are the project files that
  differed from `head` at build time (the `git diff <head>` paths, both sides of a rename, plus
  untracked, not-ignored files). `null` means the file was deleted.
- `drift` counts the files in (the files that differ from `head` now) ∪ (the keys of `dirty`)
  whose current contents differ from what was indexed:
  - a changed file that is not in `dirty` was indexed at `head`, so it counts;
  - a `dirty` file that is back at `head` now counts;
  - a `dirty` file that still differs counts only when its hash changed.
- A marker without `dirty` (written before this rule) reads as `dirty: {}`.
- If more than 1,000 files differ at build time, `dirty` is `null`: the indexed contents are
  unknown, so `drift` is null and the state is `stale`.
- The threshold (`search.indexDriftFiles`, default 20) and everything else in P3 are unchanged.

## N8 — an impact row needs a numeric depth ≤ 1

- P2 `relates`: a `files[]` row without a numeric `depth` is not an importer.

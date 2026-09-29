# worker handoff delta — it-003 — c4ec3d5
Transcribed by the lead. Asked for by the brief addendum (the `USAGE` help line).
## Ran
- `npm run typecheck` → clean
- unit tests (worktree, symlinked node_modules) → tests 774 / pass 772 / fail 1 / skipped 1; the one failure is the known `bundle-split.test.mjs:61` symlink artifact; `/tmp/it003-unit.log`
- clean-clone `npm run verify` not rerun on c4ec3d5 (worker says so); the lead's gate in the campaign tree is the measurement
## Files touched
- src/cli/main.ts (+3/−0): `--mcp-server <name>` line under `init`
- src/cli/cli.test.ts (+7/−0)
## Tests added
- src/cli/cli.test.ts: "the usage text names the value options init declares › lists --mcp-server under init" — before: `AssertionError: --mcp-server is not in the init help`
## Claims without evidence
- (none)

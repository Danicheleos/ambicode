# P1.7-corrected + P2.1 candidate acceptance record — 2026-09-21

**Superseded by `docs/acceptance/2026-09-21-p2.2-candidate/`**, which corrects
this record's non-durable local installation, product-repository-relative
shared-resource reference, review-specific requirement-mode literal, and
prompt-metadata-only `ambicode prepare` output (P2.1 corrections A–E) and
adds the P2.2 result. This record is kept for its still-accurate
M01–M04/M12/M14 evidence and is otherwise historical; do not read its
installation, shared-resource, or `ambicode prepare` sections as current.

This is a locally prepared and locally verified candidate, not a released
version. Sections below use exactly `passed`, `failed`, `pending`, or `not
applicable`. "Unavailable" is never written as "passed." This record
supersedes `docs/acceptance/2026-09-21-p1.7-candidate/` for everything it
re-verified; it does not restate rows that record already covers and this
session did not touch (M05–M11 GitLab/browser prerequisites, the value gate).

## What this session did

1. **P1.7 correction A (publication lease).** `src/publication/lease.ts` no
   longer reclaims a stale lease by age. A held or unreadable lease always
   refuses, with a diagnostic naming manual recovery instead of an automatic
   threshold. Every acquired lease carries an unpredictable per-acquisition
   token (`IdSource.capability()`, 256 bits); `release()` removes the lease
   file only when the token on disk still matches the one this acquisition
   minted, so one process can never remove a lease created by another —
   including a lease a human replaced after confirming the original was
   abandoned. No PID-liveness check was added or relied on. No locking
   dependency was added; the existing atomic `createExclusive` primitive was
   sufficient once the unsafe reclaim was removed.
2. **P1.7 correction B (candidate packaging and evidence).** The packaging
   allowlist (`package-candidate.mjs`) no longer copies `docs/` recursively;
   it lists exactly the four shipped documents
   (`installation.md`, `compatibility.md`, `review.md`, `rule-migration.md`),
   which is why `docs/acceptance/**` (this file included) and
   `docs/release-checklist.md` no longer enter the candidate. Every shipped
   file's mtime is normalized to a fixed timestamp before zipping, the zip is
   built from an explicit sorted file list (not `-r`'s own traversal order)
   with `-D`/`-X` and a fixed `TZ=UTC`, and `package:reproducible` now
   compares the two runs' zip SHA-256 values directly, not only the file
   inventory. The candidate is generated fresh before this record was written
   (see "Candidate identity" below), and its inventory/digest are read out of
   the generated files, not retyped by hand.
3. **P1.7 correction C (local-only distribution).** `marketplace/` is
   removed — it existed only to hold placeholder hosted-marketplace values.
   `install-local.mjs` is the one concrete script that packages a candidate
   into a chosen `CLAUDE_CONFIG_DIR` via a generated temporary local
   marketplace, and reverses with `--uninstall`. `docs/installation.md` and
   `docs/release-checklist.md` were rewritten to drop hosted-marketplace
   instructions, placeholder URLs, and the release-owner hosting checklist,
   while keeping disable/enable/uninstall/rollback and storage-ownership
   guidance (all still applicable to local installation). Plan documents
   03, 06, 08 and 10 were updated to record the local-only decision.
4. **P2.1 (Investigations).** Added `/ambicode:investigate`
   (`skills/investigate/SKILL.md`), the shared MCP-acquisition procedure
   extracted out of `skills/review/SKILL.md` into
   `skills/shared/requirements-mcp.md` (both skills now reference the one
   file), the `ambicode prepare` CLI command
   (`src/cli/commands/prepare.ts`, contract in `src/contracts/prepare.ts`),
   and the investigation-note path boundary (`src/notes/path.ts`). See
   "P2.1 behavior and files added" in the accompanying final report for the
   full list.

## Candidate identity

- **Candidate version**: `0.1.0` (from `package.json` and `.claude-plugin/plugin.json`, which packaging verifies agree).
- **Source commit currently tested**: `9aeaf15` ("P1.7"), **plus the uncommitted corrections and P2.1 work described above and in the accompanying final report**. Nothing from this session has been committed. The final report lists every staged/unstaged/untracked path.
- **Artifact filename**: `dist/ambicode-0.1.0.zip` (an optional, byte-reproducible convenience artifact — not required for local installation, which uses the candidate directory directly; see doc 03 P1.7 correction B/C).
- **Artifact digest (SHA-256)**: `f2dc51b40b9ffa01c90fd380002ee53d37c0c53a50e54e0f62873740dc98f512` (also in `dist/ambicode-0.1.0.zip.sha256`).
- **Artifact inventory**: `dist/ambicode-0.1.0.inventory.json`, generated fresh for this record: **29 files** (28 in the prior P1.7 record, minus `docs/release-checklist.md` and `docs/acceptance/**` which no longer ship, plus `skills/investigate/SKILL.md` and `skills/shared/requirements-mcp.md`).

| Path | Bytes | Mode |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | 526 | 644 |
| `bin/ambicode` | 123 | **755** |
| `docs/compatibility.md` | 30206 | 644 |
| `docs/installation.md` | 10855 | 644 |
| `docs/review.md` | 19547 | 644 |
| `docs/rule-migration.md` | 6552 | 644 |
| `policies/*.yaml` (13 files) | 952–6774 each | 644 |
| `policies/prompts/review-smells.md` | 2589 | 644 |
| `prompts/reviewer-role.md` | 2902 | 644 |
| `prompts/shared-operating-contract.md` | 1826 | 644 |
| `scripts/ambicode.mjs` | 3252743 | 644 |
| `skills/init/SKILL.md` | 3360 | 644 |
| `skills/investigate/SKILL.md` | 6736 | 644 |
| `skills/review/SKILL.md` | 11089 | 644 |
| `skills/shared/requirements-mcp.md` | 4356 | 644 |
| `templates/error.eta`, `templates/page.css`, `templates/review.eta` | 608 / 2861 / 10405 | 644 |

No `node_modules`, no TypeScript source, no `package.json`/lockfile, no
`docs/acceptance/**`, no `docs/release-checklist.md`, and no absolute path
from this workstation appear in the candidate; `npm run package:candidate`
fails the build if any of those checks does not hold, and it passed.
`npm run package:reproducible` packaged the candidate twice from a fresh
`npm run build` each time and confirmed byte-identical paths, sizes and
SHA-256 digests **and identical zip SHA-256** across both runs
(`f2dc51b40b9ffa01c90fd380002ee53d37c0c53a50e54e0f62873740dc98f512` both
times).

## Environment

| Component | Version | How established |
| --- | --- | --- |
| OS / architecture | Darwin 27.0.0, arm64 (macOS) | `uname -a`, observed |
| Claude Code | 2.1.272 | `claude --version`, observed |
| Node.js | 24.15.0 | `node --version`, observed |
| npm | 11.12.1 | `npm --version`, observed |
| Git | 2.55.0 | `git --version`, observed |
| `glab` | not installed | observed; GitLab adapter covered by fake-`ProcessRunner` unit tests only |
| Docker CLI / daemon | CLI present; daemon **not running** | `docker info` failed |
| `zip` (Info-ZIP) | OS-shipped | observed, used by `package-candidate.mjs` |
| Model identifier | not exposed / not used for a paid call | No authorized paid model call was made this session (E02, model/MCP-dependent I01–I08 pending) |

## Automated verification results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passed |
| Unit tests | `npm run test:unit` | passed — 360 tests, 41 suites, 0 failures |
| Build | `npm run build` | passed |
| Strict plugin validation (source) | `claude plugin validate . --strict` | passed |
| Package candidate | `npm run package:candidate` | passed (29 files; launcher mode 755; no forbidden paths; no workstation paths) |
| Reproducible package | `npm run package:reproducible` | passed (two independent builds; identical file set, digests, **and zip SHA-256**) |
| Strict plugin validation (packaged candidate) | `claude plugin validate dist/ambicode-0.1.0 --strict` | passed |
| Packaged-helper smoke, outside this checkout | `node smoke-candidate.mjs dist/ambicode-0.1.0` (run from `/tmp`) | passed — `version` outside any repo, `init`+`policy` resolve built-in policies, `view` serves its own templates |
| Local install via `install-local.mjs` (isolated `CLAUDE_CONFIG_DIR`) | see "Packaged installation evidence" below | passed |
| `git diff --check` | | passed, no whitespace errors |
| `git diff --cached --check` | | passed (nothing staged) |
| `npm audit` | | 0 vulnerabilities |
| E01 (eval load-only) | `claude plugin eval . --scaffold --allow-tools Bash --max-cost-usd 0 --trust-plugin` | passed — reported `Ablation: 2 arms × 12 cases (72 runs)` before the `$0` ceiling stopped it; every expected review case resolved. No investigate eval fixtures exist yet (P2.1's fixed cases I01–I08 are defined in doc 07 but not built as `claude plugin eval` fixtures this session — see "Pending" below). |

## Packaged installation evidence

All of the following ran with `CLAUDE_CONFIG_DIR=/tmp/ambicode-isolated-cfg`,
a directory created fresh for this record and never pointed at the real
`~/.claude`.

1. `node install-local.mjs dist/ambicode-0.1.0 /tmp/ambicode-isolated-cfg` →
   generated a temporary local marketplace, ran
   `claude plugin marketplace add <generated-dir>` then
   `claude plugin install ambicode@ambicode-team -s user -y`, both succeeded.
2. `claude plugin list` (with that `CLAUDE_CONFIG_DIR`) → showed
   `ambicode@ambicode-team`, version `0.1.0`, status enabled.
3. `claude plugin details ambicode@ambicode-team` →
   **`Skills (3)  init, investigate, review`** — confirms the three-skill
   namespace this candidate ships, without a model call.
4. `grep -rl "$(pwd)"` (this repository's own absolute path) across the
   isolated `CLAUDE_CONFIG_DIR` → zero matches. A same-scope `$HOME` search
   found no match outside the config directory itself.
5. `claude plugin validate dist/ambicode-0.1.0 --strict` (the exact directory
   the generated marketplace pointed at) → passed.
6. `node install-local.mjs dist/ambicode-0.1.0 /tmp/ambicode-isolated-cfg --uninstall`
   → ran `claude plugin uninstall ambicode@ambicode-team -s user -y` then
   `claude plugin marketplace remove ambicode-team`, both succeeded;
   `claude plugin list` afterward reported no installed plugins.

This demonstrates local installation from the packaged candidate, outside
the source checkout, in an isolated `CLAUDE_CONFIG_DIR`, exposing all three
skills — the P2.1 packaging/install test-matrix requirement.

## Manual/fixed-case status (doc 07)

Unit tests do not satisfy the M-table or the new I-table (doc 07 is explicit
about this). Nothing below is claimed passed on the strength of a unit test
alone.

| ID | Status | Note |
| --- | --- | --- |
| M01–M04, M12 (packaged-install portion), M14 | **passed**, carried over unchanged from the prior P1.7 record | This session did not re-run the fixture repositories for these; the corrections in this session (lease, packaging, distribution) do not touch the code paths those rows exercise. Re-run before a real release rather than relying solely on the carry-over. |
| M05–M11, M13 | **pending**, unchanged | Same external prerequisites as before: GitLab sandbox, browser, Docker daemon, Jira/Confluence MCP. See `docs/release-checklist.md`. |
| I01–I08 (P2.1 fixed investigation cases, doc 07) | **pending** | I01 (a direct code question) and I06 (an inconclusive question) need only authorized model access with the packaged skill loaded — no MCP/GitLab. I02–I05, I07 additionally need a connected, authorized Jira/Confluence MCP server. I08 needs a project with a configured, `propose`-or-better diagnostic command. None were executed with real access in this environment; none is reported as passed. |
| E02 | **pending**, unchanged | Needs authorized, budgeted model access. |

## Dependency and license inventory

No new runtime dependency was added this session. `package.json`'s
`dependencies` list is unchanged from the prior record; `npm audit` reports
0 vulnerabilities as of this record.

## Remaining limitations and prerequisites

Everything in `docs/compatibility.md`'s "Not available in this environment"
table still applies: no `glab`, no GitLab sandbox, no running container
runtime, no Jira/Confluence MCP, no authorized model access used this
session, no real browser exercise. Additionally:

- I01–I08 (P2.1's own fixed investigation cases) have not been executed with
  real access; see the table above for exactly which ones need what.
- No second developer has installed this candidate; see
  `docs/release-checklist.md`.
- The value gate remains pending, unchanged from the prior record — it needs
  a pilot owner and two real repositories, neither of which this environment
  has. This does not block P2.1's implementation, which document 04 and this
  session's task explicitly authorized to start regardless.

## Phase decision

**Phase 1 is still not complete** (unchanged conclusion from the prior
record: M05–M11, M13 pending, value gate pending). **P2.1 is implemented**
per its own explicit authorization to start despite the Phase 1 value gate
being pending; its manual/model-dependent cases (I01–I08) remain pending in
the same honest sense as Phase 1's own pending rows — implemented and unit
tested, not yet evaluated against real external services or authorized
model access.

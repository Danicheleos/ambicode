# P2.1-corrected + P2.2 candidate acceptance record — 2026-09-21

This is a locally prepared and locally verified candidate, not a released
version. Sections below use exactly `passed`, `failed`, `pending`, or `not
applicable`. "Unavailable" is never written as "passed." This record
supersedes `docs/acceptance/2026-09-21-p2.1-candidate/` for everything it
re-verified (the P2.1 corrections A–E below, and the P2.2 addition) without
restating rows that record already covers and this session did not touch
(M05–M11 GitLab/browser prerequisites, the value gate).

## What this session did

1. **P2.1 correction A (durable local installation).** `install-local.mjs`
   previously generated a throwaway marketplace under `/tmp` and told the
   operator it could be deleted once install finished — but Claude Code
   loads a local-directory marketplace's `source` path *in place*, not by
   copying it into its own cache at install time, so that was not a durable
   installation. `install-local.mjs` now copies the candidate into one
   directory it owns beneath the chosen `CLAUDE_CONFIG_DIR`
   (`<config-dir>/ambicode-install/marketplace/`) and points the marketplace
   at that durable copy. `install`/`uninstall` are now separate subcommands;
   `install` replaces the durable copy in place (falling back from `plugin
   marketplace add`/`plugin install` to `plugin marketplace update`/`plugin
   update` on a repeat run against the same config dir, so upgrade is
   idempotent) and `uninstall` reads the plugin's identity back out of the
   durable marketplace manifest, so it needs no candidate directory and
   removes only the `<config-dir>/ambicode-install/` directory it owns.
   `--scope project`/`--scope local` now require an explicit `--project-dir
   <dir>` and run the `claude` CLI with that directory as `cwd`, rather than
   writing project settings relative to an incidental current working
   directory. A new isolated smoke test (`install-local.smoke.mjs`, `npm run
   smoke:install-local`) installs into a fresh `CLAUDE_CONFIG_DIR`, deletes
   the candidate directory used for install entirely, then proves — from
   fresh `claude` processes, none of them the one that ran the install —
   that the plugin and all four skills are still reported, before
   uninstalling without that deleted directory and confirming both the
   plugin and the durable install directory are gone. See "Packaged
   installation evidence" below for this session's actual run.
2. **P2.1 correction B (shared plugin-resource resolution).** `review` and
   `investigate` previously pointed at `skills/shared/requirements-mcp.md` —
   a path relative to the product repository, which an installed plugin
   loaded from Claude Code's own cache does not have. Both (and the new
   `plan`) now point at
   `${CLAUDE_PLUGIN_ROOT}/skills/shared/requirements-mcp.md`.
   `package-candidate.mjs` gained a build-time
   `checkSharedResourceReferences` assertion, run as part of `npm run
   package:candidate`, against the **assembled candidate**: every skill that
   mentions the shared file does so through the plugin-root substitution,
   the shared file exists in the candidate, no bare repository-relative
   reference survives, and `review`/`investigate`/`plan` all reference it.
   `src/util/skill-content.test.ts` has an equivalent source-level check.
3. **P2.1 correction C (activity-neutral requirement/source-presence
   schema).** `ambicode prepare`'s `requirementMode` used review's own
   `quality-review` literal for every activity. A canonical
   `RequirementMode` (`source-free` / `requirement-based`,
   `src/contracts/requirements.ts`) is now used by `normalizeRequirements`
   and `PrepareOutput`; `ReviewResult` keeps its own historical
   `ReviewRequirementMode` (`quality-review` / `requirement-based`), and the
   one place `source-free` maps to `quality-review` is where a
   `ReviewResult` is actually built (`src/review/bundle.ts`). `RequirementSource`,
   `RequirementConflict`, and `ProvenanceEntry` moved to the same new shared
   module; `contracts/review.ts` re-exports them rather than declaring a
   second copy. Tests that asserted the old `quality-review` value out of
   `ambicode prepare`/`normalizeRequirements` were updated to assert
   `source-free`; `ReviewResult`'s own `quality-review` assertions are
   unchanged.
4. **P2.1 correction D (applicable policy delivered to outer skills).**
   `ambicode prepare` returned rule content but only prompt *metadata*
   (`declaredPath`/`contentHash`, no text) — unusable to a skill running
   from an installed plugin, which has no reason to know a checkout-specific
   absolute path. `PreparePrompt` now carries `authority` and the prompt's
   full `content`, bounded by the same configured limit a snapshot file uses
   (`MAX_SNAPSHOT_FILE_BYTES`) and verified to hash to the already-resolved
   `contentHash` before it is included (`resolvePreparePrompt` in
   `src/cli/commands/prepare.ts`); an oversized or changed-on-disk prompt is
   reported as a diagnostic and left out, never silently truncated.
   `PREPARE_PROMPT_STAGES`/`applicablePrepareStages`
   (`src/policy/resolve.ts`) define, once, which prompt stages `prepare`
   surfaces per activity — `before-work` and `before-report` for both
   `investigate` and `plan` — so reviewer-only `before-checks`/`before-review`
   content cannot leak into planning even from a pack that applies to `plan`.
   `PrepareOutput.provenance` now includes config and pack/prompt
   provenance (via a new shared `src/policy/provenance.ts`, extracted out of
   `src/review/bundle.ts` so `review`/`bundle` and `prepare` share the one
   implementation), not only requirement provenance. `investigate`'s
   `SKILL.md` was updated to explicitly apply `policy.rules` and
   `policy.prompts` rather than only reading notices/diagnostics.
5. **P2.1 correction E (read-only investigation/plan claim made true).**
   `skills/shared/requirements-mcp.md` now instructs writing the MCP
   evidence file to a restrictive temporary location **outside** the product
   repository (e.g. `mktemp`), not `.ambicode/reviews/evidence.json` or
   `.ambicode/notes/investigations/evidence.json` as before, and deleting it
   once the command that reads it has run — a review's saved result already
   carries the normalized requirement content forward, so nothing is lost.
   `docs/review.md`'s worked example was corrected to match.
   `src/notes/path.ts` (and its test) — production-dead: only its own test
   called it, and no skill's Write tool can call a TypeScript helper — was
   removed rather than kept or wrapped in new machinery solely to justify
   its existence; the note-path boundary (`.ambicode/notes/investigations/`,
   `.ambicode/notes/plans/`) is documented in each skill's `SKILL.md`
   instead.
6. **P2.2 (Plans).** Added `/ambicode:plan` (`skills/plan/SKILL.md`,
   `argument-hint` frontmatter, `$ARGUMENTS` referenced explicitly): it
   retrieves sources through the same shared MCP procedure, runs `ambicode
   prepare --activity plan` (no new CLI command, config, requirement, or
   policy parser), investigates only enough to plan using existing
   navigation, asks one focused question per genuinely material decision,
   stays `draft` until every material choice is resolved and the human
   explicitly accepts the roadmap, never edits product code, never invokes
   the independent reviewer, and copies an accepted plan to
   `.ambicode/notes/plans/<slug>.md` only when writing is permitted and the
   user asks (or accepts a workflow that already includes saving). No new
   dependency, provider, MCP client, filesystem port, or CLI parser was
   added; `Activity` already included `plan` from P1's schema.

## Candidate identity

- **Candidate version**: `0.3.0` (from `package.json` and `.claude-plugin/plugin.json`, which packaging verifies agree).
- **Source commit currently tested**: `3ebf4ed` ("P2.1"), **plus the uncommitted corrections and P2.2 work described above and in the accompanying final report**. Nothing from this session has been committed. The final report lists every staged/unstaged/untracked path.
- **Artifact filename**: `dist/ambicode-0.3.0.zip` (an optional, byte-reproducible convenience artifact — not required for local installation, which uses the candidate directory directly; see doc 03 P1.7 correction B/C).
- **Artifact digest (SHA-256)**: `430b2905e2197aebb304a113837339233dbbdff13adc67d8bf46bc463cfe6a3c` (also in `dist/ambicode-0.3.0.zip.sha256`).
- **Artifact inventory**: `dist/ambicode-0.3.0.inventory.json`, generated fresh for this record: **30 files** (29 in the prior P2.1 record, plus `skills/plan/SKILL.md`; every other shipped document's byte count also changed where this session's corrections edited it — see below).

| Path | Bytes | Mode |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | 526 | 644 |
| `bin/ambicode` | 123 | **755** |
| `docs/compatibility.md` | 30447 | 644 |
| `docs/installation.md` | 15093 | 644 |
| `docs/review.md` | 20204 | 644 |
| `docs/rule-migration.md` | 6552 | 644 |
| `policies/*.yaml` (13 files) | 952–6774 each | 644 |
| `policies/prompts/review-smells.md` | 2589 | 644 |
| `prompts/reviewer-role.md` | 2902 | 644 |
| `prompts/shared-operating-contract.md` | 1826 | 644 |
| `scripts/ambicode.mjs` | 3256522 | 644 |
| `skills/init/SKILL.md` | 3360 | 644 |
| `skills/investigate/SKILL.md` | 7788 | 644 |
| `skills/plan/SKILL.md` | 9989 | 644 |
| `skills/review/SKILL.md` | 11307 | 644 |
| `skills/shared/requirements-mcp.md` | 5637 | 644 |
| `templates/error.eta`, `templates/page.css`, `templates/review.eta` | 608 / 2861 / 10405 | 644 |

No `node_modules`, no TypeScript source, no `package.json`/lockfile, no
`docs/acceptance/**`, no `docs/release-checklist.md`, and no absolute path
from this workstation appear in the candidate; `npm run package:candidate`
fails the build if any of those checks does not hold (including the new
`checkSharedResourceReferences` assertion), and it passed. `npm run
package:reproducible` packaged the candidate twice from a fresh `npm run
build` each time and confirmed byte-identical paths, sizes and SHA-256
digests **and identical zip SHA-256** across both runs
(`430b2905e2197aebb304a113837339233dbbdff13adc67d8bf46bc463cfe6a3c` both
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
| Docker CLI / daemon | daemon not running | `docker info` failed |
| `zip` (Info-ZIP) | OS-shipped (3.0) | observed, used by `package-candidate.mjs` |
| Model identifier | not exposed / not used for a paid call | No authorized paid model call was made this session (E02, model/MCP-dependent PL01–PL10/I01–I08 pending) |

## Automated verification results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passed |
| Unit tests | `npm run test:unit` | passed — 372 tests, 41 suites, 0 failures |
| Build | `npm run build` | passed |
| Strict plugin validation (source) | `claude plugin validate . --strict` | passed |
| `npm run verify` (typecheck + test:unit + build + validate:plugin, in one run) | `npm run verify` | passed |
| Package candidate | `npm run package:candidate` | passed (30 files; launcher mode 755; no forbidden paths; no workstation paths; shared-resource references correct) |
| Reproducible package | `npm run package:reproducible` | passed (two independent builds; identical file set, digests, **and zip SHA-256**) |
| Strict plugin validation (packaged candidate) | `claude plugin validate dist/ambicode-0.3.0 --strict` | passed |
| Isolated durable local install/inspect/reload/uninstall smoke | `npm run smoke:install-local` | passed — see "Packaged installation evidence" below |
| `git diff --check` | | passed, no whitespace errors |
| `git diff --cached --check` | | passed |
| `npm audit` | | 0 vulnerabilities |
| E01 (eval load-only) | `claude plugin eval . --scaffold --allow-tools Bash --max-cost-usd 0 --trust-plugin` | passed — reported `Ablation: 2 arms × 12 cases (72 runs)` before the `$0` ceiling stopped it; every expected review case resolved. No `investigate`/`plan` eval fixtures exist yet (PL01–PL10/I01–I08 are case *definitions* in doc 07, not built as `claude plugin eval` fixtures this session). |

## Packaged installation evidence

All of the following ran with a fresh, isolated `CLAUDE_CONFIG_DIR` created
by `install-local.smoke.mjs` for this record, never pointed at the real
`~/.claude`, via `npm run smoke:install-local`:

1. `node install-local.mjs install dist/ambicode-0.3.0 <config-dir>` →
   copied the candidate into the durable `<config-dir>/ambicode-install/marketplace/`,
   ran `claude plugin marketplace add <that-directory>` then `claude plugin
   install ambicode@ambicode-team -s user -y`, both succeeded.
2. `node install-local.mjs inspect <config-dir>` (a first fresh `claude`
   process) → reported the durable manifest and `claude plugin list` showing
   `ambicode@ambicode-team`, version `0.3.0`, status enabled.
3. The candidate directory used for the install — a private temporary copy,
   never the developer's own `dist/` — was **deleted entirely**.
4. `claude plugin list` and `claude plugin details ambicode@ambicode-team`
   (further fresh `claude` processes, run *after* that deletion, none of
   them the one that performed the install) → still reported the plugin,
   and `details` reported **`Skills (4)  init, investigate, plan, review`**
   — confirming the durable installation survives the source candidate
   directory's removal, and confirms the four-skill namespace this
   candidate ships, without a model call.
5. `grep -rl "$(pwd)"` (this repository's own absolute path) across the
   isolated `CLAUDE_CONFIG_DIR`, and a same-scope `$HOME` search → both zero
   matches.
6. `node install-local.mjs uninstall <config-dir>` (without the deleted
   candidate directory existing) → ran `claude plugin uninstall
   ambicode@ambicode-team -s user -y` then `claude plugin marketplace remove
   ambicode-team`, both succeeded, then removed the
   `<config-dir>/ambicode-install/` directory it owns.
7. `claude plugin list` (a further fresh process) afterward → reported no
   installed plugins; the durable install directory no longer existed.

Separately, this session also manually verified `--scope project
--project-dir <dir>`: `claude plugin install ambicode@ambicode-team -s
project -y` wrote `enabledPlugins` into `<project-dir>/.claude/settings.json`
— not into this repository's own working directory, which had no `.claude/`
created — and `--scope project` without `--project-dir` is refused with an
explicit usage error rather than guessing the current working directory.

This demonstrates durable local installation from the packaged candidate,
outside the source checkout, surviving the deletion of the directory used
for install, exposing all four skills, and correctly scoping project/local
installs to an explicit target directory — the P2.2 correction A
requirement.

## Manual/fixed-case status (doc 07)

Unit tests do not satisfy the M-table or the I-/PL-tables (doc 07 is
explicit about this). Nothing below is claimed passed on the strength of a
unit test alone.

| ID | Status | Note |
| --- | --- | --- |
| M01–M04, M12 (packaged-install portion), M14 | **passed**, carried over unchanged from the prior P2.1 record | This session's changes (corrections A–E, P2.2) do not touch the code paths those rows exercise; the packaged-install portion of M12 is superseded by this session's fuller `smoke:install-local` evidence above rather than re-asserted separately. |
| M05–M11, M13 | **pending**, unchanged | Same external prerequisites as before: GitLab sandbox, browser, Docker daemon, Jira/Confluence MCP. See `docs/release-checklist.md`. |
| I01–I08 (P2.1 fixed investigation cases, doc 07) | **pending**, unchanged | Same prerequisites as the prior record: I01/I06 need only authorized model access; I02–I05/I07 additionally need a connected Jira/Confluence MCP server; I08 needs a project with a configured diagnostic command. None executed with real access this session. |
| PL01–PL10 (P2.2 fixed plan cases, doc 07) | **pending** | PL01 needs only authorized model access with the packaged skill loaded. PL02–PL05 additionally need a connected, authorized Jira/Confluence MCP server. PL06 needs a prior investigation (note or same-session). PL07–PL10 need only authorized model access. None were executed with real access in this environment; none is reported as passed. |
| E02 | **pending**, unchanged | Needs authorized, budgeted model access. |

## Dependency and license inventory

No new runtime dependency was added this session. `package.json`'s
`dependencies` list is unchanged from the prior record; `npm audit` reports
0 vulnerabilities as of this record. Two new TypeScript modules were added
(`src/contracts/requirements.ts`, `src/policy/provenance.ts`) and two
scripts (`install-local.smoke.mjs`, referenced by the new `npm run
smoke:install-local`); none of these are runtime dependencies and none
require an entry in document 11.

## Remaining limitations and prerequisites

Everything in `docs/compatibility.md`'s "Not available in this environment"
table still applies: no `glab`, no GitLab sandbox, no running container
runtime, no Jira/Confluence MCP, no authorized model access used this
session, no real browser exercise. Additionally:

- PL01–PL10 (P2.2's own fixed plan cases) and I01–I08 (P2.1's) have not been
  executed with real access; see the tables above for exactly which ones
  need what.
- No second developer has installed this candidate; see
  `docs/release-checklist.md`.
- The value gate remains pending, unchanged from the prior record — it needs
  a pilot owner and two real repositories, neither of which this environment
  has. This does not block P2.2's implementation, which document 04 and this
  session's task explicitly authorized to start regardless.
- `/ambicode:task` (P2.3) does not exist yet; a plan's "handoff information
  for `/ambicode:task`" is therefore unconsumed by any implemented skill —
  the content is produced but the receiving skill is future work.

## Phase decision

**Phase 1 is still not complete** (unchanged conclusion from the prior
record: M05–M11, M13 pending, value gate pending). **P2.1's corrections and
P2.2 are implemented** per document 04's explicit authorization to start
Phase 2 work despite the Phase 1 value gate being pending; their
manual/model-dependent cases (I01–I08, PL01–PL10) remain pending in the same
honest sense as Phase 1's own pending rows — implemented and unit tested,
not yet evaluated against real external services or authorized model
access.
